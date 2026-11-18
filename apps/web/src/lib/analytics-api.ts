import { authenticatedRequest } from './api-client';
import type { AttendanceSummary } from './overview-api';

type Ref = { id: string; code: string; name: string };
type PaperFigures = { entries: number; passed: number; passPercentage: number | null; averageScore: number | null };
type ResultFigures = { published: number; passed: number; failed: number; passPercentage: number | null; averagePercentage: number | null };
type MoneySplit = { billed: number; collected: number; outstanding: number };

export type ExamPerformance = {
  id: string;
  name: string;
  startsOn: string;
  status: string;
  papers: number;
  approvedPapers: number;
  marks: PaperFigures;
  results: ResultFigures;
};

export type DepartmentComparison = {
  department: Ref;
  students: number;
  faculty: number;
  studentsPerFaculty: number | null;
  attendance: number | null;
  shortage: number;
  assignmentCompletion: number | null;
  passPercentage: number | null;
  averageScore: number | null;
  collected: number;
  outstanding: number;
};

export type InstitutionAnalytics = {
  generatedAt: string;
  range: { from: string; to: string };
  filters: { departmentId: string | null; semester: number | null };
  options: { departments: Ref[]; semesters: number[] };
  threshold: number;
  students: {
    total: number;
    active: number;
    inactive: number;
    byCourse: Array<{ course: Ref; departmentId: string | null; students: number }>;
    bySemester: Array<{ semester: number; students: number }>;
    enrollmentTrend: Array<{ month: string; enrollments: number }>;
  };
  faculty: {
    total: number;
    active: number;
    inactive: number;
    withoutAccount: number;
    studentsPerFaculty: number | null;
    byDesignation: Array<{ designation: string; faculty: number }>;
  };
  attendance: {
    sessions: number;
    overall: AttendanceSummary;
    bySemester: Array<AttendanceSummary & { semester: number }>;
    byMonth: Array<AttendanceSummary & { month: string }>;
    shortage: { students: number; counted: number; percentage: number | null };
  };
  academics: {
    assignments: { due: number; expected: number; submitted: number; late: number; graded: number; completion: number | null };
    results: ResultFigures;
    papers: PaperFigures & { approved: number; total: number };
    exams: ExamPerformance[];
  };
  finance: {
    billed: number;
    paid: number;
    outstanding: number;
    collectionRate: number | null;
    overdue: { invoices: number; amount: number };
    collected: number;
    trend: Array<{ month: string; amount: number; payments: number }>;
    invoiceStatus: Array<{ status: 'PAID' | 'PARTIALLY_PAID' | 'UNPAID' | 'OVERDUE' | 'VOID'; invoices: number; amount: number }>;
    paymentStatus: Array<{ status: 'COMPLETED' | 'PENDING' | 'FAILED' | 'REFUNDED'; payments: number; amount: number }>;
    byCourse: Array<MoneySplit & { course: Ref; departmentId: string | null }>;
  };
  departments: DepartmentComparison[];
};

/** Admin only. Filters: `departmentId`, `semester` (number), `from` and `to` (YYYY-MM-DD). */
export function getInstitutionAnalytics(params: URLSearchParams): Promise<InstitutionAnalytics> {
  const query = params.toString();
  return authenticatedRequest(`/overview/analytics${query ? `?${query}` : ''}`);
}
