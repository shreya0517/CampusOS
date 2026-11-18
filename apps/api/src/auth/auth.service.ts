import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { DatabaseService } from '../database.service';
import { getAuthConfig } from './auth.config';
import { AttemptLimiter } from './attempt-limiter';
import type { ChangePasswordDto, ForgotPasswordDto, LoginDto, RegisterDto, ResetPasswordDto } from './auth.dto';

const scrypt = promisify(scryptCallback);
const genericCredentialsError = new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Invalid credentials.' });

/** Failed sign-ins allowed per account in the window before further attempts are refused until it passes. */
export const LOGIN_FAILURE_LIMIT = 10;
export const LOGIN_FAILURE_WINDOW_MS = 15 * 60_000;
/** Password-reset requests allowed per account per hour. */
export const RESET_REQUEST_LIMIT = 5;
export const RESET_REQUEST_WINDOW_MS = 60 * 60_000;

/** One key per account: the college code and email as typed, normalised. */
const accountKey = (collegeCode: string, email: string): string => `${collegeCode.trim().toUpperCase()}|${email.trim().toLowerCase()}`;
const tooMany = (retryAfterMs: number, what: string): never => {
  const minutes = Math.ceil(retryAfterMs / 60_000);
  throw new HttpException(
    { code: 'TOO_MANY_ATTEMPTS', message: `Too many ${what}. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`, retryAfterSeconds: Math.ceil(retryAfterMs / 1000) },
    HttpStatus.TOO_MANY_REQUESTS,
  );
};

/**
 * A refresh token presented again after its session moved on is a replay: someone else may hold it. Within this many
 * milliseconds of the rotation it is treated as another tab refreshing at the same moment and only refused; after
 * that the session is revoked.
 */
export const REFRESH_REUSE_GRACE_MS = 30_000;

export type PublicUser = { id: string; collegeId: string; email: string; displayName: string; emailVerified: boolean; roles: string[] };
type SessionResult = { accessToken: string; refreshToken: string; user: PublicUser };

@Injectable()
export class AuthService {
  // Per account, not per IP: behind a proxy every user can share one IP, so an IP limit would lock everyone out.
  private readonly loginFailures = new AttemptLimiter(LOGIN_FAILURE_LIMIT, LOGIN_FAILURE_WINDOW_MS);
  private readonly resetRequests = new AttemptLimiter(RESET_REQUEST_LIMIT, RESET_REQUEST_WINDOW_MS);

  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  /**
   * Public sign-up, off by default: Admins create student and faculty accounts, and a self-registered account would
   * have no role anyway. Set ALLOW_SELF_REGISTRATION=true to turn it on.
   */
  async register(input: RegisterDto): Promise<PublicUser> {
    if (!getAuthConfig().allowSelfRegistration) {
      throw new ForbiddenException({ code: 'REGISTRATION_DISABLED', message: 'Accounts are created by your college administrator.' });
    }
    this.validateRegistration(input);
    const college = await this.database.college.findUnique({ where: { code: input.collegeCode } });
    if (!college) throw new BadRequestException({ code: 'INVALID_COLLEGE', message: 'Invalid registration details.' });
    const email = input.email.trim().toLowerCase();
    const existing = await this.database.user.findUnique({ where: { collegeId_email: { collegeId: college.id, email } } });
    if (existing) throw new ConflictException({ code: 'ACCOUNT_EXISTS', message: 'An account already exists for this email.' });
    const user = await this.database.user.create({ data: { collegeId: college.id, email, displayName: input.displayName.trim(), passwordHash: await hashPassword(input.password) } });
    const verificationToken = await this.createVerificationToken(user.collegeId, user.id);
    this.logDevelopmentVerification(email, verificationToken);
    return toPublicUser(user);
  }

  /**
   * After LOGIN_FAILURE_LIMIT failed attempts on one account within the window, further attempts on it are refused
   * with 429 until the window passes, even with the right password. A successful sign-in clears the count.
   *
   * Each attempt is counted as it arrives, before any database work, so a burst of concurrent requests can't all get
   * past the check; a successful one then clears the count.
   */
  async login(input: LoginDto): Promise<SessionResult> {
    if (!isNonEmpty(input.collegeCode) || !isEmail(input.email) || !isNonEmpty(input.password)) throw genericCredentialsError;
    const key = accountKey(input.collegeCode, input.email);
    const wait = this.loginFailures.take(key);
    if (wait) tooMany(wait, 'failed sign-in attempts');
    const failed = (): never => {
      throw genericCredentialsError;
    };
    const college = await this.database.college.findUnique({ where: { code: input.collegeCode.trim() } });
    if (!college) return failed();
    const user = await this.database.user.findUnique({
      where: { collegeId_email: { collegeId: college.id, email: input.email.trim().toLowerCase() } },
      include: { userRoles: { include: { role: true } }, studentProfiles: true, facultyProfiles: true },
    });
    if (!user || user.status !== 'ACTIVE' || !user.passwordHash || !user.emailVerifiedAt || !(await verifyPassword(input.password, user.passwordHash))) return failed();
    this.loginFailures.reset(key);
    return this.createSession(user);
  }

