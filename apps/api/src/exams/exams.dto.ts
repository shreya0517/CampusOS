import { BadRequestException } from '@nestjs/common';
import { ExamStatus } from '@prisma/client';

/** Bad input is the client's mistake: a 400 with the reason, not a plain Error that surfaced as a 500. */
function invalid(message: string): never {
  throw new BadRequestException({ code: 'INVALID_INPUT', message });
}

export type CreateExamDto = {
  name: string;
  status?: ExamStatus;
  startsOn: string;
  endsOn: string;
};

export type UpdateExamDto = Partial<CreateExamDto>;

export type CreateExamSubjectDto = {
  subjectId: string;
  semesterId: string;
  sectionId?: string;
  examAt: string;
  maxMarks: number;
  passMarks: number;
};

export type MarkEntryDto = {
  studentId: string;
  marksObtained?: number | null;
  isAbsent?: boolean;
};

export type UpdateMarksDto = {
  marks: MarkEntryDto[];
};

export type ExamListQuery = {
  search?: string;
  status?: ExamStatus;
  page: number;
  pageSize: number;
};

export function parseExamListQuery(query: unknown): ExamListQuery {
  const q = (query ?? {}) as Record<string, unknown>;
  const page = q.page ? Number(q.page) : 1;
  const pageSize = q.pageSize ? Number(q.pageSize) : 20;

  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    invalid('Invalid pagination parameters');
  }

  const statusVal = typeof q.status === 'string' ? q.status.toUpperCase() : undefined;
  const status = statusVal && Object.values(ExamStatus).includes(statusVal as ExamStatus) ? (statusVal as ExamStatus) : undefined;

  return {
    search: typeof q.search === 'string' ? q.search.trim() : undefined,
    status,
    page,
    pageSize,
  };
}

export function parseCreateExamDto(body: unknown): CreateExamDto {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.name !== 'string' || !b.name.trim()) {
    invalid('Exam name is required');
  }
  if (typeof b.startsOn !== 'string' || isNaN(Date.parse(b.startsOn))) {
    invalid('Valid startsOn date is required');
  }
  if (typeof b.endsOn !== 'string' || isNaN(Date.parse(b.endsOn))) {
    invalid('Valid endsOn date is required');
  }

  let status: ExamStatus | undefined;
  if (typeof b.status === 'string') {
    const s = b.status.toUpperCase();
    if (Object.values(ExamStatus).includes(s as ExamStatus)) {
      status = s as ExamStatus;
    }
  }

  return {
    name: b.name.trim(),
    status,
    startsOn: b.startsOn,
    endsOn: b.endsOn,
  };
}

export function parseUpdateExamDto(body: unknown): UpdateExamDto {
  const b = (body ?? {}) as Record<string, unknown>;
  const result: UpdateExamDto = {};

  if (typeof b.name === 'string' && b.name.trim()) {
    result.name = b.name.trim();
  }
  if (typeof b.startsOn === 'string' && !isNaN(Date.parse(b.startsOn))) {
    result.startsOn = b.startsOn;
  }
  if (typeof b.endsOn === 'string' && !isNaN(Date.parse(b.endsOn))) {
    result.endsOn = b.endsOn;
  }
  if (typeof b.status === 'string') {
    const s = b.status.toUpperCase();
    if (Object.values(ExamStatus).includes(s as ExamStatus)) {
      result.status = s as ExamStatus;
    }
  }

  return result;
}

export function parseCreateExamSubjectDto(body: unknown): CreateExamSubjectDto {
  const b = (body ?? {}) as Record<string, unknown>;
  if (typeof b.subjectId !== 'string' || !b.subjectId.trim()) {
    invalid('subjectId is required');
  }
  if (typeof b.semesterId !== 'string' || !b.semesterId.trim()) {
    invalid('semesterId is required');
  }
  if (typeof b.examAt !== 'string' || isNaN(Date.parse(b.examAt))) {
    invalid('Valid examAt date is required');
  }
  const maxMarks = Number(b.maxMarks);
  const passMarks = Number(b.passMarks);
  if (isNaN(maxMarks) || maxMarks <= 0) {
    invalid('maxMarks must be a positive number');
  }
  if (isNaN(passMarks) || passMarks < 0 || passMarks > maxMarks) {
    invalid('passMarks must be a non-negative number <= maxMarks');
  }

  return {
    subjectId: b.subjectId.trim(),
    semesterId: b.semesterId.trim(),
    sectionId: typeof b.sectionId === 'string' && b.sectionId.trim() ? b.sectionId.trim() : undefined,
    examAt: b.examAt,
    maxMarks,
    passMarks,
  };
}

export function parseUpdateMarksDto(body: unknown): UpdateMarksDto {
  const b = (body ?? {}) as Record<string, unknown>;
  if (!Array.isArray(b.marks)) {
    invalid('marks must be an array');
  }

  const marks: MarkEntryDto[] = b.marks.map((item: unknown) => {
    const m = (item ?? {}) as Record<string, unknown>;
    if (typeof m.studentId !== 'string' || !m.studentId.trim()) {
      invalid('Each mark entry requires a studentId');
    }

    const marksObtained = m.marksObtained !== undefined && m.marksObtained !== null ? Number(m.marksObtained) : null;
    if (marksObtained !== null && (isNaN(marksObtained) || marksObtained < 0)) {
      invalid('marksObtained must be a non-negative number');
    }

    return {
      studentId: m.studentId.trim(),
      marksObtained,
      isAbsent: Boolean(m.isAbsent),
    };
  });

  return { marks };
}

export type ReviewMarksDto = { decision: 'APPROVED' | 'RETURNED'; comment?: string };

/** An HOD or Admin approves submitted marks or returns them to the faculty member, optionally with a comment. */
export function parseReviewMarksDto(body: unknown): ReviewMarksDto {
  const b = (body ?? {}) as Record<string, unknown>;
  const invalid = (): never => {
    throw new BadRequestException({ code: 'INVALID_INPUT', message: 'Choose APPROVED or RETURNED, with an optional comment of up to 500 characters.' });
  };
  if (b.decision !== 'APPROVED' && b.decision !== 'RETURNED') invalid();
  if (b.comment !== undefined && (typeof b.comment !== 'string' || b.comment.trim().length > 500)) invalid();
  const comment = typeof b.comment === 'string' && b.comment.trim() ? b.comment.trim() : undefined;
  return { decision: b.decision as ReviewMarksDto['decision'], comment };
}
