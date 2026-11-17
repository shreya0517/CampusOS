import { authenticatedRequest } from './api-client';

export type AnnouncementAudience = 'ALL' | 'STUDENTS' | 'FACULTY' | 'STAFF';
export type Announcement = {
  id: string;
  title: string;
  body: string;
  audience: AnnouncementAudience;
  publishedAt: string;
  expiresAt: string | null;
  author: { id: string; displayName: string };
};
type List<T> = { items: T[]; total: number; page: number; pageSize: number };

export const AUDIENCE_LABEL: Record<AnnouncementAudience, string> = {
  ALL: 'Everyone',
  STUDENTS: 'Students',
  FACULTY: 'Faculty',
  STAFF: 'Staff',
};

export const listAnnouncements = (q: URLSearchParams = new URLSearchParams()): Promise<List<Announcement>> => authenticatedRequest(`/announcements?${q}`);
export const createAnnouncement = (input: { title: string; body: string; audience: AnnouncementAudience; expiresAt?: string }): Promise<Announcement> =>
  authenticatedRequest('/announcements', { method: 'POST', body: JSON.stringify(input) });