  async refresh(rawToken: string | undefined): Promise<SessionResult> {
    if (!rawToken) throw new UnauthorizedException({ code: 'SESSION_EXPIRED', message: 'Session expired.' });
    const presented = hashToken(rawToken);
    const session = await this.database.authSession.findUnique({
      where: { refreshTokenHash: presented },
      include: { user: { include: { userRoles: { include: { role: true } }, studentProfiles: true, facultyProfiles: true } } },
    });
    if (!session) {
      await this.revokeOnReuse(presented);
      throw new UnauthorizedException({ code: 'SESSION_EXPIRED', message: 'Session expired.' });
    }
    if (session.revokedAt || session.expiresAt <= new Date() || session.user.status !== 'ACTIVE' || !session.user.emailVerifiedAt) throw new UnauthorizedException({ code: 'SESSION_EXPIRED', message: 'Session expired.' });
    const refreshToken = randomToken();
    const rotation = await this.database.authSession.updateMany({
      where: { id: session.id, refreshTokenHash: presented, revokedAt: null },
      // The old token is kept as the previous one, so presenting it again later is recognised as a reuse.
      data: { refreshTokenHash: hashToken(refreshToken), previousRefreshTokenHash: presented, rotatedAt: new Date() },
    });
    if (rotation.count !== 1) throw new UnauthorizedException({ code: 'SESSION_EXPIRED', message: 'Session expired.' });
    return { accessToken: this.createAccessToken(session.user.id, session.user.collegeId, session.id), refreshToken, user: toPublicUser(session.user) };
  }

