import { BadRequestException } from '@nestjs/common';
import { FileVisibility } from '@prisma/client';

export type RequestPresignedUploadDto = {
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  visibility?: FileVisibility;
};

export type FileListQuery = {
  search?: string;
  visibility?: FileVisibility;
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

const number = (v: unknown, min = 1): number => {
  const n = Number(v);
  return typeof n === 'number' && !Number.isNaN(n) && n >= min ? n : invalid();
};

const integer = (v: unknown, fallback: number, max: number): number => {
  if (v === undefined) return fallback;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 && n <= max ? n : invalid();
};

const VALID_VISIBILITIES = Object.values(FileVisibility) as string[];

export const parseRequestPresignedUploadDto = (v: unknown): RequestPresignedUploadDto => {
  const b = object(v);
  const vis = b.visibility === undefined ? undefined : string(b.visibility);
  if (vis !== undefined && !VALID_VISIBILITIES.includes(vis)) invalid();

  return {
    originalName: string(b.originalName),
    mimeType: string(b.mimeType),
    sizeBytes: number(b.sizeBytes, 1),
    visibility: vis as FileVisibility | undefined,
  };
};

export const parseFileListQuery = (v: unknown): FileListQuery => {
  const q = object(v);
  const vis = q.visibility === undefined ? undefined : string(q.visibility);
  if (vis !== undefined && !VALID_VISIBILITIES.includes(vis)) invalid();

  return {
    search: optionalString(q.search),
    visibility: vis as FileVisibility | undefined,
    page: integer(q.page, 1, 10_000),
    pageSize: integer(q.pageSize, 20, 100),
  };
};
