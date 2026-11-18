import { BadRequestException } from '@nestjs/common';

type Body = Record<string, unknown>;
const invalid = (): never => {
  throw new BadRequestException({ code: 'INVALID_INPUT', message: 'Request input is invalid.' });
};
const object = (v: unknown): Body => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Body) : invalid());
const string = (v: unknown, min = 1): string => (typeof v === 'string' && v.trim().length >= min ? v.trim() : invalid());
const optional = (v: unknown): string | undefined => (v === undefined ? undefined : string(v));

/** A designation is a short free-text job title; null or an empty string clears it. */
const designation = (v: unknown): string | null | undefined => {
  if (v === undefined) return undefined;
  if (v === null || (typeof v === 'string' && v.trim() === '')) return null;
  const value = string(v, 2);
  return value.length <= 80 ? value : invalid();
};

/** Sign-in emails are stored lower-case, as the login lookup expects. */
const email = (v: unknown): string => {
  const value = string(v).toLowerCase();
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : invalid();
};

export type FacultyDto = { employeeCode: string; firstName: string; lastName: string; departmentId?: string; designation?: string | null; email?: string };
export type FacultyUpdateDto = { employeeCode?: string; firstName?: string; lastName?: string; departmentId?: string | null; designation?: string | null };
export type FacultyAccountDto = { email: string };
export type FacultyAccountStatusDto = { status: 'ACTIVE' | 'INACTIVE' };

export const parseFacultyDto = (v: unknown): FacultyDto => {
  const b = object(v);
  return {
    employeeCode: string(b.employeeCode),
    firstName: string(b.firstName, 2),
    lastName: string(b.lastName, 2),
    departmentId: optional(b.departmentId),
    designation: designation(b.designation),
    email: b.email === undefined || b.email === null || b.email === '' ? undefined : email(b.email),
  };
};

export const parseFacultyUpdateDto = (v: unknown): FacultyUpdateDto => {
  const b = object(v);
  const r = {
    employeeCode: optional(b.employeeCode),
    firstName: optional(b.firstName),
    lastName: optional(b.lastName),
    departmentId: b.departmentId === null ? null : optional(b.departmentId),
    designation: designation(b.designation),
  };
  if (Object.values(r).every((x) => x === undefined)) invalid();
  return r;
};

export const parseFacultyAccountDto = (v: unknown): FacultyAccountDto => ({ email: email(object(v).email) });

export const parseFacultyAccountStatusDto = (v: unknown): FacultyAccountStatusDto => {
  const status = object(v).status;
  return status === 'ACTIVE' || status === 'INACTIVE' ? { status } : invalid();
};

export const parseFacultyQuery = (v: unknown): { search?: string; departmentId?: string; page: number; pageSize: number } => {
  const b = object(v);
  const n = (x: unknown, f: number, m: number) => (x === undefined ? f : Number.isInteger(Number(x)) && Number(x) > 0 && Number(x) <= m ? Number(x) : invalid());
  return { search: optional(b.search), departmentId: optional(b.departmentId), page: n(b.page, 1, 10000), pageSize: n(b.pageSize, 20, 100) };
};
