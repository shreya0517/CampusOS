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
  author: { id: string; displayName: string };
};
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
