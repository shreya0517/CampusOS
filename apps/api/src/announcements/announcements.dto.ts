import { BadRequestException } from '@nestjs/common';
import { AnnouncementAudience, AnnouncementCategory } from '@prisma/client';

/** Who within the college an announcement is for, beyond its audience. Every part is optional; none means everyone. */
export type AnnouncementTarget = { departmentId?: string; semesterNumber?: number; sectionId?: string };
export type CreateAnnouncementDto = {
  title: string;
  body: string;
  audience: AnnouncementAudience;
  category: AnnouncementCategory;
  target: AnnouncementTarget;
  publishedAt?: Date;
  expiresAt?: Date;
};
/** An edit: the full announcement as on the form. publishedAt can only move a scheduled one; left out, it is unchanged. */
export type UpdateAnnouncementDto = Omit<CreateAnnouncementDto, 'expiresAt'> & { expiresAt: Date | null };
export type AnnouncementListQuery = { search?: string; category?: AnnouncementCategory; page: number; pageSize: number };
export const ANNOUNCEMENT_STATES = ['PUBLISHED', 'SCHEDULED', 'EXPIRED', 'ARCHIVED'] as const;
export type AnnouncementState = (typeof ANNOUNCEMENT_STATES)[number];
export type ManageAnnouncementQuery = AnnouncementListQuery & { state?: AnnouncementState };

type Body = Record<string, unknown>;
const invalid = (): never => { throw new BadRequestException({ code: 'INVALID_INPUT', message: 'Request input is invalid.' }); };
const object = (v: unknown): Body => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Body) : invalid());
const string = (v: unknown, min: number, max: number): string => (typeof v === 'string' && v.trim().length >= min && v.trim().length <= max ? v.trim() : invalid());
const blank = (v: unknown): boolean => v === undefined || v === null || v === '';
const optionalId = (v: unknown): string | undefined => (blank(v) ? undefined : string(v, 1, 64));
const optionalDate = (v: unknown): Date | undefined => {
  if (blank(v)) return undefined;
  const parsed = new Date(string(v, 1, 40));
  return Number.isNaN(parsed.valueOf()) ? invalid() : parsed;
};
const integer = (v: unknown, fallback: number, max: number): number => {
  if (v === undefined) return fallback;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 && n <= max ? n : invalid();
};
const oneOf = <T extends string>(v: unknown, values: readonly T[]): T => {
  const s = string(v, 1, 20);
  return (values as readonly string[]).includes(s) ? (s as T) : invalid();
};

const AUDIENCES = Object.values(AnnouncementAudience);
const CATEGORIES = Object.values(AnnouncementCategory);

/**
 * A new announcement must still be live when it goes out: it expires after it is published, and after now. An edit only
 * needs the expiry after the publish time (checked against the stored one too), so an expired announcement can still be
 * corrected without changing its expiry.
 */
const dates = (b: Body, isNew: boolean): { publishedAt?: Date; expiresAt?: Date } => {
  const publishedAt = optionalDate(b.publishedAt);
  const expiresAt = optionalDate(b.expiresAt);
  const now = new Date();
  const earliest = isNew ? (publishedAt && publishedAt > now ? publishedAt : now) : publishedAt;
  if (expiresAt && earliest && expiresAt <= earliest) invalid();
  return { publishedAt, expiresAt };
};

const fields = (b: Body): Omit<CreateAnnouncementDto, 'publishedAt' | 'expiresAt'> => {
  return {
    title: string(b.title, 3, 160),
    body: string(b.body, 1, 5000),
    audience: blank(b.audience) ? AnnouncementAudience.ALL : oneOf(b.audience, AUDIENCES),
    category: blank(b.category) ? AnnouncementCategory.GENERAL : oneOf(b.category, CATEGORIES),
    target: {
      departmentId: optionalId(b.departmentId),
      semesterNumber: blank(b.semesterNumber) ? undefined : integer(b.semesterNumber, 1, 12),
      sectionId: optionalId(b.sectionId),
    },
  };
};

export const parseCreateAnnouncementDto = (v: unknown): CreateAnnouncementDto => {
  const b = object(v);
  return { ...fields(b), ...dates(b, true) };
};

export const parseUpdateAnnouncementDto = (v: unknown): UpdateAnnouncementDto => {
  const b = object(v);
  const { publishedAt, expiresAt } = dates(b, false);
  return { ...fields(b), publishedAt, expiresAt: expiresAt ?? null };
};

export const parseAnnouncementListQuery = (v: unknown): AnnouncementListQuery => {
  const q = object(v);
  return {
    search: blank(q.search) ? undefined : string(q.search, 1, 100),
    category: blank(q.category) ? undefined : oneOf(q.category, CATEGORIES),
    page: integer(q.page, 1, 10_000),
    pageSize: integer(q.pageSize, 10, 50),
  };
};

export const parseManageAnnouncementQuery = (v: unknown): ManageAnnouncementQuery => {
  const q = object(v);
  return { ...parseAnnouncementListQuery(q), state: blank(q.state) ? undefined : oneOf(q.state, ANNOUNCEMENT_STATES) };
};
