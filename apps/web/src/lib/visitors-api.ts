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

export const listMyVisitors = (params?: URLSearchParams): Promise<VisitorList> =>
  authenticatedRequest(`/visitors/my${params ? `?${params}` : ''}`);

export const getVisitor = (id: string): Promise<Visitor> =>
  authenticatedRequest(`/visitors/${id}`);

export const reviewVisitor = (id: string, input: { decision: 'APPROVED' | 'REJECTED'; notes?: string }): Promise<Visitor> =>
  authenticatedRequest(`/visitors/${id}/review`, { method: 'PUT', body: JSON.stringify(input) });
