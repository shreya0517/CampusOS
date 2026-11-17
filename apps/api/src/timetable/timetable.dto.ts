export type CreateTimetableDto = {
  classId: string;
  roomId: string;
  dayOfWeek: number;
  startsAt: string;
  endsAt: string;
};

export type TimetableListQuery = {
  classId?: string;
  roomId?: string;
  sectionId?: string;
  facultyId?: string;
  dayOfWeek?: number;
  page: number;
  pageSize: number;
};

export function parseCreateTimetableDto(body: unknown): CreateTimetableDto {
  const b = (body ?? {}) as Record<string, unknown>;

  if (typeof b.classId !== 'string' || !b.classId.trim()) {
    throw new Error('classId is required');
  }
  if (typeof b.roomId !== 'string' || !b.roomId.trim()) {
    throw new Error('roomId is required');
  }

  const dayOfWeek = Number(b.dayOfWeek);
  if (isNaN(dayOfWeek) || !Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    throw new Error('dayOfWeek must be an integer between 0 (Sunday) and 6 (Saturday)');
  }

  if (typeof b.startsAt !== 'string' || !b.startsAt.trim()) {
    throw new Error('startsAt is required');
  }
  if (typeof b.endsAt !== 'string' || !b.endsAt.trim()) {
    throw new Error('endsAt is required');
  }

  return {
    classId: b.classId.trim(),
    roomId: b.roomId.trim(),
    dayOfWeek,
    startsAt: b.startsAt.trim(),
    endsAt: b.endsAt.trim(),
  };
}

export function parseTimetableListQuery(query: unknown): TimetableListQuery {
  const q = (query ?? {}) as Record<string, unknown>;
  const page = q.page ? Number(q.page) : 1;
  const pageSize = q.pageSize ? Number(q.pageSize) : 50;

  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 200) {
    throw new Error('Invalid pagination parameters');
  }

  let dayOfWeek: number | undefined;
  if (q.dayOfWeek !== undefined && q.dayOfWeek !== '') {
    const d = Number(q.dayOfWeek);
    if (Number.isInteger(d) && d >= 0 && d <= 6) {
      dayOfWeek = d;
    }
  }

  return {
    classId: typeof q.classId === 'string' && q.classId.trim() ? q.classId.trim() : undefined,
    roomId: typeof q.roomId === 'string' && q.roomId.trim() ? q.roomId.trim() : undefined,
    sectionId: typeof q.sectionId === 'string' && q.sectionId.trim() ? q.sectionId.trim() : undefined,
    facultyId: typeof q.facultyId === 'string' && q.facultyId.trim() ? q.facultyId.trim() : undefined,
    dayOfWeek,
    page,
    pageSize,
  };
}
