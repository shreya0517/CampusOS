import { authenticatedRequest } from './api-client';

export type AttendanceSummary = {
  present: number;
  absent: number;
  late: number;
  excused: number;
  attended: number;
  counted: number;
  percentage: number | null;
  belowThreshold: boolean;
};

export type DepartmentOverview = {
  id: string;
  code: string;
  name: string;
  hod: { id: string; name: string; employeeCode: string } | null;
  faculty: number;
  students: number;
  attendance: AttendanceSummary;
  openTasks: number;
};

export type ActivityItem = { type: string; title: string; detail: string; at: string; href: string | null };

export type InstitutionOverview = {
  generatedAt: string;
  windowDays: number;
  totals: { students: number; faculty: number; departments: number };
  attendance: { today: AttendanceSummary; window: AttendanceSummary };
  tasks: { pending: number; inProgress: number; submitted: number; approved: number; rework: number; overdue: number };
  pendingVisitors: number;
  upcomingExams: number;
  fees: { collected: number; outstanding: number; openInvoices: number; overdueInvoices: number };
  departments: DepartmentOverview[];
  recentActivity: ActivityItem[];
};

export function getInstitutionOverview(): Promise<InstitutionOverview> {
  return authenticatedRequest('/overview/institution');
}
