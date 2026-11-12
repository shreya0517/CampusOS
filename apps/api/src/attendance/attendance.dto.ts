import { BadRequestException } from '@nestjs/common';
import { AttendanceStatus } from '@prisma/client';

export type AttendanceRecordInput = { studentId: string; status: AttendanceStatus; note?: string };
export type CreateAttendanceDto = { classId: string; heldOn: string; records: AttendanceRecordInput[] };
export type UpdateAttendanceDto = { records: AttendanceRecordInput[] };
export type AttendanceListQuery = { classId?: string; from?: string; to?: string; page: number; pageSize: number };
export type ClassListQuery = { departmentId?: string; sectionId?: string; page: number; pageSize: number };

type Body = Record<string, unknown>;
const invalid = (): never => { throw new BadRequestException({ code: 'INVALID_INPUT', message: 'Request input is invalid.' }); };
const object = (v: unknown): Body => v && typeof v === 'object' && !Array.isArray(v) ? v as Body : invalid();
const string = (v: unknown, min = 1): string => typeof v === 'string' && v.trim().length >= min ? v.trim() : invalid();
const optionalString = (v: unknown): string | undefined => v === undefined ? undefined : string(v);
const integer = (v: unknown, fallback: number, max: number): number => { if (v === undefined) return fallback; const n = Number(v); return Number.isInteger(n) && n > 0 && n <= max ? n : invalid(); };

const VALID_STATUSES = Object.values(AttendanceStatus) as string[];
const attendanceStatus = (v: unknown): AttendanceStatus => { const s = string(v); if (!VALID_STATUSES.includes(s)) invalid(); return s as AttendanceStatus; };

const parseRecord = (v: unknown): AttendanceRecordInput => {
  const b = object(v);
  return { studentId: string(b.studentId), status: attendanceStatus(b.status), note: optionalString(b.note) };
};

export const parseCreateAttendanceDto = (v: unknown): CreateAttendanceDto => {
  const b = object(v);
  const classId = string(b.classId);
  const heldOn = string(b.heldOn);
  if (Number.isNaN(Date.parse(heldOn))) invalid();
  const raw = b.records;
  if (!Array.isArray(raw) || raw.length === 0) invalid();
  return { classId, heldOn, records: (raw as unknown[]).map(parseRecord) };
};

export const parseUpdateAttendanceDto = (v: unknown): UpdateAttendanceDto => {
  const b = object(v);
  const raw = b.records;
  if (!Array.isArray(raw) || raw.length === 0) invalid();
  return { records: (raw as unknown[]).map(parseRecord) };
};

export const parseAttendanceListQuery = (v: unknown): AttendanceListQuery => {
  const q = object(v);
  return { classId: optionalString(q.classId), from: optionalString(q.from), to: optionalString(q.to), page: integer(q.page, 1, 10_000), pageSize: integer(q.pageSize, 20, 100) };
};

export const parseClassListQuery = (v: unknown): ClassListQuery => {
  const q = object(v);
  return { departmentId: optionalString(q.departmentId), sectionId: optionalString(q.sectionId), page: integer(q.page, 1, 10_000), pageSize: integer(q.pageSize, 20, 100) };
};
