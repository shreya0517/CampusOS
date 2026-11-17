import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DatabaseService } from '../database.service';
import { AccessAuthGuard } from './access-auth.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

process.env.AUTH_ACCESS_TOKEN_SECRET = 'integration-test-secret-with-at-least-thirty-two-characters';

type User = { id: string; collegeId: string; email: string; displayName: string; passwordHash: string; emailVerifiedAt: Date | null; status: 'ACTIVE' };
type Session = { id: string; collegeId: string; userId: string; refreshTokenHash: string; expiresAt: Date; revokedAt: Date | null };
type Token = { id: string; collegeId: string; userId: string; tokenHash: string; expiresAt: Date; usedAt: Date | null };

class MemoryDatabase {
  private sequence = 0;
  private readonly users = new Map<string, User>();
  private readonly sessions = new Map<string, Session>();
  private readonly verificationTokens = new Map<string, Token>();
  private readonly resetTokens = new Map<string, Token>();
  college = { findUnique: async ({ where }: { where: { code: string } }) => where.code === 'DEMO' ? { id: 'college-1', code: 'DEMO' } : null };
  user = {
    findUnique: async ({ where }: { where: { collegeId_email?: { collegeId: string; email: string }; collegeId_id?: { collegeId: string; id: string } } }) => {
      const lookup = where.collegeId_email ? [...this.users.values()].find((user) => user.collegeId === where.collegeId_email?.collegeId && user.email === where.collegeId_email?.email) : [...this.users.values()].find((user) => user.collegeId === where.collegeId_id?.collegeId && user.id === where.collegeId_id?.id);
      return lookup ?? null;
    },
    create: async ({ data }: { data: Omit<User, 'id' | 'emailVerifiedAt' | 'status'> }) => { const user: User = { ...data, id: this.id('user'), emailVerifiedAt: null, status: 'ACTIVE' }; this.users.set(user.id, user); return user; },
    update: async ({ where, data }: { where: { collegeId_id: { collegeId: string; id: string } }; data: Partial<User> }) => { const user = this.users.get(where.collegeId_id.id); if (!user) throw new Error('missing user'); Object.assign(user, data); return user; },
  };
  authSession = {
    findUnique: async ({ where }: { where: { id?: string; refreshTokenHash?: string }; include?: { user: boolean } }) => { const session = [...this.sessions.values()].find((item) => item.id === where.id || item.refreshTokenHash === where.refreshTokenHash); return session ? { ...session, user: this.users.get(session.userId)! } : null; },
    create: async ({ data }: { data: Omit<Session, 'id' | 'revokedAt'> }) => { const session: Session = { ...data, id: this.id('session'), revokedAt: null }; this.sessions.set(session.id, session); return session; },
    update: async ({ where, data }: { where: { id: string }; data: Partial<Session> }) => { const session = this.sessions.get(where.id)!; Object.assign(session, data); return session; },
    updateMany: async ({ where, data }: { where: Partial<Session>; data: Partial<Session> }) => { let count = 0; for (const session of this.sessions.values()) if (Object.entries(where).every(([key, value]) => (session as never)[key] === value)) { Object.assign(session, data); count += 1; } return { count }; },
  };
  emailVerificationToken = this.tokenStore(this.verificationTokens);
  passwordResetToken = this.tokenStore(this.resetTokens);
  $transaction = async <T>(callback: (transaction: this) => Promise<T>): Promise<T> => callback(this);
  rawVerificationToken(): string { return this.lastToken; }
  expireLatestSession(): void { const session = [...this.sessions.values()].at(-1); if (session) session.expiresAt = new Date(Date.now() - 1); }
  private lastToken = '';
  private tokenStore(store: Map<string, Token>) { return {
    create: async ({ data }: { data: Omit<Token, 'id' | 'usedAt'> }) => { const token: Token = { ...data, id: this.id('token'), usedAt: null }; store.set(token.id, token); this.lastToken = data.tokenHash; return token; },
    findUnique: async ({ where }: { where: { tokenHash: string } }) => [...store.values()].find((token) => token.tokenHash === where.tokenHash) ?? null,
    update: async ({ where, data }: { where: { id: string }; data: Partial<Token> }) => { const token = store.get(where.id)!; Object.assign(token, data); return token; },
    updateMany: async ({ where, data }: { where: { id: string; usedAt: null; expiresAt: { gt: Date } }; data: Partial<Token> }) => {
      const token = store.get(where.id);
      if (!token || token.usedAt !== where.usedAt || token.expiresAt <= where.expiresAt.gt) return { count: 0 };
      Object.assign(token, data);
      return { count: 1 };
    },
  }; }
  private id(prefix: string): string { this.sequence += 1; return `${prefix}-${this.sequence}`; }
}

