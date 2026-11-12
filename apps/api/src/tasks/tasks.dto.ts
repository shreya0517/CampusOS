import { BadRequestException } from '@nestjs/common';
import { TaskPriority, TaskStatus } from '@prisma/client';

export type CreateTaskDto = {
  title: string;
  description?: string;
  priority: TaskPriority;
  deadline: Date;
  departmentId?: string;
};

export type UpdateTaskDto = {
  title?: string;
  description?: string;
  priority?: TaskPriority;
  deadline?: Date;
  departmentId?: string;
};

export type AssignTaskDto = {
  assigneeUserId: string;
  notes?: string;
};

export type UpdateAssignmentStatusDto = {
  status: TaskStatus;
  notes?: string;
};

export type SubmitTaskDto = {
  content: string;
};

export type ReviewTaskDto = {
  decision: 'APPROVED' | 'REWORK';
  notes?: string;
};

export type TaskListQuery = {
  status?: string;
  assigneeUserId?: string;
  departmentId?: string;
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

const VALID_TASK_PRIORITIES = Object.values(TaskPriority) as string[];
const VALID_TASK_STATUSES = Object.values(TaskStatus) as string[];

export const parseCreateTaskDto = (v: unknown): CreateTaskDto => {
  const b = object(v);
  const priority = string(b.priority);
  if (!VALID_TASK_PRIORITIES.includes(priority)) invalid();
  return {
    title: string(b.title),
    description: optionalString(b.description),
    priority: priority as TaskPriority,
    deadline: date(b.deadline),
    departmentId: optionalString(b.departmentId),
  };
};

export const parseUpdateTaskDto = (v: unknown): UpdateTaskDto => {
  const b = object(v);
  const priority = b.priority === undefined ? undefined : string(b.priority);
  if (priority !== undefined && !VALID_TASK_PRIORITIES.includes(priority)) invalid();
  const result: UpdateTaskDto = {
    title: optionalString(b.title),
    description: optionalString(b.description),
    priority: priority as TaskPriority | undefined,
    deadline: b.deadline === undefined ? undefined : date(b.deadline),
    departmentId: optionalString(b.departmentId),
  };
  if (
    result.title === undefined &&
    result.description === undefined &&
    result.priority === undefined &&
    result.deadline === undefined &&
    result.departmentId === undefined
  ) {
    invalid();
  }
  return result;
};

export const parseAssignTaskDto = (v: unknown): AssignTaskDto => {
  const b = object(v);
  return {
    assigneeUserId: string(b.assigneeUserId),
    notes: optionalString(b.notes),
  };
};

export const parseUpdateAssignmentStatusDto = (v: unknown): UpdateAssignmentStatusDto => {
  const b = object(v);
  const status = string(b.status);
  if (!VALID_TASK_STATUSES.includes(status)) invalid();
  return {
    status: status as TaskStatus,
    notes: optionalString(b.notes),
  };
};

export const parseSubmitTaskDto = (v: unknown): SubmitTaskDto => {
  const b = object(v);
  return {
    content: string(b.content),
  };
};

export const parseReviewTaskDto = (v: unknown): ReviewTaskDto => {
  const b = object(v);
  const decision = string(b.decision);
  if (decision !== 'APPROVED' && decision !== 'REWORK') invalid();
  return {
    decision: decision as 'APPROVED' | 'REWORK',
    notes: optionalString(b.notes),
  };
};

export const parseTaskListQuery = (v: unknown): TaskListQuery => {
  const q = object(v);
  const status = q.status === undefined ? undefined : string(q.status);
  if (status !== undefined && !VALID_TASK_STATUSES.includes(status)) invalid();
  return {
    status,
    assigneeUserId: optionalString(q.assigneeUserId),
    departmentId: optionalString(q.departmentId),
    page: integer(q.page, 1, 10_000),
    pageSize: integer(q.pageSize, 20, 100),
  };
};
