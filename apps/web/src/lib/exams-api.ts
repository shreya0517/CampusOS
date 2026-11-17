import { authenticatedRequest } from './api-client';

export type ExamStatus = 'DRAFT' | 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
export type ResultStatus = 'PENDING' | 'PASSED' | 'FAILED';

export type Exam = {
  id: string;
  collegeId: string;
  name: string;
  status: ExamStatus;
  startsOn: string;
  endsOn: string;
  createdAt: string;
  updatedAt: string;
  _count?: {
    examSubjects: number;
    results: number;
  };
  examSubjects?: ExamSubject[];
  studentResult?: Result | null;
  studentMarks?: Mark[];
};

export type ExamSubject = {
  id: string;
  collegeId: string;
  examId: string;
  subjectId: string;
  semesterId: string;
  sectionId?: string | null;
  examAt: string;
  maxMarks: number;
  passMarks: number;
  subject?: { id: string; code: string; name: string };
  semester?: { id: string; name: string };
  section?: { id: string; code: string };
  exam?: Exam;
};

export type Mark = {
  id: string;
  collegeId: string;
  examSubjectId: string;
  studentId: string;
  marksObtained?: number | null;
  isAbsent: boolean;
  examSubject?: ExamSubject;
};

export type Result = {
  id: string;
  collegeId: string;
  examId: string;
  studentId: string;
  totalMarks?: number | null;
  percentage?: number | null;
  status: ResultStatus;
  publishedAt?: string | null;
  exam?: Exam;
  student?: { id: string; studentCode: string; firstName: string; lastName: string };
};

export type ListResponse<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

export function listExams(params = new URLSearchParams()): Promise<ListResponse<Exam>> {
  return authenticatedRequest(`/exams?${params}`);
}

export function getExam(id: string): Promise<Exam> {
  return authenticatedRequest(`/exams/${id}`);
}

export function createExam(input: { name: string; status?: ExamStatus; startsOn: string; endsOn: string }): Promise<Exam> {
  return authenticatedRequest('/exams', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateExam(id: string, input: Partial<{ name: string; status: ExamStatus; startsOn: string; endsOn: string }>): Promise<Exam> {
  return authenticatedRequest(`/exams/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export function deleteExam(id: string): Promise<{ success: boolean }> {
  return authenticatedRequest(`/exams/${id}`, {
    method: 'DELETE',
  });
}

export function addExamSubject(
  examId: string,
  input: { subjectId: string; semesterId: string; sectionId?: string; examAt: string; maxMarks: number; passMarks: number },
): Promise<ExamSubject> {
  return authenticatedRequest(`/exams/${examId}/subjects`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function removeExamSubject(examId: string, examSubjectId: string): Promise<{ success: boolean }> {
  return authenticatedRequest(`/exams/${examId}/subjects/${examSubjectId}`, {
    method: 'DELETE',
  });
}

export function getSubjectMarks(
  examId: string,
  examSubjectId: string,
): Promise<{
  examSubject: ExamSubject;
  items: Array<{ student: { id: string; studentCode: string; firstName: string; lastName: string }; mark: Mark | null }>;
}> {
  return authenticatedRequest(`/exams/${examId}/subjects/${examSubjectId}/marks`);
}

export function updateSubjectMarks(
  examId: string,
  examSubjectId: string,
  input: { marks: Array<{ studentId: string; marksObtained?: number | null; isAbsent?: boolean }> },
): Promise<{ success: boolean; count: number }> {
  return authenticatedRequest(`/exams/${examId}/subjects/${examSubjectId}/marks`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export function calculateAndPublishResults(examId: string): Promise<{ success: boolean; processedStudents: number }> {
  return authenticatedRequest(`/exams/${examId}/calculate-results`, {
    method: 'POST',
  });
}

export function listExamResults(examId: string): Promise<{ exam: Exam; results: Result[] }> {
  return authenticatedRequest(`/exams/${examId}/results`);
}

export function getMyResults(): Promise<{ results: Result[]; marks: Mark[] }> {
  return authenticatedRequest('/exams/me/results');
}
