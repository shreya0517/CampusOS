import { authenticatedRequest } from './api-client';

export type SubmissionStatus = 'DRAFT' | 'SUBMITTED' | 'LATE' | 'GRADED' | 'RETURNED';

export type SubmissionStudent = { id: string; firstName: string; lastName: string; studentCode: string };

export type Submission = {
  id: string;
  collegeId: string;
  assignmentId: string;
  studentId: string;
  status: SubmissionStatus;
  submittedAt: string | null;
  fileKey: string | null;
  marksAwarded: number | null;
  feedback: string | null;
  student?: SubmissionStudent;
};

export type ClassSubject = { id: string; name: string; code: string };
export type ClassFaculty = { id: string; firstName: string; lastName: string; employeeCode: string } | null;
export type ClassSection = { id: string; code: string; semester: { id: string; name: string; course: { id: string; name: string; code: string; department: { id: string; name: string; code: string } } } };
export type ClassRecord = { id: string; collegeId: string; sectionId: string; subjectId: string; facultyId: string | null; section: ClassSection; subject: ClassSubject; faculty: ClassFaculty };

export type Assignment = {
  id: string;
  collegeId: string;
  classId: string;
  title: string;
  description: string | null;
  dueAt: string | null;
  maxMarks: number;
  createdAt: string;
  class: ClassRecord;
  createdBy: { id: string; firstName: string; lastName: string } | null;
  _count?: { submissions: number };
  mySubmission?: Submission | null;
};

type List<T> = { items: T[]; total: number; page: number; pageSize: number };

export const listAssignments = (q: URLSearchParams): Promise<List<Assignment>> => authenticatedRequest(`/assignments?${q}`);
export const getAssignment = (id: string): Promise<Assignment> => authenticatedRequest(`/assignments/${id}`);
export const createAssignment = (input: { classId: string; title: string; description?: string; dueAt?: string; maxMarks: number }): Promise<Assignment> =>
  authenticatedRequest('/assignments', { method: 'POST', body: JSON.stringify(input) });
export const updateAssignment = (id: string, input: { title?: string; description?: string; dueAt?: string; maxMarks?: number }): Promise<Assignment> =>
  authenticatedRequest(`/assignments/${id}`, { method: 'PUT', body: JSON.stringify(input) });
export const deleteAssignment = (id: string): Promise<{ success: boolean }> =>
  authenticatedRequest(`/assignments/${id}`, { method: 'DELETE' });
export const submitAssignment = (id: string, input: { fileKey?: string; status?: SubmissionStatus }): Promise<Submission> =>
  authenticatedRequest(`/assignments/${id}/submissions`, { method: 'POST', body: JSON.stringify(input) });
export const listSubmissions = (id: string): Promise<Submission[]> => authenticatedRequest(`/assignments/${id}/submissions`);
export const gradeSubmission = (
  assignmentId: string,
  submissionId: string,
  input: { marksAwarded: number; feedback?: string; status?: SubmissionStatus },
): Promise<Submission> =>
  authenticatedRequest(`/assignments/${assignmentId}/submissions/${submissionId}/grade`, { method: 'PUT', body: JSON.stringify(input) });
