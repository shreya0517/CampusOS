import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import { parseCookies } from './auth.service';
import { AuthService } from './auth.service';
import type { PublicUser } from './auth.service';
import { AccessAuthGuard, CurrentUser } from './access-auth.guard';
import { parseForgotPasswordDto, parseLoginDto, parseRegisterDto, parseResetPasswordDto, parseTokenDto } from './auth.dto';
import { createRefreshCookie, getRefreshCookieName } from './refresh-cookie';

type RequestLike = { headers: Record<string, string | undefined> };
type ResponseLike = { setHeader(name: string, value: string): void };
@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post('register') async register(@Body() body: unknown) { return { user: await this.auth.register(parseRegisterDto(body)) }; }
  @Post('login') @HttpCode(200) async login(@Body() body: unknown, @Res({ passthrough: true }) response: ResponseLike) { const session = await this.auth.login(parseLoginDto(body)); response.setHeader('Set-Cookie', createRefreshCookie(session.refreshToken)); return { accessToken: session.accessToken, user: session.user }; }
  @Post('refresh') @HttpCode(200) async refresh(@Req() request: RequestLike, @Res({ passthrough: true }) response: ResponseLike) { const session = await this.auth.refresh(parseCookies(request.headers.cookie)[getRefreshCookieName()]); response.setHeader('Set-Cookie', createRefreshCookie(session.refreshToken)); return { accessToken: session.accessToken, user: session.user }; }
  @Post('logout') @HttpCode(204) async logout(@Req() request: RequestLike, @Res({ passthrough: true }) response: ResponseLike): Promise<void> { await this.auth.logout(parseCookies(request.headers.cookie)[getRefreshCookieName()]); response.setHeader('Set-Cookie', createRefreshCookie('', 0)); }
  @Post('verify-email') @HttpCode(204) async verifyEmail(@Body() body: unknown): Promise<void> { await this.auth.verifyEmail(parseTokenDto(body)); }
  @Post('forgot-password') @HttpCode(204) async forgotPassword(@Body() body: unknown): Promise<void> { await this.auth.requestPasswordReset(parseForgotPasswordDto(body)); }
  @Post('reset-password') @HttpCode(204) async resetPassword(@Body() body: unknown): Promise<void> { await this.auth.resetPassword(parseResetPasswordDto(body)); }
  @Get('me') @UseGuards(AccessAuthGuard) me(@CurrentUser() user: PublicUser) { return { user }; }
}
