import { createParamDecorator, SetMetadata } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Permission, RoleName } from './authorization.types';
import type { AuthorizationContext } from './authorization.types';

export const REQUIRED_ROLES = 'campusos:required-roles';
export const REQUIRED_PERMISSIONS = 'campusos:required-permissions';
export const RequireRoles = (...roles: RoleName[]) => SetMetadata(REQUIRED_ROLES, roles);
export const RequirePermissions = (...permissions: Permission[]) => SetMetadata(REQUIRED_PERMISSIONS, permissions);
export const CurrentAuthorization = createParamDecorator((_: unknown, context: ExecutionContext): AuthorizationContext => context.switchToHttp().getRequest<{ authorization: AuthorizationContext }>().authorization);
export const CurrentContext = CurrentAuthorization;
