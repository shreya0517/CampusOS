import { authenticatedRequest } from './api-client';

export type TimetableEntry = {
  id: string;
  collegeId: string;
  classId: string;
  roomId: string;
  dayOfWeek: number;
  startsAt: string;
  endsAt: string;
  createdAt: string;
  updatedAt: string;
  class: {
    id: string;
    sectionId: string;
    subjectId: string;
    facultyId?: string | null;
    subject: {
      id: string;
      code: string;
      name: string;
    };
    section: {
      id: string;
      code: string;
      semester?: {
        name: string;
        course?: {
          name: string;
          code: string;
        };
      };
    };
    faculty?: {
      id: string;
      firstName: string;
      lastName: string;
      employeeCode: string;
    } | null;
  };
  room: {
    id: string;
    code: string;
    name: string;
    capacity?: number | null;
  };
};

export type RoomOption = {
  id: string;
  code: string;
  name: string;
  capacity?: number | null;
};

export type ClassOption = {
  id: string;
  sectionId: string;
  subjectId: string;
  facultyId?: string | null;
  subject: { id: string; code: string; name: string };
  section: { id: string; code: string };
  faculty?: { id: string; firstName: string; lastName: string } | null;
};

export type TimetableListResponse = {
  items: TimetableEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export async function listTimetableEntries(params?: URLSearchParams): Promise<TimetableListResponse> {
  const query = params ? `?${params.toString()}` : '';
  return authenticatedRequest<TimetableListResponse>(`/timetable${query}`);
}

export async function getMyTimetable(): Promise<TimetableEntry[]> {
  return authenticatedRequest<TimetableEntry[]>('/timetable/me');
}

export async function getRooms(): Promise<RoomOption[]> {
  return authenticatedRequest<RoomOption[]>('/timetable/rooms');
}

export async function getClasses(): Promise<ClassOption[]> {
  return authenticatedRequest<ClassOption[]>('/timetable/classes');
}

export async function createTimetableEntry(input: {
  classId: string;
  roomId: string;
  dayOfWeek: number;
  startsAt: string;
  endsAt: string;
}): Promise<TimetableEntry> {
  return authenticatedRequest<TimetableEntry>('/timetable', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function deleteTimetableEntry(id: string): Promise<{ success: boolean; id: string }> {
  return authenticatedRequest<{ success: boolean; id: string }>(`/timetable/${id}`, {
    method: 'DELETE',
  });
}
