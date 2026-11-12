import { BadRequestException } from '@nestjs/common';
import { VisitorStatus } from '@prisma/client';

export type CreateVisitorDto = {
  name: string;
  phone: string;
  email?: string;
  purpose: string;
  hostUserId?: string;
  visitDate: Date;
};

export type ReviewVisitorDto = {
  decision: 'APPROVED' | 'REJECTED';
  notes?: string;
};

export type VisitorListQuery = {
  status?: string;
  page: number;
  pageSize: number;
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
const integer = (v: unknown, fallback: number, max: number): number => {
  if (v === undefined) return fallback;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 && n <= max ? n : invalid();
};

const VALID_VISITOR_STATUSES = Object.values(VisitorStatus) as string[];

export const parseCreateVisitorDto = (v: unknown): CreateVisitorDto => {
  const b = object(v);
  return {
    name: string(b.name),
    phone: string(b.phone),
    email: optionalString(b.email),
    purpose: string(b.purpose),
    hostUserId: optionalString(b.hostUserId),
    visitDate: date(b.visitDate),
  };
};

export const parseReviewVisitorDto = (v: unknown): ReviewVisitorDto => {
  const b = object(v);
  const decision = string(b.decision);
  if (decision !== 'APPROVED' && decision !== 'REJECTED') invalid();
  return {
    decision: decision as 'APPROVED' | 'REJECTED',
    notes: optionalString(b.notes),
  };
};

export const parseVisitorListQuery = (v: unknown): VisitorListQuery => {
  const q = object(v);
  const status = q.status === undefined ? undefined : string(q.status);
  if (status !== undefined && !VALID_VISITOR_STATUSES.includes(status)) invalid();
  return {
    status,
    page: integer(q.page, 1, 10_000),
    pageSize: integer(q.pageSize, 20, 100),
  };
};
