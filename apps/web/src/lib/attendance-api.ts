import { authenticatedRequest } from './api-client';

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';

export type ClassSubject = { id: string; name: string; code: string };
export type ClassFaculty = { id: string; firstName: string; lastName: string; employeeCode: string } | null;
export type ClassSection = { id: string; code: string; semester: { id: string; name: string; course: { id: string; name: string; code: string; department: { id: string; name: string; code: string } } } };
export type ClassRecord = { id: string; collegeId: string; sectionId: string; subjectId: string; facultyId: string | null; section: ClassSection; subject: ClassSubject; faculty: ClassFaculty };

export type AttendanceStudentRef = { id: string; firstName: string; lastName: string; studentCode: string };
export type AttendanceRecordItem = { id: string; studentId: string; status: AttendanceStatus; note: string | null; student: AttendanceStudentRef };
export type AttendanceSession = { id: string; classId: string; heldOn: string; createdAt: string; correctionWindowEndsAt: string; class: ClassRecord; records: AttendanceRecordItem[] };
type RecordState = { status: AttendanceStatus; note: string | null };
export type AttendanceHistoryEntry = {
  id: string;
  action: 'ATTENDANCE_MARKED' | 'ATTENDANCE_CORRECTED';
  createdAt: string;
  actor: { id: string; displayName: string } | null;
  changes: Array<{ studentId: string; from: RecordState | null; to: RecordState | null; student: AttendanceStudentRef | null }>;
};

type List<T> = { items: T[]; total: number; page: number; pageSize: number };

export const listClasses = (q: URLSearchParams): Promise<List<ClassRecord>> => authenticatedRequest(`/classes?${q}`);
export const listAttendance = (q: URLSearchParams): Promise<List<AttendanceSession>> => authenticatedRequest(`/attendance?${q}`);
export const getAttendance = (id: string): Promise<AttendanceSession> => authenticatedRequest(`/attendance/${id}`);
export const getAttendanceHistory = (id: string): Promise<AttendanceHistoryEntry[]> => authenticatedRequest(`/attendance/${id}/history`);
export const createAttendance = (input: { classId: string; heldOn: string; records: { studentId: string; status: AttendanceStatus; note?: string }[] }): Promise<AttendanceSession> =>
  authenticatedRequest('/attendance', { method: 'POST', body: JSON.stringify(input) });
export const updateAttendance = (id: string, input: { records: { studentId: string; status: AttendanceStatus; note?: string }[] }): Promise<AttendanceSession> =>
  authenticatedRequest(`/attendance/${id}`, { method: 'PUT', body: JSON.stringify(input) });

export type AttendanceSummary = { present: number; absent: number; late: number; excused: number; attended: number; counted: number; percentage: number | null; belowThreshold: boolean };
export type MySubjectAttendance = AttendanceSummary & { subject: ClassSubject; faculty: { firstName: string; lastName: string } | null };
export type MyAttendanceDay = AttendanceSummary & { date: string };
export type MyAttendanceRecord = { id: string; status: AttendanceStatus; note: string | null; heldOn: string; subject: ClassSubject };
export type MyAttendance = { threshold: number; overall: AttendanceSummary; subjects: MySubjectAttendance[]; days: MyAttendanceDay[]; records: List<MyAttendanceRecord> };

export const getMyAttendance = (q: URLSearchParams = new URLSearchParams()): Promise<MyAttendance> => authenticatedRequest(`/attendance/me?${q}`);
