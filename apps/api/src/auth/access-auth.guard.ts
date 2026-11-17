import { createParamDecorator, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { AuthService } from './auth.service';
import type { PublicUser } from './auth.service';

@Injectable()
export class AccessAuthGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ headers: { authorization?: string }; authUser?: PublicUser }>();
    const token = request.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!token) throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Authentication is required.' });
    request.authUser = await this.auth.authorizeAccessToken(token);
    return true;
  }
}

export const CurrentUser = createParamDecorator((_: unknown, context: ExecutionContext): PublicUser => context.switchToHttp().getRequest<{ authUser: PublicUser }>().authUser);