describe('Auth HTTP integration', () => {
  let app: INestApplication;
  let database: MemoryDatabase;
  let verificationToken = '';
  const credentials = { collegeCode: 'DEMO', email: 'learner@example.test', password: 'a-strong-password', displayName: 'Learner' };
  beforeAll(async () => {
    database = new MemoryDatabase();
    const module = await Test.createTestingModule({ controllers: [AuthController], providers: [AuthService, AccessAuthGuard, { provide: DatabaseService, useValue: database }] }).compile();
    app = module.createNestApplication(); app.setGlobalPrefix('api/v1'); await app.init();
  });
  afterAll(async () => { await app.close(); });

  it('registers with the real service and rejects malformed registration', async () => {
    const log = jest.spyOn(console, 'info').mockImplementation((message: string) => { verificationToken = message.match(/"token":"([^"]+)"/)?.[1] ?? ''; });
    await request(app.getHttpServer()).post('/api/v1/auth/register').send(credentials).expect(201).expect(({ body }) => expect(body.user.emailVerified).toBe(false));
    log.mockRestore();
    expect(verificationToken).toBeTruthy();
    await request(app.getHttpServer()).post('/api/v1/auth/register').send({ ...credentials, email: 42 }).expect(400).expect(({ body }) => expect(body.code).toBe('INVALID_INPUT'));
  });

  it('rejects unverified login, verifies locally, then logs in and protects the current-user route', async () => {
    await request(app.getHttpServer()).post('/api/v1/auth/login').send(credentials).expect(401);
    await request(app.getHttpServer()).post('/api/v1/auth/verify-email').send({ token: verificationToken }).expect(204);
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send(credentials).expect(200).expect('Set-Cookie', /HttpOnly/);
    const accessToken = login.body.accessToken as string;
    await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
    await request(app.getHttpServer()).get('/api/v1/auth/me').set('Authorization', `Bearer ${accessToken}`).expect(200).expect(({ body }) => expect(body.user.email).toBe(credentials.email));
    await request(app.getHttpServer()).get('/api/v1/auth/me').set('Authorization', 'Bearer invalid.token.value').expect(401);
  });

  it('rotates refresh cookies, rejects expired sessions, and revokes access immediately on logout', async () => {
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send(credentials).expect(200);
    const firstCookie = login.headers['set-cookie']?.[0];
    if (!firstCookie) throw new Error('Expected a refresh cookie.');
    const accessToken = login.body.accessToken as string;
    const refreshed = await request(app.getHttpServer()).post('/api/v1/auth/refresh').set('Cookie', firstCookie).expect(200);
    const rotatedCookie = refreshed.headers['set-cookie']?.[0];
    if (!rotatedCookie) throw new Error('Expected a rotated refresh cookie.');
    expect(rotatedCookie).not.toBe(firstCookie);
    await request(app.getHttpServer()).post('/api/v1/auth/logout').set('Cookie', rotatedCookie).expect(204);
    await request(app.getHttpServer()).get('/api/v1/auth/me').set('Authorization', `Bearer ${accessToken}`).expect(401);
    await request(app.getHttpServer()).post('/api/v1/auth/refresh').set('Cookie', rotatedCookie).expect(401);
    const nextLogin = await request(app.getHttpServer()).post('/api/v1/auth/login').send(credentials).expect(200);
    database.expireLatestSession();
    await request(app.getHttpServer()).get('/api/v1/auth/me').set('Authorization', `Bearer ${nextLogin.body.accessToken as string}`).expect(401);
  });

  it('handles reset flow, rejects invalid tokens, and invalidates the old access token', async () => {
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send(credentials).expect(200);
    const oldAccessToken = login.body.accessToken as string;
    let resetToken = '';
    const log = jest.spyOn(console, 'info').mockImplementation((message: string) => { resetToken = message.match(/"token":"([^"]+)"/)?.[1] ?? ''; });
    await request(app.getHttpServer()).post('/api/v1/auth/forgot-password').send({ collegeCode: 'DEMO', email: credentials.email }).expect(204);
    log.mockRestore();
    expect(resetToken).toBeTruthy();
    await request(app.getHttpServer()).post('/api/v1/auth/reset-password').send({ token: 'invalid-token', password: 'a-new-strong-password' }).expect(400);
    await request(app.getHttpServer()).post('/api/v1/auth/reset-password').send({ token: resetToken, password: 'a-new-strong-password' }).expect(204);
    await request(app.getHttpServer()).get('/api/v1/auth/me').set('Authorization', `Bearer ${oldAccessToken}`).expect(401);
    await request(app.getHttpServer()).post('/api/v1/auth/login').send({ ...credentials, password: 'a-new-strong-password' }).expect(200);
    await request(app.getHttpServer()).post('/api/v1/auth/verify-email').send({ token: 42 }).expect(400).expect(({ body }) => expect(body.code).toBe('INVALID_INPUT'));
  });
});
