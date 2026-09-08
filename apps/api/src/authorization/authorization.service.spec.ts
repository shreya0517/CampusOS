import { ForbiddenException } from '@nestjs/common';
import { AuthorizationService } from './authorization.service';
import type { AuthorizationContext } from './authorization.types';

const user = { id: 'user-a', collegeId: 'college-a', email: 'a@test', displayName: 'A', emailVerified: true };
const createDatabase = (role: string, permissions: string[], departmentId: string | null = null) => ({
  userRole: { findMany: jest.fn().mockResolvedValue([{ role: { name: role, rolePermissions: permissions.map((code) => ({ permission: { code } })) } }]) },
  faculty: { findUnique: jest.fn().mockResolvedValue(departmentId ? { departmentId } : null) },
});

describe('AuthorizationService tenant isolation', () => {
  it('derives roles and permissions from server-side assignments', async () => {
    const service = new AuthorizationService(createDatabase('ADMIN', ['TENANT_READ']) as never);
    await expect(service.getContext(user)).resolves.toMatchObject({ collegeId: 'college-a', roles: ['ADMIN'], permissions: ['TENANT_READ'] });
  });

  it('rejects cross-tenant access for an admin despite a manipulated target id', () => {
    const service = new AuthorizationService({} as never);
    expect(() => service.assertTenant({ userId: 'a', collegeId: 'college-a', roles: ['ADMIN'], permissions: [], departmentId: null }, 'college-b')).toThrow(ForbiddenException);
  });

  it('allows an admin only within its tenant and across its own tenant departments', () => {
    const service = new AuthorizationService({} as never);
    const context: AuthorizationContext = { userId: 'a', collegeId: 'college-a', roles: ['ADMIN'], permissions: [], departmentId: null };
    expect(() => service.assertTenant(context, 'college-a')).not.toThrow();
    expect(() => service.assertDepartment(context, 'college-a', 'department-b')).not.toThrow();
  });

  it('keeps an HOD constrained to its authenticated department and college', () => {
    const service = new AuthorizationService({} as never);
    const context: AuthorizationContext = { userId: 'hod', collegeId: 'college-a', roles: ['HOD'], permissions: [], departmentId: 'department-a' };
    expect(() => service.assertDepartment(context, 'college-a', 'department-a')).not.toThrow();
    expect(() => service.assertDepartment(context, 'college-a', 'department-b')).toThrow(ForbiddenException);
    expect(() => service.assertDepartment(context, 'college-b', 'department-a')).toThrow(ForbiddenException);
  });

  it('permits cross-tenant scope only for an explicit SUPER_ADMIN context', () => {
    const service = new AuthorizationService({} as never);
    expect(() => service.assertTenant({ userId: 'super', collegeId: 'college-a', roles: ['SUPER_ADMIN'], permissions: ['TENANT_MANAGE'], departmentId: null }, 'college-b')).not.toThrow();
  });
});
