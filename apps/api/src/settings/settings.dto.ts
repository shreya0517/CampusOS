import { BadRequestException } from '@nestjs/common';

/** The whole Institution settings form. `updatedAt` is the version the Admin last read, so an edit can't overwrite a newer one. */
export type InstitutionSettingsDto = {
  name: string;
  timezone: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  attendanceThreshold: number;
  correctionWindowHours: number;
  updatedAt: Date;
};

export const ATTENDANCE_THRESHOLD_RANGE = { min: 1, max: 100 } as const;
/** Up to 30 days. */
export const CORRECTION_WINDOW_RANGE = { min: 1, max: 720 } as const;

type Body = Record<string, unknown>;
const invalid = (): never => { throw new BadRequestException({ code: 'INVALID_INPUT', message: 'Request input is invalid.' }); };
const object = (v: unknown): Body => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Body) : invalid());
const string = (v: unknown, min: number, max: number): string => (typeof v === 'string' && v.trim().length >= min && v.trim().length <= max ? v.trim() : invalid());
const blank = (v: unknown): boolean => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
const optional = (v: unknown, max: number, valid: (s: string) => boolean = () => true): string | null => {
  if (blank(v)) return null;
  const s = string(v, 1, max);
  return valid(s) ? s : invalid();
};
const integer = (v: unknown, range: { min: number; max: number }): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isInteger(n) && n >= range.min && n <= range.max ? n : invalid();
};

/** Any IANA timezone the runtime knows, such as Asia/Kolkata. Stored as given. */
export const isTimezone = (value: string): boolean => {
  if (!/^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)*$/.test(value)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
};
const isEmail = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
/** Digits with an optional leading +, and spaces, hyphens or brackets between them: 7 to 15 digits. */
const isPhone = (value: string): boolean => /^\+?[0-9 ()-]+$/.test(value) && /^\d{7,15}$/.test(value.replace(/\D/g, ''));
const isWebsite = (value: string): boolean => {
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname.includes('.');
  } catch {
    return false;
  }
};

export const parseInstitutionSettingsDto = (value: unknown): InstitutionSettingsDto => {
  const b = object(value);
  const timezone = string(b.timezone, 1, 64);
  if (!isTimezone(timezone)) invalid();
  const updatedAt = new Date(string(b.updatedAt, 1, 40));
  if (Number.isNaN(updatedAt.valueOf())) invalid();
  return {
    name: string(b.name, 2, 120),
    timezone,
    address: optional(b.address, 300),
    phone: optional(b.phone, 25, isPhone),
    email: optional(b.email, 254, isEmail)?.toLowerCase() ?? null,
    website: optional(b.website, 200, isWebsite),
    attendanceThreshold: integer(b.attendanceThreshold, ATTENDANCE_THRESHOLD_RANGE),
    correctionWindowHours: integer(b.correctionWindowHours, CORRECTION_WINDOW_RANGE),
    updatedAt,
  };
};
