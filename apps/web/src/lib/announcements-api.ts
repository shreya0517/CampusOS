import { authenticatedRequest } from './api-client';

export type AnnouncementAudience = 'ALL' | 'STUDENTS' | 'FACULTY' | 'STAFF';
export type AnnouncementCategory = 'GENERAL' | 'ACADEMIC' | 'EXAMINATION' | 'HOLIDAY' | 'EVENT' | 'DEADLINE';
export type Announcement = {
  id: string;
  title: string;
  body: string;
  audience: AnnouncementAudience;
  category: AnnouncementCategory;
  departmentId: string | null;
  semesterNumber: number | null;
  sectionId: string | null;
  department: { id: string; code: string; name: string } | null;
  section: { id: string; code: string } | null;
  publishedAt: string;
  expiresAt: string | null;
  notifiedAt: string | null;
  archivedAt: string | null;
  author: { id: string; displayName: string };
};
export type AnnouncementState = 'PUBLISHED' | 'SCHEDULED' | 'EXPIRED' | 'ARCHIVED';
export type ManagedAnnouncement = Announcement & { state: AnnouncementState };
export type AnnouncementHistory = List<ManagedAnnouncement> & { counts: Record<AnnouncementState, number> };

export const STATE_LABEL: Record<AnnouncementState, string> = { PUBLISHED: 'Published', SCHEDULED: 'Scheduled', EXPIRED: 'Expired', ARCHIVED: 'Archived' };
type List<T> = { items: T[]; total: number; page: number; pageSize: number };

export const AUDIENCE_LABEL: Record<AnnouncementAudience, string> = {
  ALL: 'Everyone',
  STUDENTS: 'Students',
  FACULTY: 'Faculty',
  STAFF: 'Staff',
};

export const CATEGORY_LABEL: Record<AnnouncementCategory, string> = {
  GENERAL: 'General',
  ACADEMIC: 'Academic',
  EXAMINATION: 'Examination',
  HOLIDAY: 'Holiday',
  EVENT: 'Event',
  DEADLINE: 'Deadline',
};

/** "CSE · Semester 3 · Section A", or null for an announcement to the whole college. */
export function describeTarget(item: Pick<Announcement, 'department' | 'semesterNumber' | 'section'>): string | null {
  const parts = [item.department?.code, item.semesterNumber ? `Semester ${item.semesterNumber}` : null, item.section ? `Section ${item.section.code}` : null].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

export type NewAnnouncement = {
  title: string;
  body: string;
  audience: AnnouncementAudience;
  category: AnnouncementCategory;
  departmentId?: string;
  semesterNumber?: number;
  sectionId?: string;
  publishedAt?: string;
  expiresAt?: string;
};

export const listAnnouncements = (q: URLSearchParams = new URLSearchParams()): Promise<List<Announcement>> => authenticatedRequest(`/announcements?${q}`);
export const createAnnouncement = (input: NewAnnouncement): Promise<Announcement> => authenticatedRequest('/announcements', { method: 'POST', body: JSON.stringify(input) });

/** Admin only: every announcement in the college, filtered by `state`, `category` and `search`. */
export const listAnnouncementHistory = (q: URLSearchParams): Promise<AnnouncementHistory> => authenticatedRequest(`/announcements/manage?${q}`);
/** Admin only. The whole announcement as on the form; `publishedAt` only moves a scheduled one, `expiresAt: null` clears it. */
export const updateAnnouncement = (id: string, input: Omit<NewAnnouncement, 'expiresAt'> & { expiresAt: string | null }): Promise<ManagedAnnouncement> =>
  authenticatedRequest(`/announcements/${id}`, { method: 'PUT', body: JSON.stringify(input) });
export const archiveAnnouncement = (id: string): Promise<ManagedAnnouncement> => authenticatedRequest(`/announcements/${id}/archive`, { method: 'POST' });
export const restoreAnnouncement = (id: string): Promise<ManagedAnnouncement> => authenticatedRequest(`/announcements/${id}/restore`, { method: 'POST' });
