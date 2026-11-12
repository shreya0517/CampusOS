import { BadRequestException } from '@nestjs/common';
import { SubmissionStatus } from '@prisma/client';

export type CreateAssignmentDto = {
  classId: string;
  title: string;
  description?: string;
  dueAt?: Date;
  maxMarks: number;
};

export type UpdateAssignmentDto = {
  title?: string;
  description?: string;
  dueAt?: Date | null;
  maxMarks?: number;
};

export type AssignmentListQuery = {
  classId?: string;
  search?: string;
  page: number;
  pageSize: number;
};

export type SubmitAssignmentDto = {
  fileKey?: string;
  status?: SubmissionStatus;
};

export type GradeSubmissionDto = {
  marksAwarded: number;
  feedback?: string;
  status?: SubmissionStatus;
};

type Body = Record<string, unknown>;
const invalid = (): never => {
  throw new BadRequestException({ code: 'INVALID_INPUT', message: 'Request input is invalid.' });
};

const object = (v: unknown): Body => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Body) : invalid());
const string = (v: unknown, min = 1): string => (typeof v === 'string' && v.trim().length >= min ? v.trim() : invalid());
const optionalString = (v: unknown): string | undefined => (v === undefined ? undefined : string(v));
const date = (v: unknown): Date => {
  const parsed = new Date(string(v));
  return Number.isNaN(parsed.valueOf()) ? invalid() : parsed;
};
const number = (v: unknown, min = 0): number => {
  const n = Number(v);
  return typeof n === 'number' && !Number.isNaN(n) && n >= min ? n : invalid();
};

const integer = (v: unknown, fallback: number, max: number): number => {
  if (v === undefined) return fallback;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 && n <= max ? n : invalid();
};

const VALID_SUBMISSION_STATUSES = Object.values(SubmissionStatus) as string[];

export const parseCreateAssignmentDto = (v: unknown): CreateAssignmentDto => {
  const b = object(v);
  return {
    classId: string(b.classId),
    title: string(b.title),
    description: optionalString(b.description),
    dueAt: b.dueAt === undefined ? undefined : date(b.dueAt),
    maxMarks: number(b.maxMarks, 0),
  };
};

export const parseUpdateAssignmentDto = (v: unknown): UpdateAssignmentDto => {
  const b = object(v);
  const result: UpdateAssignmentDto = {
    title: optionalString(b.title),
    description: b.description === null ? undefined : optionalString(b.description),
    dueAt: b.dueAt === undefined ? undefined : b.dueAt === null ? null : date(b.dueAt),
    maxMarks: b.maxMarks === undefined ? undefined : number(b.maxMarks, 0),
  };
  if (result.title === undefined && result.description === undefined && result.dueAt === undefined && result.maxMarks === undefined) {
    invalid();
  }
  return result;
};

export const parseAssignmentListQuery = (v: unknown): AssignmentListQuery => {
  const q = object(v);
  return {
    classId: optionalString(q.classId),
    search: optionalString(q.search),
    page: integer(q.page, 1, 10_000),
    pageSize: integer(q.pageSize, 20, 100),
  };
};

export const parseSubmitAssignmentDto = (v: unknown): SubmitAssignmentDto => {
  const b = object(v);
  const status = b.status === undefined ? undefined : string(b.status);
  if (status !== undefined && !VALID_SUBMISSION_STATUSES.includes(status)) invalid();
  return {
    fileKey: optionalString(b.fileKey),
    status: status as SubmissionStatus | undefined,
  };
};

export const parseGradeSubmissionDto = (v: unknown): GradeSubmissionDto => {
  const b = object(v);
  const status = b.status === undefined ? undefined : string(b.status);
  if (status !== undefined && !VALID_SUBMISSION_STATUSES.includes(status)) invalid();
  return {
    marksAwarded: number(b.marksAwarded, 0),
    feedback: optionalString(b.feedback),
    status: status as SubmissionStatus | undefined,
  };
};
