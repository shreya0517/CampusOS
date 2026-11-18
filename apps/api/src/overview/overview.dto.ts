import { BadRequestException } from '@nestjs/common';
import type { AnalyticsQuery } from './institution-analytics.service';

type Query = Record<string, unknown>;
const invalid = (): never => {
  throw new BadRequestException({ code: 'INVALID_INPUT', message: 'Request input is invalid.' });
};
const object = (v: unknown): Query => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Query) : invalid());
const optionalString = (v: unknown): string | undefined => {
  if (v === undefined || v === '') return undefined;
  return typeof v === 'string' && v.trim() ? v.trim() : invalid();
};
const optionalDate = (v: unknown): string | undefined => {
  const s = optionalString(v);
  // Date.parse rolls impossible dates over (2026-02-31 becomes March 3), so check the date round-trips unchanged.
  if (s !== undefined && (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s)) || new Date(s).toISOString().slice(0, 10) !== s)) invalid();
  return s;
};

/** `departmentId`, `semester` (a semester number, 1 to 12) and `from` / `to` (YYYY-MM-DD); all optional. */
export const parseAnalyticsQuery = (v: unknown): AnalyticsQuery => {
  const q = object(v);
  const semester = optionalString(q.semester);
  const number = semester === undefined ? undefined : Number(semester);
  if (number !== undefined && (!Number.isInteger(number) || number < 1 || number > 12)) invalid();
  const from = optionalDate(q.from);
  const to = optionalDate(q.to);
  if (from && to && from > to) invalid();
  return { departmentId: optionalString(q.departmentId), semester: number, from, to };
};
