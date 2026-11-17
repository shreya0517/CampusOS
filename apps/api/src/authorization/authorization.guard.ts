import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PublicUser } from '../auth/auth.service';
import { REQUIRED_PERMISSIONS, REQUIRED_ROLES } from './authorization.decorator';
import { AuthorizationService } from './authorization.service';
import type { AuthorizationContext, Permission, RoleName } from './authorization.types';

@Injectable()
export class AuthorizationGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector, @Inject(AuthorizationService) private readonly authorization: AuthorizationService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ authUser?: PublicUser; authorization?: AuthorizationContext }>();
    if (!request.authUser) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'You are not authorized to access this resource.' });
    const authorization = await this.authorization.getContext(request.authUser);
    const roles = this.reflector.getAllAndOverride<RoleName[]>(REQUIRED_ROLES, [context.getHandler(), context.getClass()]) ?? [];
    const permissions = this.reflector.getAllAndOverride<Permission[]>(REQUIRED_PERMISSIONS, [context.getHandler(), context.getClass()]) ?? [];
    if ((roles.length && !roles.some((role) => authorization.roles.includes(role))) || (permissions.length && !permissions.every((permission) => authorization.permissions.includes(permission)))) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'You are not authorized to access this resource.' });
    request.authorization = authorization;
    return true;
  }
}
