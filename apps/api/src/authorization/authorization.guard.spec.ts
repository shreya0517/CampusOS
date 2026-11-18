import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { AuthorizationService } from './authorization.service';
import type { AuthorizationContext, RoleName } from './authorization.types';
import { AuthorizationGuard } from './authorization.guard';

const request = (roles: RoleName[]) => {
  const req: { authUser?: { id: string }; authorization?: AuthorizationContext } = { authUser: { id: 'user-1' } };
  const context = { switchToHttp: () => ({ getRequest: () => req }), getHandler: () => undefined, getClass: () => undefined } as unknown as ExecutionContext;
  const authorization = { getContext: jest.fn().mockResolvedValue({ userId: 'user-1', collegeId: 'col-a', roles, permissions: [], departmentId: null }) };
  return { req, context, authorization };
};
const guard = (authorization: { getContext: jest.Mock }, requiredRoles?: RoleName[]) =>
  new AuthorizationGuard({ getAllAndOverride: jest.fn((key: string) => (key.includes('roles') ? requiredRoles : undefined)) } as unknown as Reflector, authorization as unknown as AuthorizationService);

describe('AuthorizationGuard', () => {
  it('refuses an account with no role, even on a route that names no roles', async () => {
    const { context, authorization } = request([]);
    await expect(guard(authorization).canActivate(context)).rejects.toMatchObject({ response: { code: 'NO_ROLE' } });
    await expect(guard(authorization, ['STUDENT', 'ADMIN']).canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets any role through a route that names none, and only the named roles otherwise', async () => {
    const student = request(['STUDENT']);
    await expect(guard(student.authorization).canActivate(student.context)).resolves.toBe(true);
    expect(student.req.authorization?.roles).toEqual(['STUDENT']);
    await expect(guard(student.authorization, ['ADMIN']).canActivate(student.context)).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
  });
});
