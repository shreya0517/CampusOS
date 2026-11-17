import { getAuthConfig } from './auth.config';

const refreshCookieName = 'campusos_refresh';

export const getRefreshCookieName = (): string => refreshCookieName;

export const createRefreshCookie = (token: string, maxAgeSeconds?: number): string => {
  const config = getAuthConfig();
  const maxAge = maxAgeSeconds ?? config.refreshTokenTtlDays * 86_400;
  return `${refreshCookieName}=${encodeURIComponent(token)}; HttpOnly; Path=/api/v1/auth; SameSite=Lax; Max-Age=${maxAge}${config.isProduction ? '; Secure' : ''}`;
};
