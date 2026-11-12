import { authenticatedRequest } from './api-client';

export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'SUBMITTED' | 'APPROVED' | 'REWORK';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type Task = {
  id: string;
  collegeId: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  deadline: string;
  status: TaskStatus;
  createdByUserId: string;
  departmentId: string | null;
  createdAt: string;
  updatedAt: string;
  department: { id: string; name: string; code: string } | null;
  createdBy: { id: string; displayName: string; email: string };
  assignments: TaskAssignment[];
};

export type TaskAssignment = {
  id: string;
  taskId: string;
  assigneeUserId: string;
  status: TaskStatus;
  notes: string | null;
  submittedAt: string | null;
  submissionContent: string | null;
  reviewedAt: string | null;
  reviewedByUserId: string | null;
  task?: Pick<Task, 'id' | 'title' | 'priority' | 'deadline' | 'status'>;
  assignee: { id: string; displayName: string; email: string };
  reviewedBy?: { id: string; displayName: string } | null;
};

export type TaskStats = { pending: number; inProgress: number; submitted: number; approved: number; rework: number; total: number };

type TaskList = { items: Task[]; total: number; page: number; pageSize: number };
type AssignmentList = { items: TaskAssignment[]; total: number; page: number; pageSize: number };

export const listTasks = (params: URLSearchParams): Promise<TaskList> =>
  authenticatedRequest(`/tasks?${params}`);

export const getTask = (id: string): Promise<Task> =>
  authenticatedRequest(`/tasks/${id}`);

export const createTask = (input: {
  title: string;
  description?: string;
  priority: TaskPriority;
  deadline: string;
  departmentId?: string;
}): Promise<Task> =>
  authenticatedRequest('/tasks', { method: 'POST', body: JSON.stringify(input) });

export const updateTask = (id: string, input: Partial<{ title: string; description: string; priority: TaskPriority; deadline: string }>): Promise<Task> =>
  authenticatedRequest(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(input) });

export const deleteTask = (id: string): Promise<void> =>
  authenticatedRequest(`/tasks/${id}`, { method: 'DELETE' });

export const assignTask = (taskId: string, input: { assigneeUserId: string; notes?: string }): Promise<TaskAssignment> =>
  authenticatedRequest(`/tasks/${taskId}/assign`, { method: 'POST', body: JSON.stringify(input) });

export const listMyAssignments = (params?: URLSearchParams): Promise<AssignmentList> =>
  authenticatedRequest(`/tasks/my${params ? `?${params}` : ''}`);

export const getMyAssignmentStats = (): Promise<TaskStats> =>
  authenticatedRequest('/tasks/my/stats');

export const updateMyAssignmentStatus = (assignmentId: string, input: { status: TaskStatus; notes?: string }): Promise<TaskAssignment> =>
  authenticatedRequest(`/tasks/assignments/${assignmentId}/status`, { method: 'PUT', body: JSON.stringify(input) });

export const submitTask = (assignmentId: string, input: { content: string }): Promise<TaskAssignment> =>
  authenticatedRequest(`/tasks/assignments/${assignmentId}/submit`, { method: 'POST', body: JSON.stringify(input) });

export const reviewTask = (assignmentId: string, input: { decision: 'APPROVED' | 'REWORK'; notes?: string }): Promise<TaskAssignment> =>
  authenticatedRequest(`/tasks/assignments/${assignmentId}/review`, { method: 'PUT', body: JSON.stringify(input) });
