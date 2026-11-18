import { authenticatedRequest } from './api-client';

export type DepartmentHod = { facultyId: string; name: string; employeeCode: string; designation: string | null };
export type DepartmentCounts = { faculty: number; students: number; courses: number; subjects: number };
export type Department = {
  id: string;
  code: string;
  name: string;
  faculty?: { id: string; firstName: string; lastName: string; employeeCode: string }[];
  hod?: DepartmentHod | null;
  counts?: DepartmentCounts;
};
export type DepartmentDetail = Department & {
  hod: DepartmentHod | null;
  counts: DepartmentCounts;
  courses: { id: string; code: string; name: string; durationYears: number; semesters: number }[];
  subjects: { id: string; code: string; name: string; credits: number; course: { code: string }; semester: { name: string; number: number } }[];
};
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
export const getDepartment = (id: string): Promise<DepartmentDetail> => authenticatedRequest(`/departments/${id}`);
/** Admin assigns or changes the HOD; null removes them. */
export const setDepartmentHod = (id: string, facultyId: string | null): Promise<DepartmentDetail> =>
  authenticatedRequest(`/departments/${id}/hod`, { method: 'PUT', body: JSON.stringify({ facultyId }) });
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
