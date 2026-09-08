import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import { DatabaseService } from '../database.service';
import { AccessAuthGuard } from '../auth/access-auth.guard';
import { AuthService } from '../auth/auth.service';
import { AuthorizationProbeController } from './authorization-probe.controller';
import { AuthorizationGuard } from './authorization.guard';
import { AuthorizationService } from './authorization.service';

process.env.AUTH_ACCESS_TOKEN_SECRET = 'authorization-integration-secret-at-least-32-chars';
type User = { id: string; collegeId: string; email: string; displayName: string; emailVerifiedAt: Date; status: 'ACTIVE' };
const users: User[] = [
  { id: 'admin-a', collegeId: 'college-a', email: 'admin-a@test', displayName: 'Admin A', emailVerifiedAt: new Date(), status: 'ACTIVE' },
  { id: 'student-a', collegeId: 'college-a', email: 'student-a@test', displayName: 'Student A', emailVerifiedAt: new Date(), status: 'ACTIVE' },
  { id: 'faculty-a', collegeId: 'college-a', email: 'faculty-a@test', displayName: 'Faculty A', emailVerifiedAt: new Date(), status: 'ACTIVE' },
  { id: 'hod-a', collegeId: 'college-a', email: 'hod-a@test', displayName: 'Hod A', emailVerifiedAt: new Date(), status: 'ACTIVE' },
  { id: 'super', collegeId: 'college-a', email: 'super@test', displayName: 'Super', emailVerifiedAt: new Date(), status: 'ACTIVE' },
];
const roles: Record<string, { name: string; permissions: string[] }> = { 'admin-a': { name: 'ADMIN', permissions: ['TENANT_READ', 'DEPARTMENT_READ'] }, 'student-a': { name: 'STUDENT', permissions: [] }, 'faculty-a': { name: 'FACULTY', permissions: [] }, 'hod-a': { name: 'HOD', permissions: ['DEPARTMENT_READ'] }, super: { name: 'SUPER_ADMIN', permissions: ['TENANT_READ', 'TENANT_MANAGE', 'DEPARTMENT_READ'] } };
const revokedSessions = new Set<string>();
const departments = [{ id: 'department-a', collegeId: 'college-a' }, { id: 'department-b', collegeId: 'college-a' }, { id: 'department-c', collegeId: 'college-b' }];
const database = {
  authSession: { findUnique: async ({ where }: { where: { id: string } }) => { const user = users.find((item) => `session-${item.id}` === where.id); return user ? { id: where.id, collegeId: user.collegeId, userId: user.id, expiresAt: new Date(Date.now() + 60_000), revokedAt: revokedSessions.has(where.id) ? new Date() : null, user } : null; } },
  userRole: { findMany: async ({ where }: { where: { userId: string } }) => { const role = roles[where.userId]; return role ? [{ role: { name: role.name, rolePermissions: role.permissions.map((code) => ({ permission: { code } })) } }] : []; } },
  faculty: { findUnique: async ({ where }: { where: { collegeId_userId: { userId: string } } }) => where.collegeId_userId.userId === 'hod-a' ? { departmentId: 'department-a' } : null },
  department: { findFirst: async ({ where }: { where: { id: string; collegeId: string } }) => departments.find((department) => department.id === where.id && department.collegeId === where.collegeId) ?? null },
};
const token = (user: User): string => { const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'); const payload = Buffer.from(JSON.stringify({ sub: user.id, collegeId: user.collegeId, sid: `session-${user.id}`, exp: Math.floor(Date.now() / 1000) + 60 })).toString('base64url'); const signature = createHmac('sha256', process.env.AUTH_ACCESS_TOKEN_SECRET!).update(`${header}.${payload}`).digest('base64url'); return `${header}.${payload}.${signature}`; };

describe('Authorization HTTP security', () => {
  let app: INestApplication;
  const bearer = (id: string) => `Bearer ${token(users.find((user) => user.id === id)!)}`;
  beforeAll(async () => { const module = await Test.createTestingModule({ controllers: [AuthorizationProbeController], providers: [AuthService, AccessAuthGuard, AuthorizationService, AuthorizationGuard, { provide: DatabaseService, useValue: database }] }).compile(); app = module.createNestApplication(); app.setGlobalPrefix('api/v1'); await app.init(); });
  afterAll(async () => app.close());
  it('rejects missing authentication, students, faculty, and forged roles', async () => { await request(app.getHttpServer()).get('/api/v1/authorization/probes/tenant/college-a').expect(401); for (const id of ['student-a', 'faculty-a']) await request(app.getHttpServer()).get('/api/v1/authorization/probes/tenant/college-a?role=ADMIN').set('Authorization', bearer(id)).expect(403); });
  it('allows admin only in its own tenant and blocks a valid College B resource id without leakage', async () => { await request(app.getHttpServer()).get('/api/v1/authorization/probes/tenant/college-a').set('Authorization', bearer('admin-a')).expect(200); await request(app.getHttpServer()).get('/api/v1/authorization/probes/tenant/college-b?collegeId=college-a').set('X-College-Id', 'college-b').set('Authorization', bearer('admin-a')).expect(403).expect(({ body }) => expect(body.collegeId).toBeUndefined()); await request(app.getHttpServer()).get('/api/v1/authorization/probes/department/college-b/department-c').set('Authorization', bearer('admin-a')).expect(403).expect(({ body }) => expect(body.departmentId).toBeUndefined()); });
  it('enforces HOD department and tenant scope against real department resource ids', async () => { await request(app.getHttpServer()).get('/api/v1/authorization/probes/department/college-a/department-a').set('Authorization', bearer('hod-a')).expect(200); await request(app.getHttpServer()).get('/api/v1/authorization/probes/department/college-a/department-b?departmentId=department-a').set('Authorization', bearer('hod-a')).expect(403); await request(app.getHttpServer()).get('/api/v1/authorization/probes/department/college-b/department-c').set('Authorization', bearer('hod-a')).expect(403); });
  it('requires explicit SUPER_ADMIN role and permission for cross-tenant operation', async () => { await request(app.getHttpServer()).get('/api/v1/authorization/probes/platform/tenant/college-b').set('Authorization', bearer('admin-a')).expect(403); await request(app.getHttpServer()).get('/api/v1/authorization/probes/platform/tenant/college-b').set('Authorization', bearer('super')).expect(200); });
  it('rejects a revoked Phase 02 session before authorization executes', async () => { await request(app.getHttpServer()).get('/api/v1/authorization/probes/tenant/college-a').set('Authorization', bearer('admin-a')).expect(200); revokedSessions.add('session-admin-a'); await request(app.getHttpServer()).get('/api/v1/authorization/probes/tenant/college-a').set('Authorization', bearer('admin-a')).expect(401); });
});
