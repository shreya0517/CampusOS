export type AuthConfig = {
  accessTokenSecret: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlDays: number;
  isProduction: boolean;
};

export const getAuthConfig = (): AuthConfig => {
  const accessTokenSecret = process.env.AUTH_ACCESS_TOKEN_SECRET;
  if (!accessTokenSecret || accessTokenSecret.length < 32) {
    throw new Error('AUTH_ACCESS_TOKEN_SECRET must contain at least 32 characters.');
  }

  return {
    accessTokenSecret,
    accessTokenTtlSeconds: positiveInteger(process.env.AUTH_ACCESS_TOKEN_TTL_SECONDS, 900),
    refreshTokenTtlDays: positiveInteger(process.env.AUTH_REFRESH_TOKEN_TTL_DAYS, 30),
    isProduction: process.env.NODE_ENV === 'production',
  };
};

const positiveInteger = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error('Authentication lifetime configuration must be a positive integer.');
  }
  return parsed;
};
