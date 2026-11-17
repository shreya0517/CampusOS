import { Inject, Injectable } from '@nestjs/common';
import { AnnouncementAudience } from '@prisma/client';
import { DatabaseService } from '../database.service';
import type { AuthorizationContext } from '../authorization/authorization.types';
import type { AnnouncementListQuery, CreateAnnouncementDto } from './announcements.dto';

const authorSelect = { author: { select: { id: true, displayName: true } } };

/** Audiences a signed-in user may read. Admins see every audience; students see college-wide and student notices only. */
export const audiencesFor = (context: AuthorizationContext): AnnouncementAudience[] => {
  if (context.roles.includes('SUPER_ADMIN') || context.roles.includes('ADMIN')) return Object.values(AnnouncementAudience);
  const audiences = new Set<AnnouncementAudience>([AnnouncementAudience.ALL]);
  if (context.roles.includes('STUDENT')) audiences.add(AnnouncementAudience.STUDENTS);
  if (context.roles.includes('HOD') || context.roles.includes('FACULTY')) {
    audiences.add(AnnouncementAudience.FACULTY);
    audiences.add(AnnouncementAudience.STAFF);
  }
  return [...audiences];
};

@Injectable()
export class AnnouncementsService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  /** Published, unexpired announcements in the caller's college and audience, newest first. */
  async list(query: AnnouncementListQuery, context: AuthorizationContext) {
    const now = new Date();
    const where = {
      collegeId: context.collegeId,
      audience: { in: audiencesFor(context) },
      publishedAt: { lte: now },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      ...(query.search
        ? { AND: [{ OR: [{ title: { contains: query.search, mode: 'insensitive' as const } }, { body: { contains: query.search, mode: 'insensitive' as const } }] }] }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.database.announcement.findMany({ where, include: authorSelect, orderBy: { publishedAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.database.announcement.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  /** Admins publish into their own college, always as themselves. */
  async create(input: CreateAnnouncementDto, context: AuthorizationContext) {
    return this.database.announcement.create({
      data: {
        collegeId: context.collegeId,
        authorId: context.userId,
        title: input.title,
        body: input.body,
        audience: input.audience,
        publishedAt: input.publishedAt ?? new Date(),
        expiresAt: input.expiresAt,
      },
      include: authorSelect,
    });
  }
}
