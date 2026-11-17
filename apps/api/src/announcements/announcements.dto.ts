import { BadRequestException } from '@nestjs/common';
import { AnnouncementAudience } from '@prisma/client';

export type CreateAnnouncementDto = { title: string; body: string; audience: AnnouncementAudience; publishedAt?: Date; expiresAt?: Date };
export type AnnouncementListQuery = { search?: string; page: number; pageSize: number };

type Body = Record<string, unknown>;
const invalid = (): never => { throw new BadRequestException({ code: 'INVALID_INPUT', message: 'Request input is invalid.' }); };
const object = (v: unknown): Body => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Body) : invalid());
const string = (v: unknown, min: number, max: number): string => (typeof v === 'string' && v.trim().length >= min && v.trim().length <= max ? v.trim() : invalid());
const optionalDate = (v: unknown): Date | undefined => {
  if (v === undefined || v === null || v === '') return undefined;
  const parsed = new Date(string(v, 1, 40));
  return Number.isNaN(parsed.valueOf()) ? invalid() : parsed;
};
const integer = (v: unknown, fallback: number, max: number): number => {
  if (v === undefined) return fallback;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 && n <= max ? n : invalid();
};

const AUDIENCES = Object.values(AnnouncementAudience) as string[];

export const parseCreateAnnouncementDto = (v: unknown): CreateAnnouncementDto => {
  const b = object(v);
  const audience = b.audience === undefined ? AnnouncementAudience.ALL : string(b.audience, 1, 20);
  if (!AUDIENCES.includes(audience)) invalid();
  const publishedAt = optionalDate(b.publishedAt);
  const expiresAt = optionalDate(b.expiresAt);
  if (expiresAt && expiresAt <= (publishedAt ?? new Date())) invalid();
  return { title: string(b.title, 3, 160), body: string(b.body, 1, 5000), audience: audience as AnnouncementAudience, publishedAt, expiresAt };
};

export const parseAnnouncementListQuery = (v: unknown): AnnouncementListQuery => {
  const q = object(v);
  return {
    search: q.search === undefined || q.search === '' ? undefined : string(q.search, 1, 100),
    page: integer(q.page, 1, 10_000),
    pageSize: integer(q.pageSize, 10, 50),
  };
};
