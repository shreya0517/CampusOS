import { authenticatedRequest } from './api-client';

export type Department = { id: string; code: string; name: string; faculty?: Faculty[] };
export type AccountStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
/** Sign-in email and status; sent to Admin and HOD only, null when the person has no account. */
export type FacultyAccount = { email: string; status: AccountStatus } | null;
export type FacultyClass = {
  id: string;
  status: string;
  subject: { id: string; code: string; name: string };
  section: { id: string; code: string; semester: { name: string; course: { code: string; name: string } } };
};
export type Faculty = {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  designation?: string | null;
  departmentId: string | null;
  department: Department | null;
  isHod?: boolean;
  classCount?: number;
  account?: FacultyAccount;
  /** Only on the single-record endpoint. */
  classes?: FacultyClass[];
};
type List<T> = { items: T[]; total: number; page: number; pageSize: number };

export const listFaculty = (q: URLSearchParams): Promise<List<Faculty>> => {
  const params = new URLSearchParams(q);
  const search = params.get('search')?.trim();
  if (search) params.set('search', search);
  else params.delete('search');
  return authenticatedRequest(`/faculty?${params}`);
};
export const getFaculty = (id: string): Promise<Faculty> => authenticatedRequest(`/faculty/${id}`);
export const getMyFaculty = (): Promise<Faculty> => authenticatedRequest('/faculty/me');
export const updateFaculty = (id: string, input: { employeeCode?: string; firstName?: string; lastName?: string; departmentId?: string | null; designation?: string | null }): Promise<Faculty> =>
  authenticatedRequest(`/faculty/${id}`, { method: 'PUT', body: JSON.stringify(input) });
/** Adds a faculty member; with an email it also creates their sign-in account and returns a temporary password once. */
export const createFaculty = (input: { employeeCode: string; firstName: string; lastName: string; departmentId?: string; designation?: string; email?: string }): Promise<Faculty & { temporaryPassword?: string }> =>
  authenticatedRequest('/faculty', { method: 'POST', body: JSON.stringify(input) });
export const createFacultyAccount = (id: string, email: string): Promise<Faculty & { temporaryPassword: string }> =>
  authenticatedRequest(`/faculty/${id}/account`, { method: 'POST', body: JSON.stringify({ email }) });
export const setFacultyAccountStatus = (id: string, status: 'ACTIVE' | 'INACTIVE'): Promise<Faculty> =>
  authenticatedRequest(`/faculty/${id}/account`, { method: 'PUT', body: JSON.stringify({ status }) });
export const listDepartments = (q = new URLSearchParams()): Promise<List<Department>> => authenticatedRequest(`/departments?${q}`);
export const createDepartment = (input: { code: string; name: string }): Promise<Department> => authenticatedRequest('/departments', { method: 'POST', body: JSON.stringify(input) });
export const updateDepartment = (id: string, input: { code?: string; name?: string }): Promise<Department> =>
  authenticatedRequest(`/departments/${id}`, { method: 'PUT', body: JSON.stringify(input) });

export type FacultyTaskCounts = { assigned: number; pending: number; inProgress: number; submitted: number; approved: number; rework: number; overdue: number };
export type FacultyPerformanceRow = {
  faculty: { id: string; employeeCode: string; firstName: string; lastName: string; department: { id: string; code: string; name: string } | null };
  classes: number;
  sessionsMarked: number;
  assignmentsCreated: number;
  pendingEvaluations: number;
  tasks: FacultyTaskCounts;
};
export const getFacultyPerformance = (departmentId?: string): Promise<{ windowDays: number; faculty: FacultyPerformanceRow[] }> =>
  authenticatedRequest(`/faculty/performance${departmentId ? `?departmentId=${encodeURIComponent(departmentId)}` : ''}`);
