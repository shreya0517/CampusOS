import { authenticatedRequest } from './api-client';

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';

export type ClassSubject = { id: string; name: string; code: string };
export type ClassFaculty = { id: string; firstName: string; lastName: string; employeeCode: string } | null;
export type ClassSection = { id: string; code: string; semester: { id: string; name: string; course: { id: string; name: string; code: string; department: { id: string; name: string; code: string } } } };
export type ClassRecord = { id: string; collegeId: string; sectionId: string; subjectId: string; facultyId: string | null; section: ClassSection; subject: ClassSubject; faculty: ClassFaculty };

export type AttendanceStudentRef = { id: string; firstName: string; lastName: string; studentCode: string };
export type AttendanceRecordItem = { id: string; studentId: string; status: AttendanceStatus; note: string | null; student: AttendanceStudentRef };
export type AttendanceSession = { id: string; classId: string; heldOn: string; class: ClassRecord; records: AttendanceRecordItem[] };

type List<T> = { items: T[]; total: number; page: number; pageSize: number };

export const listClasses = (q: URLSearchParams): Promise<List<ClassRecord>> => authenticatedRequest(`/classes?${q}`);
export const listAttendance = (q: URLSearchParams): Promise<List<AttendanceSession>> => authenticatedRequest(`/attendance?${q}`);
export const getAttendance = (id: string): Promise<AttendanceSession> => authenticatedRequest(`/attendance/${id}`);
export const createAttendance = (input: { classId: string; heldOn: string; records: { studentId: string; status: AttendanceStatus; note?: string }[] }): Promise<AttendanceSession> =>
  authenticatedRequest('/attendance', { method: 'POST', body: JSON.stringify(input) });
export const updateAttendance = (id: string, input: { records: { studentId: string; status: AttendanceStatus; note?: string }[] }): Promise<AttendanceSession> =>
  authenticatedRequest(`/attendance/${id}`, { method: 'PUT', body: JSON.stringify(input) });
