import { authenticatedDownload, authenticatedRequest } from './api-client';
export type Enrollment = { id: string; status: 'ACTIVE' | 'COMPLETED' | 'WITHDRAWN'; section: { id: string; code: string; semester: { id: string; name: string; number: number; course: { id: string; code: string; name: string; department: { id: string; code: string; name: string } } } } };
export type AccountStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
/** Present for Admin and HOD: the student's sign-in email and status, or null when no account exists. Faculty never receive it. */
export type StudentAccount = { email: string; status: AccountStatus } | null;
export type Student = { id: string; studentCode: string; firstName: string; lastName: string; dateOfBirth: string | null; phone?: string | null; address?: string | null; enrollments: Enrollment[]; account?: StudentAccount };
export type MyStudent = Student & { college: { name: string; code: string }; user: { email: string; status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'; emailVerifiedAt: string | null } | null };
type StudentList = { items: Student[]; page: number; pageSize: number; total: number };
export const listStudents = (params: URLSearchParams): Promise<StudentList> => authenticatedRequest(`/students?${params.toString()}`);
export const getStudent = (id: string): Promise<Student> => authenticatedRequest(`/students/${id}`);
export const updateStudent = (id: string, input: { firstName: string; lastName: string; dateOfBirth?: string }): Promise<Student> => authenticatedRequest(`/students/${id}`, { method: 'PUT', body: JSON.stringify(input) });
export const updateEnrollment = (id: string, input: { sectionId: string; status: Enrollment['status'] }): Promise<Enrollment> => authenticatedRequest(`/students/${id}/enrollments`, { method: 'POST', body: JSON.stringify(input) });
export const getMyStudent = (): Promise<MyStudent> => authenticatedRequest('/students/me');
export const updateMyContact = (input: { phone: string | null; address: string | null }): Promise<MyStudent> => authenticatedRequest('/students/me', { method: 'PUT', body: JSON.stringify(input) });

export type SectionOption = Enrollment['section'];
export type AttendanceSummary = { present: number; absent: number; late: number; excused: number; attended: number; counted: number; percentage: number | null; belowThreshold: boolean };
export type CourseworkItem = { id: string; title: string; subject: { code: string; name: string }; dueAt: string | null; maxMarks: number; status: string; submittedAt: string | null; marksAwarded: number | null };
export type RecordInvoice = {
  id: string;
  invoiceNumber: string;
  amountDue: number;
  paid: number;
  balance: number;
  dueOn: string | null;
  status: string;
  issuedAt: string | null;
  payments: { id: string; amount: number; method: string; status: string; paidAt: string | null; transactionRef: string | null }[];
};
export type StudentRecord = {
  student: Student;
  attendance: { threshold: number; overall: AttendanceSummary; subjects: (AttendanceSummary & { subject: { id: string; code: string; name: string } })[] };
  coursework: { assigned: number; submitted: number; missing: number; items: CourseworkItem[] };
  results: { id: string; exam: { id: string; name: string }; totalMarks: number | null; percentage: number | null; status: string; publishedAt: string | null }[];
  /** Admin only; null for an HOD. */
  fees: { billed: number; paid: number; balance: number; invoices: RecordInvoice[] } | null;
};

export const listSections = (): Promise<SectionOption[]> => authenticatedRequest('/students/sections');
export const createStudent = (input: { studentCode: string; firstName: string; lastName: string; dateOfBirth?: string; sectionId: string }): Promise<Student> =>
  authenticatedRequest('/students', { method: 'POST', body: JSON.stringify(input) });
export const getStudentRecord = (id: string): Promise<StudentRecord> => authenticatedRequest(`/students/${id}/record`);
export const setStudentAccountStatus = (id: string, status: 'ACTIVE' | 'INACTIVE'): Promise<Student> =>
  authenticatedRequest(`/students/${id}/account`, { method: 'PUT', body: JSON.stringify({ status }) });
export const exportStudentsCsv = (params: URLSearchParams): Promise<Blob> => authenticatedDownload(`/students/export?${params.toString()}`);
