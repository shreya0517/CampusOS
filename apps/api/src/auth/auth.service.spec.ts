import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { AuthService, hashPassword, verifyPassword } from './auth.service';

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
  beforeAll(() => { process.env.AUTH_ACCESS_TOKEN_SECRET = 'test-secret-with-at-least-thirty-two-characters'; });

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

  it('rotates refresh sessions and rejects revoked refresh sessions', async () => {
    const database = createDatabase();
    database.authSession.findUnique.mockResolvedValue(activeSession);
    database.authSession.updateMany.mockResolvedValue({ count: 1 });
    const service = new AuthService(database as never);
    await expect(service.refresh('refresh-token')).resolves.toMatchObject({ accessToken: expect.any(String), refreshToken: expect.any(String) });
    expect(database.authSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ refreshTokenHash: expect.any(String) }), data: expect.objectContaining({ refreshTokenHash: expect.any(String) }) }));
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
});
