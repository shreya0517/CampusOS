import { authenticatedRequest } from './api-client';

export type NotificationCategory = 'TASK' | 'ATTENDANCE' | 'EXAM' | 'ASSIGNMENT' | 'FEE' | 'VISITOR' | 'ANNOUNCEMENT' | 'ACCOUNT' | 'SYSTEM';
export type AppNotification = { id: string; category: NotificationCategory; title: string; body: string; link: string | null; readAt: string | null; createdAt: string };
export type NotificationPage = { items: AppNotification[]; total: number; unread: number; page: number; pageSize: number };

/** Live event pushed when a new notification is stored for the signed-in user (mirrors the API). */
export const NOTIFICATION_EVENT = 'notification:new';

export const CATEGORY_LABEL: Record<NotificationCategory, string> = {
  TASK: 'Tasks',
  ATTENDANCE: 'Attendance',
  EXAM: 'Exams',
  ASSIGNMENT: 'Assignments',
  FEE: 'Fees',
  VISITOR: 'Visitors',
  ANNOUNCEMENT: 'Announcements',
  ACCOUNT: 'Account',
  SYSTEM: 'System',
};

/** Sidebar icon name for each category. */
export const CATEGORY_ICON: Record<NotificationCategory, string> = {
  TASK: 'tasks',
  ATTENDANCE: 'attendance',
  EXAM: 'exams',
  ASSIGNMENT: 'assignments',
  FEE: 'fees',
  VISITOR: 'visitors',
  ANNOUNCEMENT: 'announcements',
  ACCOUNT: 'profile',
  SYSTEM: 'settings',
};

export const listNotifications = (params: URLSearchParams): Promise<NotificationPage> => authenticatedRequest(`/notifications?${params}`);
export const getUnreadCount = (): Promise<{ unread: number }> => authenticatedRequest('/notifications/unread-count');
export const markNotificationRead = (id: string): Promise<{ unread: number }> => authenticatedRequest(`/notifications/${id}/read`, { method: 'PUT' });
export const markAllNotificationsRead = (category?: NotificationCategory): Promise<{ marked: number; unread: number }> =>
  authenticatedRequest(`/notifications/read-all${category ? `?category=${category}` : ''}`, { method: 'PUT' });

export function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 0) return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
