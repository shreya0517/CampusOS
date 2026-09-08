import { UnauthorizedException } from '@nestjs/common';
import { AccessAuthGuard } from './access-auth.guard';

describe('AccessAuthGuard', () => {
  it('attaches an authorized user for a bearer token', async () => { const authorizeAccessToken = jest.fn().mockResolvedValue({ id: 'u1' }); const guard = new AccessAuthGuard({ authorizeAccessToken } as never); const request = { headers: { authorization: 'Bearer valid-token' } }; await expect(guard.canActivate({ switchToHttp: () => ({ getRequest: () => request }) } as never)).resolves.toBe(true); expect(request).toMatchObject({ authUser: { id: 'u1' } }); });
  it('rejects requests without a bearer token', async () => { const guard = new AccessAuthGuard({} as never); await expect(guard.canActivate({ switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }) } as never)).rejects.toThrow(UnauthorizedException); });
});
