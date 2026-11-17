import { authenticatedRequest } from './api-client';
export type Enrollment = { id: string; status: 'ACTIVE' | 'COMPLETED' | 'WITHDRAWN'; section: { id: string; code: string; semester: { id: string; name: string; number: number; course: { id: string; code: string; name: string; department: { id: string; code: string; name: string } } } } };
export type Student = { id: string; studentCode: string; firstName: string; lastName: string; dateOfBirth: string | null; enrollments: Enrollment[] };
type StudentList = { items: Student[]; page: number; pageSize: number; total: number };
export const listStudents = (params: URLSearchParams): Promise<StudentList> => authenticatedRequest(`/students?${params.toString()}`);
export const getStudent = (id: string): Promise<Student> => authenticatedRequest(`/students/${id}`);
export const updateStudent = (id: string, input: { firstName: string; lastName: string; dateOfBirth?: string }): Promise<Student> => authenticatedRequest(`/students/${id}`, { method: 'PUT', body: JSON.stringify(input) });
export const updateEnrollment = (id: string, input: { sectionId: string; status: Enrollment['status'] }): Promise<Enrollment> => authenticatedRequest(`/students/${id}/enrollments`, { method: 'POST', body: JSON.stringify(input) });
export const getMyStudent = (): Promise<Student> => authenticatedRequest('/students/me');
