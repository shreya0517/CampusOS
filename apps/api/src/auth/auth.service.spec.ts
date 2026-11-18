import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { AuthService, hashPassword, LOGIN_FAILURE_LIMIT, RESET_REQUEST_LIMIT, verifyPassword } from './auth.service';
import { getAuthConfig } from './auth.config';

const activeUser = { id: 'user-1', collegeId: 'college-1', email: 'user@example.test', displayName: 'Test User', status: 'ACTIVE', emailVerifiedAt: new Date(), passwordHash: '' };
const activeSession = { id: 'session-1', collegeId: 'college-1', userId: 'user-1', refreshTokenHash: 'stored', expiresAt: new Date(Date.now() + 60_000), revokedAt: null, user: activeUser };

const createDatabase = () => ({
  college: { findUnique: jest.fn() },
  user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  authSession: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  emailVerificationToken: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  passwordResetToken: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  $transaction: jest.fn(),
});

describe('AuthService', () => {
  beforeAll(() => { process.env.AUTH_ACCESS_TOKEN_SECRET = 'test-secret-with-at-least-thirty-two-characters'; process.env.ALLOW_SELF_REGISTRATION = 'true'; });
  afterAll(() => { delete process.env.ALLOW_SELF_REGISTRATION; });

  it('hashes passwords with scrypt and verifies the correct password only', async () => {
    const hash = await hashPassword('a-strong-password');
    expect(hash).toMatch(/^scrypt\$/);
    await expect(verifyPassword('a-strong-password', hash)).resolves.toBe(true);
    await expect(verifyPassword('incorrect-password', hash)).resolves.toBe(false);
  });

  it('registers an account and stores only a password hash', async () => {
    const database = createDatabase();
    database.college.findUnique.mockResolvedValue({ id: 'college-1' });
    database.user.findUnique.mockResolvedValue(null);
    database.user.create.mockImplementation(async ({ data }) => ({ ...activeUser, ...data, emailVerifiedAt: null }));
    database.emailVerificationToken.create.mockResolvedValue({});
    const service = new AuthService(database as never);
    const log = jest.spyOn(console, 'info').mockImplementation();
    await expect(service.register({ collegeCode: 'DEMO', email: 'USER@example.test', displayName: 'Test User', password: 'a-strong-password' })).resolves.toMatchObject({ email: 'user@example.test', emailVerified: false });
    log.mockRestore();
    expect(database.user.create.mock.calls[0][0].data.passwordHash).not.toBe('a-strong-password');
  });

  it('refuses public sign-up unless ALLOW_SELF_REGISTRATION is true', async () => {
    const database = createDatabase();
    const service = new AuthService(database as never);
    for (const value of [undefined, 'false', '1']) {
      if (value === undefined) delete process.env.ALLOW_SELF_REGISTRATION;
      else process.env.ALLOW_SELF_REGISTRATION = value;
      await expect(service.register({ collegeCode: 'DEMO', email: 'user@example.test', displayName: 'Test User', password: 'a-strong-password' })).rejects.toMatchObject({ response: { code: 'REGISTRATION_DISABLED' } });
    }
    process.env.ALLOW_SELF_REGISTRATION = 'true';
    expect(database.college.findUnique).not.toHaveBeenCalled();
    expect(database.user.create).not.toHaveBeenCalled();
  });

  it('stops sign-in attempts on an account after too many failures, and clears the count on success', async () => {
    const database = createDatabase();
    database.college.findUnique.mockResolvedValue({ id: 'college-1' });
    database.user.findUnique.mockResolvedValue(null);
    const service = new AuthService(database as never);
    const attempt = (email = 'user@example.test') => service.login({ collegeCode: 'demo', email, password: 'wrong-password' });
    for (let i = 0; i < LOGIN_FAILURE_LIMIT; i += 1) await expect(attempt()).rejects.toBeInstanceOf(UnauthorizedException);
    // The next attempt is refused before the database is asked, whatever the password.
    database.user.findUnique.mockClear();
    await expect(attempt(' USER@example.test ')).rejects.toMatchObject({ status: 429, response: { code: 'TOO_MANY_ATTEMPTS' } });
    expect(database.user.findUnique).not.toHaveBeenCalled();
    // Another account isn't affected.
    await expect(attempt('other@example.test')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('counts sign-in attempts as they arrive, so a concurrent burst cannot get past the limit', async () => {
    const database = createDatabase();
    database.college.findUnique.mockResolvedValue({ id: 'college-1' });
    database.user.findUnique.mockResolvedValue(null);
    const service = new AuthService(database as never);
    const burst = await Promise.allSettled(Array.from({ length: LOGIN_FAILURE_LIMIT + 5 }, () => service.login({ collegeCode: 'DEMO', email: 'burst@example.test', password: 'wrong-password' })));
    const refused = burst.filter((outcome) => outcome.status === 'rejected' && (outcome.reason as { status?: number }).status === 429);
    expect(refused).toHaveLength(5);
    expect(database.user.findUnique).toHaveBeenCalledTimes(LOGIN_FAILURE_LIMIT);
  });

  it('limits password reset requests per account, whether or not it exists', async () => {
    const database = createDatabase();
    database.college.findUnique.mockResolvedValue(null);
    const service = new AuthService(database as never);
    for (let i = 0; i < RESET_REQUEST_LIMIT; i += 1) await expect(service.requestPasswordReset({ collegeCode: 'DEMO', email: 'nobody@example.test' })).resolves.toBeUndefined();
    await expect(service.requestPasswordReset({ collegeCode: 'DEMO', email: 'nobody@example.test' })).rejects.toMatchObject({ status: 429 });
  });

  it('logs development tokens only with AUTH_LOG_TOKENS, and never in production', () => {
    const env = { ...process.env };
    try {
      delete process.env.AUTH_LOG_TOKENS;
      expect(getAuthConfig().logTokens).toBe(false);
      process.env.AUTH_LOG_TOKENS = 'true';
      expect(getAuthConfig().logTokens).toBe(true);
      process.env.NODE_ENV = 'production';
      expect(getAuthConfig().logTokens).toBe(false);
    } finally {
      process.env = env;
    }
  });

  it('rejects invalid registration input before persistence', async () => {
    const database = createDatabase();
    const service = new AuthService(database as never);
    await expect(service.register({ collegeCode: 'DEMO', email: 'not-an-email', displayName: 'A', password: 'short' })).rejects.toBeInstanceOf(BadRequestException);
    expect(database.user.create).not.toHaveBeenCalled();
  });

  it('creates a session for valid verified credentials and rejects invalid or unverified credentials', async () => {
    const database = createDatabase();
    const passwordHash = await hashPassword('a-strong-password');
    database.college.findUnique.mockResolvedValue({ id: 'college-1' });
    database.user.findUnique.mockResolvedValue({ ...activeUser, passwordHash });
    database.authSession.create.mockResolvedValue(activeSession);
    const service = new AuthService(database as never);
    await expect(service.login({ collegeCode: 'DEMO', email: activeUser.email, password: 'a-strong-password' })).resolves.toMatchObject({ user: { id: activeUser.id }, refreshToken: expect.any(String) });
    await expect(service.login({ collegeCode: 'DEMO', email: activeUser.email, password: 'wrong-password' })).rejects.toBeInstanceOf(UnauthorizedException);
    database.user.findUnique.mockResolvedValue({ ...activeUser, passwordHash, emailVerifiedAt: null });
    await expect(service.login({ collegeCode: 'DEMO', email: activeUser.email, password: 'a-strong-password' })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('requires an active, non-revoked, non-expired session for access tokens', async () => {
    const database = createDatabase();
    database.authSession.findUnique.mockResolvedValue(activeSession);
    const service = new AuthService(database as never);
    const token = (service as unknown as { createAccessToken(sub: string, collegeId: string, sid: string): string }).createAccessToken(activeUser.id, activeUser.collegeId, activeSession.id);
    await expect(service.authorizeAccessToken(token)).resolves.toMatchObject({ id: activeUser.id });
    database.authSession.findUnique.mockResolvedValue({ ...activeSession, revokedAt: new Date() });
    await expect(service.authorizeAccessToken(token)).rejects.toBeInstanceOf(UnauthorizedException);
    database.authSession.findUnique.mockResolvedValue({ ...activeSession, expiresAt: new Date(Date.now() - 1) });
    await expect(service.authorizeAccessToken(token)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.authorizeAccessToken('invalid.token.value')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('revokes the session when an old refresh token is replayed, but not for a parallel refresh moments after rotation', async () => {
    const database = createDatabase();
    const service = new AuthService(database as never);
    // The presented token is no session's current one, but it is one session's previous token.
    database.authSession.findUnique.mockImplementation(({ where }: { where: { refreshTokenHash?: string; previousRefreshTokenHash?: string } }) =>
      Promise.resolve(where.previousRefreshTokenHash ? { id: 'session-1', rotatedAt: new Date(Date.now() - 5 * 60_000), revokedAt: null } : null),
    );
    await expect(service.refresh('stolen-token')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(database.authSession.updateMany).toHaveBeenCalledWith({ where: { id: 'session-1', revokedAt: null }, data: { revokedAt: expect.any(Date) } });

    database.authSession.updateMany.mockClear();
    database.authSession.findUnique.mockImplementation(({ where }: { where: { previousRefreshTokenHash?: string } }) =>
      Promise.resolve(where.previousRefreshTokenHash ? { id: 'session-1', rotatedAt: new Date(Date.now() - 2_000), revokedAt: null } : null),
    );
    await expect(service.refresh('other-tab-token')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(database.authSession.updateMany).not.toHaveBeenCalled();

    // An unknown token revokes nothing.
    database.authSession.findUnique.mockResolvedValue(null);
    await expect(service.refresh('garbage')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(database.authSession.updateMany).not.toHaveBeenCalled();
  });

  it('rotates refresh sessions and rejects revoked refresh sessions', async () => {
    const database = createDatabase();
    database.authSession.findUnique.mockResolvedValue(activeSession);
    database.authSession.updateMany.mockResolvedValue({ count: 1 });
    const service = new AuthService(database as never);
    await expect(service.refresh('refresh-token')).resolves.toMatchObject({ accessToken: expect.any(String), refreshToken: expect.any(String) });
    expect(database.authSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ refreshTokenHash: expect.any(String) }), data: expect.objectContaining({ refreshTokenHash: expect.any(String) }) }));
    // The token just used is kept as the previous one, with the time, so presenting it again is recognised.
    const rotation = database.authSession.updateMany.mock.calls[0][0] as { where: { refreshTokenHash: string }; data: { previousRefreshTokenHash: string; rotatedAt: Date } };
    expect(rotation.data.previousRefreshTokenHash).toBe(rotation.where.refreshTokenHash);
    expect(rotation.data.rotatedAt).toBeInstanceOf(Date);
    database.authSession.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.refresh('refresh-token')).rejects.toBeInstanceOf(UnauthorizedException);
    database.authSession.findUnique.mockResolvedValue({ ...activeSession, revokedAt: new Date() });
    await expect(service.refresh('refresh-token')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('revokes sessions on logout and password reset so old access tokens are rejected', async () => {
    const database = createDatabase();
    database.authSession.updateMany.mockResolvedValue({ count: 1 });
    database.passwordResetToken.findUnique.mockResolvedValue({ id: 'reset-1', collegeId: activeUser.collegeId, userId: activeUser.id, usedAt: null, expiresAt: new Date(Date.now() + 60_000) });
    database.user.update.mockResolvedValue(activeUser);
    database.passwordResetToken.update.mockResolvedValue({});
    database.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });
    database.$transaction.mockImplementation(async (callback) => callback(database));
    const service = new AuthService(database as never);
    await service.logout('refresh-token');
    await service.resetPassword({ token: 'reset-token', password: 'a-new-strong-password' });
    expect(database.authSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { revokedAt: expect.any(Date) } }));
    database.authSession.findUnique.mockResolvedValue({ ...activeSession, revokedAt: new Date() });
    const token = (service as unknown as { createAccessToken(sub: string, collegeId: string, sid: string): string }).createAccessToken(activeUser.id, activeUser.collegeId, activeSession.id);
    await expect(service.authorizeAccessToken(token)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('consumes valid verification tokens and rejects invalid verification or reset tokens', async () => {
    const database = createDatabase();
    database.emailVerificationToken.findUnique.mockResolvedValue({ id: 'verify-1', collegeId: activeUser.collegeId, userId: activeUser.id, usedAt: null, expiresAt: new Date(Date.now() + 60_000) });
    database.user.update.mockResolvedValue(activeUser);
    database.emailVerificationToken.update.mockResolvedValue({});
    database.emailVerificationToken.updateMany.mockResolvedValue({ count: 1 });
    database.$transaction.mockImplementation(async (callback) => callback(database));
    const service = new AuthService(database as never);
    await expect(service.verifyEmail('verification-token')).resolves.toBeUndefined();
    database.emailVerificationToken.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.verifyEmail('verification-token')).rejects.toBeInstanceOf(BadRequestException);
    database.emailVerificationToken.findUnique.mockResolvedValue(null);
    await expect(service.verifyEmail('invalid-token')).rejects.toBeInstanceOf(BadRequestException);
    database.passwordResetToken.findUnique.mockResolvedValue(null);
    await expect(service.resetPassword({ token: 'invalid-reset', password: 'a-new-strong-password' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates a reset record for an existing account and remains silent for unknown accounts', async () => {
    const database = createDatabase();
    database.college.findUnique.mockResolvedValue({ id: activeUser.collegeId });
    database.user.findUnique.mockResolvedValue(activeUser);
    database.passwordResetToken.create.mockResolvedValue({});
    const service = new AuthService(database as never);
    await expect(service.requestPasswordReset({ collegeCode: 'DEMO', email: activeUser.email })).resolves.toBeUndefined();
    expect(database.passwordResetToken.create).toHaveBeenCalled();
    database.user.findUnique.mockResolvedValue(null);
    await expect(service.requestPasswordReset({ collegeCode: 'DEMO', email: 'missing@example.test' })).resolves.toBeUndefined();
  });

  describe('changePassword', () => {
    const setup = async () => {
      const database = createDatabase();
      database.user.findUnique.mockResolvedValue({ ...activeUser, passwordHash: await hashPassword('current-password-123') });
      database.$transaction.mockImplementation(async (callback) => callback(database));
      const service = new AuthService(database as never);
      const token = (service as unknown as { createAccessToken(sub: string, collegeId: string, sid: string): string }).createAccessToken(activeUser.id, activeUser.collegeId, activeSession.id);
      return { database, service, token };
    };

    it('rejects a wrong current password with 400 and changes nothing', async () => {
      const { database, service, token } = await setup();
      await expect(service.changePassword(token, { currentPassword: 'wrong-password-123', newPassword: 'another-strong-password' })).rejects.toMatchObject({ response: { code: 'INVALID_CURRENT_PASSWORD' } });
      expect(database.user.update).not.toHaveBeenCalled();
    });

    it('rejects a short or unchanged new password', async () => {
      const { database, service, token } = await setup();
      await expect(service.changePassword(token, { currentPassword: 'current-password-123', newPassword: 'short' })).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.changePassword(token, { currentPassword: 'current-password-123', newPassword: 'current-password-123' })).rejects.toBeInstanceOf(BadRequestException);
      expect(database.user.update).not.toHaveBeenCalled();
    });

    it('stores a new hash and signs out every other session but the current one', async () => {
      const { database, service, token } = await setup();
      await service.changePassword(token, { currentPassword: 'current-password-123', newPassword: 'another-strong-password' });
      const stored = database.user.update.mock.calls[0][0].data.passwordHash as string;
      expect(stored).not.toBe('another-strong-password');
      await expect(verifyPassword('another-strong-password', stored)).resolves.toBe(true);
      expect(database.authSession.updateMany).toHaveBeenCalledWith({ where: { collegeId: activeUser.collegeId, userId: activeUser.id, revokedAt: null, id: { not: activeSession.id } }, data: { revokedAt: expect.any(Date) } });
    });

    it('rejects a forged access token', async () => {
      const { service } = await setup();
      await expect(service.changePassword('invalid.token.value', { currentPassword: 'current-password-123', newPassword: 'another-strong-password' })).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
