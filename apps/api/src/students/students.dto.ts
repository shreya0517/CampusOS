import { BadRequestException } from '@nestjs/common';
import { EnrollmentStatus } from '@prisma/client';

export type CreateStudentDto = { studentCode: string; firstName: string; lastName: string; dateOfBirth?: Date; sectionId: string };
export type UpdateStudentDto = { firstName?: string; lastName?: string; dateOfBirth?: Date | null };
export type EnrollmentDto = { sectionId: string; status?: EnrollmentStatus };
export type StudentListQuery = { search?: string; departmentId?: string; courseId?: string; semesterId?: string; sectionId?: string; page: number; pageSize: number };

type Body = Record<string, unknown>;
const invalid = (): never => { throw new BadRequestException({ code: 'INVALID_INPUT', message: 'Request input is invalid.' }); };
const object = (value: unknown): Body => value && typeof value === 'object' && !Array.isArray(value) ? value as Body : invalid();
const string = (value: unknown, min = 1): string => typeof value === 'string' && value.trim().length >= min ? value.trim() : invalid();
const optionalString = (value: unknown): string | undefined => value === undefined ? undefined : string(value);
const date = (value: unknown): Date => { const parsed = new Date(string(value)); return Number.isNaN(parsed.valueOf()) ? invalid() : parsed; };

export const parseCreateStudentDto = (value: unknown): CreateStudentDto => { const body = object(value); return { studentCode: string(body.studentCode), firstName: string(body.firstName, 2), lastName: string(body.lastName, 2), dateOfBirth: body.dateOfBirth === undefined ? undefined : date(body.dateOfBirth), sectionId: string(body.sectionId) }; };
export const parseUpdateStudentDto = (value: unknown): UpdateStudentDto => { const body = object(value); const result = { firstName: optionalString(body.firstName), lastName: optionalString(body.lastName), dateOfBirth: body.dateOfBirth === undefined ? undefined : body.dateOfBirth === null ? null : date(body.dateOfBirth) }; if (result.firstName === undefined && result.lastName === undefined && result.dateOfBirth === undefined) invalid(); if (result.firstName !== undefined && result.firstName.length < 2 || result.lastName !== undefined && result.lastName.length < 2) invalid(); return result; };
export const parseEnrollmentDto = (value: unknown): EnrollmentDto => { const body = object(value); const status = body.status === undefined ? undefined : string(body.status); if (status !== undefined && !Object.values(EnrollmentStatus).includes(status as EnrollmentStatus)) invalid(); return { sectionId: string(body.sectionId), status: status as EnrollmentStatus | undefined }; };
export const parseStudentListQuery = (value: unknown): StudentListQuery => { const query = object(value); const integer = (input: unknown, fallback: number, max: number) => { if (input === undefined) return fallback; const parsed = Number(input); return Number.isInteger(parsed) && parsed > 0 && parsed <= max ? parsed : invalid(); }; return { search: optionalString(query.search), departmentId: optionalString(query.departmentId), courseId: optionalString(query.courseId), semesterId: optionalString(query.semesterId), sectionId: optionalString(query.sectionId), page: integer(query.page, 1, 10_000), pageSize: integer(query.pageSize, 20, 100) }; };