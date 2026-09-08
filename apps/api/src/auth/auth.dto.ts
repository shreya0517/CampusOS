import { BadRequestException } from '@nestjs/common';

export type RegisterDto = { collegeCode: string; email: string; password: string; displayName: string };
export type LoginDto = { collegeCode: string; email: string; password: string };
export type ForgotPasswordDto = { collegeCode: string; email: string };
export type ResetPasswordDto = { token: string; password: string };

export const parseRegisterDto = (value: unknown): RegisterDto => {
  const body = object(value);
  return { collegeCode: string(body.collegeCode), email: email(body.email), password: string(body.password, 12), displayName: string(body.displayName, 2) };
};

export const parseLoginDto = (value: unknown): LoginDto => {
  const body = object(value);
  return { collegeCode: string(body.collegeCode), email: email(body.email), password: string(body.password) };
};

export const parseTokenDto = (value: unknown): string => string(object(value).token);

export const parseForgotPasswordDto = (value: unknown): ForgotPasswordDto => {
  const body = object(value);
  return { collegeCode: string(body.collegeCode), email: email(body.email) };
};

export const parseResetPasswordDto = (value: unknown): ResetPasswordDto => {
  const body = object(value);
  return { token: string(body.token), password: string(body.password, 12) };
};

type Body = Record<string, unknown>;
const invalid = (): never => { throw new BadRequestException({ code: 'INVALID_INPUT', message: 'Request body is invalid.' }); };
const object = (value: unknown): Body => (value && typeof value === 'object' && !Array.isArray(value) ? value as Body : invalid());
const string = (value: unknown, min = 1): string => (typeof value === 'string' && value.trim().length >= min ? value.trim() : invalid());
const email = (value: unknown): string => {
  const valueString = string(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valueString) ? valueString.toLowerCase() : invalid();
};
