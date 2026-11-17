import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let app: INestApplication;
  const auth = { login: jest.fn(), register: jest.fn(), refresh: jest.fn(), logout: jest.fn(), verifyEmail: jest.fn(), requestPasswordReset: jest.fn(), resetPassword: jest.fn(), currentUser: jest.fn() };
  beforeAll(async () => { process.env.AUTH_ACCESS_TOKEN_SECRET = 'controller-test-secret-with-at-least-thirty-two-characters'; const module = await Test.createTestingModule({ controllers: [AuthController], providers: [{ provide: AuthService, useValue: auth }] }).compile(); app = module.createNestApplication(); await app.init(); });
  afterAll(async () => { await app.close(); });
  beforeEach(() => { jest.clearAllMocks(); });

  it('returns an access token and writes an HTTP-only refresh cookie on login', async () => {
    auth.login.mockResolvedValue({ accessToken: 'access', refreshToken: 'refresh', user: { id: 'u1', collegeId: 'c1', email: 'user@example.test', displayName: 'User', emailVerified: true } });
    await request(app.getHttpServer()).post('/auth/login').send({ collegeCode: 'DEMO', email: 'user@example.test', password: 'correct-password' }).expect(200).expect('Set-Cookie', /campusos_refresh=refresh; HttpOnly;/).expect({ accessToken: 'access', user: { id: 'u1', collegeId: 'c1', email: 'user@example.test', displayName: 'User', emailVerified: true } });
  });

  it('clears the refresh cookie on logout', async () => { await request(app.getHttpServer()).post('/auth/logout').set('Cookie', 'campusos_refresh=refresh').expect(204).expect('Set-Cookie', /Max-Age=0/); expect(auth.logout).toHaveBeenCalledWith('refresh'); });

  it('rejects malformed login requests with INVALID_INPUT', async () => { await request(app.getHttpServer()).post('/auth/login').send({ collegeCode: 'DEMO', email: 42, password: {} }).expect(400).expect(({ body }) => expect(body.code).toBe('INVALID_INPUT')); });

  it('rejects malformed verification requests with INVALID_INPUT', async () => { await request(app.getHttpServer()).post('/auth/verify-email').send({ token: 42 }).expect(400).expect(({ body }) => expect(body.code).toBe('INVALID_INPUT')); });
});
