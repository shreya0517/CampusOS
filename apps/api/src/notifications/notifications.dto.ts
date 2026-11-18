import { BadRequestException } from '@nestjs/common';
import { NotificationCategory } from '@prisma/client';
import type { NotificationListQuery } from './notifications.service';

const invalid = (): never => {
  throw new BadRequestException({ code: 'INVALID_INPUT', message: 'Request input is invalid.' });
};

const category = (value: unknown): NotificationCategory | undefined => {
  if (value === undefined || value === '') return undefined;
  return typeof value === 'string' && (Object.values(NotificationCategory) as string[]).includes(value) ? (value as NotificationCategory) : invalid();
};

const integer = (value: unknown, fallback: number, max: number): number => {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= max ? parsed : invalid();
};

export const parseNotificationListQuery = (value: unknown): NotificationListQuery => {
  const query = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const unread = query.unread;
  if (unread !== undefined && unread !== 'true' && unread !== 'false') invalid();
  return { category: category(query.category), unreadOnly: unread === 'true', page: integer(query.page, 1, 10_000), pageSize: integer(query.pageSize, 20, 100) };
};

export const parseMarkAllQuery = (value: unknown): NotificationCategory | undefined => category(((value && typeof value === 'object' ? value : {}) as Record<string, unknown>).category);
