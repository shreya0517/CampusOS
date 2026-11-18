import { BadRequestException } from '@nestjs/common';
import { EnrollmentStatus } from '@prisma/client';

export type CreateStudentDto = { studentCode: string; firstName: string; lastName: string; dateOfBirth?: Date; sectionId: string; email?: string };
export type StudentAccountDto = { email: string };
export type UpdateStudentDto = { firstName?: string; lastName?: string; dateOfBirth?: Date | null };
export type EnrollmentDto = { sectionId: string; status?: EnrollmentStatus };
export type UpdateMyContactDto = { phone?: string | null; address?: string | null };
export const ACCOUNT_FILTERS = ['ACTIVE', 'INACTIVE', 'NO_ACCOUNT'] as const;
export type AccountFilter = (typeof ACCOUNT_FILTERS)[number];
export type StudentListQuery = { search?: string; departmentId?: string; courseId?: string; semesterId?: string; sectionId?: string; accountStatus?: AccountFilter; page: number; pageSize: number };
export type AccountStatusDto = { status: 'ACTIVE' | 'INACTIVE' };

type Body = Record<string, unknown>;
const invalid = (): never => { throw new BadRequestException({ code: 'INVALID_INPUT', message: 'Request input is invalid.' }); };
const object = (value: unknown): Body => value && typeof value === 'object' && !Array.isArray(value) ? value as Body : invalid();
const string = (value: unknown, min = 1): string => typeof value === 'string' && value.trim().length >= min ? value.trim() : invalid();
const optionalString = (value: unknown): string | undefined => value === undefined ? undefined : string(value);
const date = (value: unknown): Date => { const parsed = new Date(string(value)); return Number.isNaN(parsed.valueOf()) ? invalid() : parsed; };

/** Sign-in emails are stored lower-case, as the login lookup expects. */
const email = (value: unknown): string => { const result = string(value).toLowerCase(); return result.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result) ? result : invalid(); };
export const parseCreateStudentDto = (value: unknown): CreateStudentDto => { const body = object(value); return { studentCode: string(body.studentCode), firstName: string(body.firstName, 2), lastName: string(body.lastName, 2), dateOfBirth: body.dateOfBirth === undefined ? undefined : date(body.dateOfBirth), sectionId: string(body.sectionId), email: body.email === undefined || body.email === null || body.email === '' ? undefined : email(body.email) }; };
export const parseStudentAccountDto = (value: unknown): StudentAccountDto => ({ email: email(object(value).email) });
export const parseUpdateStudentDto = (value: unknown): UpdateStudentDto => { const body = object(value); const result = { firstName: optionalString(body.firstName), lastName: optionalString(body.lastName), dateOfBirth: body.dateOfBirth === undefined ? undefined : body.dateOfBirth === null ? null : date(body.dateOfBirth) }; if (result.firstName === undefined && result.lastName === undefined && result.dateOfBirth === undefined) invalid(); if (result.firstName !== undefined && result.firstName.length < 2 || result.lastName !== undefined && result.lastName.length < 2) invalid(); return result; };
export const parseEnrollmentDto = (value: unknown): EnrollmentDto => { const body = object(value); const status = body.status === undefined ? undefined : string(body.status); if (status !== undefined && !Object.values(EnrollmentStatus).includes(status as EnrollmentStatus)) invalid(); return { sectionId: string(body.sectionId), status: status as EnrollmentStatus | undefined }; };
/** Students may only change their own phone and address. An empty string clears the field. */
export const parseUpdateMyContactDto = (value: unknown): UpdateMyContactDto => {
  const body = object(value);
  const clearable = (input: unknown): string | null | undefined => {
    if (input === undefined) return undefined;
    if (input === null) return null;
    if (typeof input !== 'string') return invalid();
    return input.trim() === '' ? null : input.trim();
  };
  const phone = clearable(body.phone);
  const address = clearable(body.address);
  if (phone === undefined && address === undefined) invalid();
  // Spaces and dashes are allowed as separators, but the number itself needs 8 to 20 digits.
  if (typeof phone === 'string' && (!/^\+?[0-9][0-9 -]*[0-9]$/.test(phone) || !/^\d{8,20}$/.test(phone.replace(/\D/g, '')))) invalid();
  if (typeof address === 'string' && address.length > 300) invalid();
  return { phone, address };
};
export const parseStudentListQuery = (value: unknown): StudentListQuery => { const query = object(value); const integer = (input: unknown, fallback: number, max: number) => { if (input === undefined) return fallback; const parsed = Number(input); return Number.isInteger(parsed) && parsed > 0 && parsed <= max ? parsed : invalid(); }; return { search: optionalString(query.search), departmentId: optionalString(query.departmentId), courseId: optionalString(query.courseId), semesterId: optionalString(query.semesterId), sectionId: optionalString(query.sectionId), accountStatus: accountFilter(query.accountStatus), page: integer(query.page, 1, 10_000), pageSize: integer(query.pageSize, 20, 100) }; };
function accountFilter(input: unknown): AccountFilter | undefined {
  if (input === undefined || input === '') return undefined;
  return typeof input === 'string' && (ACCOUNT_FILTERS as readonly string[]).includes(input) ? (input as AccountFilter) : invalid();
}
/** Admins activate or deactivate a student's sign-in account; suspension is not offered here. */
export const parseAccountStatusDto = (value: unknown): AccountStatusDto => {
  const status = object(value).status;
  return status === 'ACTIVE' || status === 'INACTIVE' ? { status } : invalid();
};