  /**
   * A token that was already rotated away is being presented again. Unless that happened moments ago (another tab
   * refreshing at the same time), it may have been stolen, so the whole session is revoked: both the thief and the
   * owner have to sign in again.
   */
  private async revokeOnReuse(presentedHash: string): Promise<void> {
    const rotated = await this.database.authSession.findUnique({ where: { previousRefreshTokenHash: presentedHash }, select: { id: true, rotatedAt: true, revokedAt: true } });
    if (!rotated || rotated.revokedAt) return;
    if (rotated.rotatedAt && Date.now() - rotated.rotatedAt.getTime() <= REFRESH_REUSE_GRACE_MS) return;
    await this.database.authSession.updateMany({ where: { id: rotated.id, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  /**
   * Checks a signed-in session is still valid (not revoked or expired, user active and verified) without an access
   * token, for long-lived connections such as sockets that outlive the token they connected with.
   */
  async authorizeSession(sessionId: string, userId: string, collegeId: string): Promise<PublicUser> {
    return this.authorizeAccessPayload({ sub: userId, collegeId, sid: sessionId, exp: 0 });
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (rawToken) await this.database.authSession.updateMany({ where: { refreshTokenHash: hashToken(rawToken), revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async currentUser(payload: AccessPayload): Promise<PublicUser> {
    return this.authorizeAccessPayload(payload);
  }

  async authorizeAccessToken(token: string): Promise<PublicUser> { return this.authorizeAccessPayload(this.verifyAccessToken(token)); }

  async verifyEmail(token: string): Promise<void> {
    const record = await this.database.emailVerificationToken.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!record || record.usedAt || record.expiresAt <= new Date()) throw new BadRequestException({ code: 'INVALID_TOKEN', message: 'Verification link is invalid or expired.' });
    await this.database.$transaction(async (transaction) => {
      const consumption = await transaction.emailVerificationToken.updateMany({
        where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (consumption.count !== 1) throw new BadRequestException({ code: 'INVALID_TOKEN', message: 'Verification link is invalid or expired.' });
      await transaction.user.update({ where: { collegeId_id: { collegeId: record.collegeId, id: record.userId } }, data: { emailVerifiedAt: new Date() } });
    });
  }

  /** Limited per account (RESET_REQUEST_LIMIT an hour), whether or not the account exists, so the limit reveals nothing. */
  async requestPasswordReset(input: ForgotPasswordDto): Promise<void> {
    if (!isNonEmpty(input.collegeCode) || !isEmail(input.email)) return;
    const wait = this.resetRequests.take(accountKey(input.collegeCode, input.email));
    if (wait) tooMany(wait, 'password reset requests');
    const college = await this.database.college.findUnique({ where: { code: input.collegeCode.trim() } });
    const user = college ? await this.database.user.findUnique({ where: { collegeId_email: { collegeId: college.id, email: input.email.trim().toLowerCase() } } }) : null;
    if (user) {
      const resetToken = await this.createPasswordResetToken(user.collegeId, user.id);
      this.logDevelopmentPasswordReset(user.email, resetToken);
    }
  }

  async resetPassword(input: ResetPasswordDto): Promise<void> {
    if (!isNonEmpty(input.token) || !isStrongPassword(input.password)) throw new BadRequestException({ code: 'INVALID_RESET', message: 'Reset link or password is invalid.' });
    const record = await this.database.passwordResetToken.findUnique({ where: { tokenHash: hashToken(input.token) } });
    if (!record || record.usedAt || record.expiresAt <= new Date()) throw new BadRequestException({ code: 'INVALID_RESET', message: 'Reset link or password is invalid.' });
    const passwordHash = await hashPassword(input.password);
    await this.database.$transaction(async (transaction) => {
      const consumption = await transaction.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (consumption.count !== 1) throw new BadRequestException({ code: 'INVALID_RESET', message: 'Reset link or password is invalid.' });
      await transaction.user.update({ where: { collegeId_id: { collegeId: record.collegeId, id: record.userId } }, data: { passwordHash } });
      await transaction.authSession.updateMany({ where: { collegeId: record.collegeId, userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } });
    });
  }

  /**
   * Changes the signed-in user's password and signs out every other session, keeping the one making
   * the request. A wrong current password is a 400, not a 401, so clients don't treat it as an expired session.
   */
  async changePassword(accessToken: string, input: ChangePasswordDto): Promise<void> {
    const payload = this.verifyAccessToken(accessToken);
    const user = await this.database.user.findUnique({ where: { collegeId_id: { collegeId: payload.collegeId, id: payload.sub } } });
    if (!user?.passwordHash || !(await verifyPassword(input.currentPassword, user.passwordHash))) throw new BadRequestException({ code: 'INVALID_CURRENT_PASSWORD', message: 'Current password is incorrect.' });
    if (!isStrongPassword(input.newPassword) || input.newPassword === input.currentPassword) throw new BadRequestException({ code: 'INVALID_NEW_PASSWORD', message: 'Choose a new password of at least 12 characters that is different from the current one.' });
    const passwordHash = await hashPassword(input.newPassword);
    await this.database.$transaction(async (transaction) => {
      await transaction.user.update({ where: { collegeId_id: { collegeId: payload.collegeId, id: payload.sub } }, data: { passwordHash } });
      await transaction.authSession.updateMany({ where: { collegeId: payload.collegeId, userId: payload.sub, revokedAt: null, id: { not: payload.sid } }, data: { revokedAt: new Date() } });
    });
  }

  verifyAccessToken(token: string): AccessPayload {
    const [encodedHeader, encodedPayload, signature] = token.split('.');
    const expected = sign(`${encodedHeader}.${encodedPayload}`);
    if (!encodedHeader || !encodedPayload || !signature || !safeEqual(signature, expected)) throw genericCredentialsError;
    try {
      const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as AccessPayload;
      if (!payload.sub || !payload.collegeId || !payload.sid || !Number.isInteger(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) throw genericCredentialsError;
      return payload;
    } catch {
      throw genericCredentialsError;
    }
  }

  private async createSession(user: { id: string; collegeId: string; email: string; displayName: string; emailVerifiedAt: Date | null; userRoles?: Array<{ role: { name: string } }>; studentProfiles?: Array<{ id: string }>; facultyProfiles?: Array<{ id: string }> }): Promise<SessionResult> {
    const refreshToken = randomToken();
    const session = await this.database.authSession.create({ data: { collegeId: user.collegeId, userId: user.id, refreshTokenHash: hashToken(refreshToken), expiresAt: new Date(Date.now() + getAuthConfig().refreshTokenTtlDays * 86_400_000) } });
    return { accessToken: this.createAccessToken(user.id, user.collegeId, session.id), refreshToken, user: toPublicUser(user) };
  }
  private createAccessToken(sub: string, collegeId: string, sid: string): string {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub, collegeId, sid, exp: Math.floor(Date.now() / 1000) + getAuthConfig().accessTokenTtlSeconds })).toString('base64url');
    return `${header}.${payload}.${sign(`${header}.${payload}`)}`;
  }
  private async createVerificationToken(collegeId: string, userId: string): Promise<string> { const token = randomToken(); await this.database.emailVerificationToken.create({ data: { collegeId, userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 86_400_000) } }); return token; }
  private async createPasswordResetToken(collegeId: string, userId: string): Promise<string> { const token = randomToken(); await this.database.passwordResetToken.create({ data: { collegeId, userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 3_600_000) } }); return token; }
  private validateRegistration(input: RegisterDto): void { if (!isNonEmpty(input.collegeCode) || !isEmail(input.email) || !isStrongPassword(input.password) || input.displayName.trim().length < 2) throw new BadRequestException({ code: 'INVALID_INPUT', message: 'Registration details are invalid.' }); }
  private async authorizeAccessPayload(payload: AccessPayload): Promise<PublicUser> {
    const session = await this.database.authSession.findUnique({
      where: { id: payload.sid },
      include: { user: { include: { userRoles: { include: { role: true } }, studentProfiles: true, facultyProfiles: true } } },
    });
    if (!session || session.collegeId !== payload.collegeId || session.userId !== payload.sub || session.revokedAt || session.expiresAt <= new Date() || session.user.status !== 'ACTIVE' || !session.user.emailVerifiedAt) throw new UnauthorizedException({ code: 'SESSION_EXPIRED', message: 'Session expired.' });
    return toPublicUser(session.user);
  }
  private logDevelopmentVerification(email: string, token: string): void { if (getAuthConfig().logTokens) console.info(`[CampusOS development] Verify ${email}: POST /api/v1/auth/verify-email with {"token":"${token}"}`); }
  private logDevelopmentPasswordReset(email: string, token: string): void { if (getAuthConfig().logTokens) console.info(`[CampusOS development] Reset password for ${email}: POST /api/v1/auth/reset-password with {"token":"${token}","password":"<new password>"}`); }
}

export type AccessPayload = { sub: string; collegeId: string; sid: string; exp: number };
export const parseCookies = (value?: string): Record<string, string> => Object.fromEntries((value ?? '').split(';').map((item) => item.trim().split('=').map(decodeURIComponent)).filter(([key, item]) => key && item));
const isNonEmpty = (value: string): boolean => typeof value === 'string' && value.trim().length > 0;
const isEmail = (value: string): boolean => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
const isStrongPassword = (value: string): boolean => typeof value === 'string' && value.length >= 12;
const randomToken = (): string => randomBytes(32).toString('base64url');
const hashToken = (value: string): string => createHmac('sha256', getAuthConfig().accessTokenSecret).update(value).digest('hex');
const sign = (value: string): string => createHmac('sha256', getAuthConfig().accessTokenSecret).update(value).digest('base64url');
const safeEqual = (left: string, right: string): boolean => left.length === right.length && timingSafeEqual(Buffer.from(left), Buffer.from(right));
export const hashPassword = async (password: string): Promise<string> => { const salt = randomBytes(16); const derived = await scrypt(password, salt, 64) as Buffer; return `scrypt$${salt.toString('base64url')}$${derived.toString('base64url')}`; };
export const verifyPassword = async (password: string, encoded: string): Promise<boolean> => { const [, saltValue, hashValue] = encoded.split('$'); if (!saltValue || !hashValue) return false; const derived = await scrypt(password, Buffer.from(saltValue, 'base64url'), 64) as Buffer; return safeEqual(derived.toString('base64url'), hashValue); };
const toPublicUser = (user: {
  id: string;
  collegeId: string;
  email: string;
  displayName: string;
  emailVerifiedAt: Date | null;
  userRoles?: Array<{ role: { name: string } }>;
  studentProfiles?: Array<{ id: string }>;
  facultyProfiles?: Array<{ id: string }>;
}): PublicUser => {
  const roleSet = new Set<string>();
  if (user.userRoles) {
    for (const ur of user.userRoles) {
      if (ur.role?.name) roleSet.add(ur.role.name);
    }
  }
  if (roleSet.size === 0) {
    if (user.studentProfiles && user.studentProfiles.length > 0) roleSet.add('STUDENT');
    if (user.facultyProfiles && user.facultyProfiles.length > 0) roleSet.add('FACULTY');
  }
  return {
    id: user.id,
    collegeId: user.collegeId,
    email: user.email,
    displayName: user.displayName,
    emailVerified: Boolean(user.emailVerifiedAt),
    roles: Array.from(roleSet),
  };
};
