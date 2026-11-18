import { authenticatedRequest } from './api-client';

export type VisitorStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CHECKED_IN' | 'CHECKED_OUT';

export type Visitor = {
  id: string;
  collegeId: string;
  name: string;
  phone: string;
  email: string | null;
  purpose: string;
  visitDate: string;
  status: VisitorStatus;
  hostUserId: string | null;
  registeredByUserId: string;
  approvedByUserId: string | null;
  approvedAt: string | null;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  createdAt: string;
  updatedAt: string;
  registeredBy: { id: string; displayName: string };
  host: { id: string; displayName: string } | null;
  approvedBy: { id: string; displayName: string } | null;
};

type VisitorList = { items: Visitor[]; total: number; page: number; pageSize: number };

export const registerVisitor = (input: {
  name: string;
  phone: string;
  email?: string;
  purpose: string;
  hostUserId?: string;
  visitDate: string;
}): Promise<Visitor> =>
  authenticatedRequest('/visitors', { method: 'POST', body: JSON.stringify(input) });

export const listVisitors = (params: URLSearchParams): Promise<VisitorList> =>
  authenticatedRequest(`/visitors?${params}`);

/** The caller's own registrations. The API returns a plain list (not a page), newest visit first. */
export const listMyVisitors = (): Promise<Visitor[]> => authenticatedRequest('/visitors/my');

export const getVisitor = (id: string): Promise<Visitor> =>
  authenticatedRequest(`/visitors/${id}`);

export const reviewVisitor = (id: string, input: { decision: 'APPROVED' | 'REJECTED'; notes?: string }): Promise<Visitor> =>
  authenticatedRequest(`/visitors/${id}/review`, { method: 'PUT', body: JSON.stringify(input) });

/** Front desk: an approved visitor arrives (check in) and leaves (check out). Admin and HOD only. */
export const checkInVisitor = (id: string): Promise<Visitor> => authenticatedRequest(`/visitors/${id}/check-in`, { method: 'PUT' });
export const checkOutVisitor = (id: string): Promise<Visitor> => authenticatedRequest(`/visitors/${id}/check-out`, { method: 'PUT' });
