import { BadRequestException, Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AnnouncementAudience } from '@prisma/client';
import type { Announcement, Prisma } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { DatabaseService } from '../database.service';
import type { AuthorizationContext } from '../authorization/authorization.types';
import type { AnnouncementListQuery, AnnouncementTarget, CreateAnnouncementDto } from './announcements.dto';

/** How often scheduled announcements are checked for delivery. */
export const DELIVERY_INTERVAL_MS = 60_000;
/** At most this many due announcements are delivered per check; the rest go out on the next one. */
const DELIVERY_BATCH = 50;

const include = {
  author: { select: { id: true, displayName: true } },
  department: { select: { id: true, code: true, name: true } },
  section: { select: { id: true, code: true } },
} satisfies Prisma.AnnouncementInclude;

/** The roles each audience reaches. */
const AUDIENCE_ROLES: Record<AnnouncementAudience, string[]> = {
  ALL: ['ADMIN', 'HOD', 'FACULTY', 'STUDENT'],
  STUDENTS: ['STUDENT'],
  FACULTY: ['HOD', 'FACULTY'],
  STAFF: ['ADMIN', 'HOD', 'FACULTY'],
};

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

type Placement = { sectionId: string; semesterNumber: number; departmentId: string };
type SectionWithPlace = { sectionId: string; section: { semester: { number: number; course: { departmentId: string } } } };
const placeOf = (row: SectionWithPlace): Placement => ({ sectionId: row.sectionId, semesterNumber: row.section.semester.number, departmentId: row.section.semester.course.departmentId });
const sectionPlace = { section: { select: { semester: { select: { number: true, course: { select: { departmentId: true } } } } } } } as const;

/** No target: everyone in the audience. */
const UNTARGETED = { departmentId: null, semesterNumber: null, sectionId: null } satisfies Prisma.AnnouncementWhereInput;

/** Announcements whose target covers a section: each part of the target is either unset or matches it. */
const coveringSection = (place: Placement): Prisma.AnnouncementWhereInput => ({
  AND: [
    { OR: [{ departmentId: null }, { departmentId: place.departmentId }] },
    { OR: [{ semesterNumber: null }, { semesterNumber: place.semesterNumber }] },
    { OR: [{ sectionId: null }, { sectionId: place.sectionId }] },
  ],
});

/** Sections an announcement's target covers. */
const sectionsCoveredBy = (target: Pick<Announcement, 'departmentId' | 'semesterNumber' | 'sectionId'>): Prisma.SectionWhereInput => ({
  ...(target.sectionId ? { id: target.sectionId } : {}),
  semester: { ...(target.semesterNumber ? { number: target.semesterNumber } : {}), ...(target.departmentId ? { course: { departmentId: target.departmentId } } : {}) },
});
const isTargeted = (target: Pick<Announcement, 'departmentId' | 'semesterNumber' | 'sectionId'>): boolean => Boolean(target.departmentId || target.semesterNumber || target.sectionId);

/**
 * Announcements, published by Admin to the whole college or to a department, semester or section.
 *
 * Who sees a targeted announcement (within its audience): students actively enrolled in a section it covers; faculty
 * who teach a class in such a section, and for a department-wide one every faculty member of the department; the HOD of
 * its department (and every HOD for a semester-wide one with no department); Admins see every announcement.
 *
 * An announcement is announced (a notification to everyone who can see it) once: when it is published, or, if it was
 * scheduled for later, by a check that runs every minute.
 */
@Injectable()
export class AnnouncementsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AnnouncementsService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private delivering = false;

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Optional() @Inject(NotificationsService) private readonly notifications?: NotificationsService,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.deliverDue(), DELIVERY_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Published, unexpired announcements in the caller's college that are meant for them, newest first. */
  async list(query: AnnouncementListQuery, context: AuthorizationContext) {
    const now = new Date();
    const visible = await this.visibleTo(context);
    const where: Prisma.AnnouncementWhereInput = {
      collegeId: context.collegeId,
      audience: { in: audiencesFor(context) },
      publishedAt: { lte: now },
      ...(query.category ? { category: query.category } : {}),
      AND: [
        { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        ...(visible ? [visible] : []),
        ...(query.search ? [{ OR: [{ title: { contains: query.search, mode: 'insensitive' as const } }, { body: { contains: query.search, mode: 'insensitive' as const } }] }] : []),
      ],
    };
    const [items, total] = await Promise.all([
      this.database.announcement.findMany({ where, include, orderBy: { publishedAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.database.announcement.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  /** Admins publish into their own college, always as themselves. */
  async create(input: CreateAnnouncementDto, context: AuthorizationContext) {
    const target = await this.resolveTarget(input.target, context.collegeId);
    const now = new Date();
    const publishedAt = input.publishedAt ?? now;
    const dueNow = publishedAt <= now;
    const announcement = await this.database.announcement.create({
      data: {
        collegeId: context.collegeId,
        authorId: context.userId,
        title: input.title,
        body: input.body,
        audience: input.audience,
        category: input.category,
        ...target,
        publishedAt,
        expiresAt: input.expiresAt,
        // A scheduled announcement is left for the delivery check to announce when its time comes.
        notifiedAt: dueNow ? now : null,
      },
      include,
    });
    if (dueNow) await this.announce(announcement);
    return announcement;
  }

  /**
   * Announces scheduled announcements whose time has come, oldest first. Each one is claimed with a conditional update
   * before anyone is notified, so it goes out once even if checks overlap or several API instances run. One that expired
   * before its turn is marked done without notifying anyone.
   */
  async deliverDue(now = new Date()): Promise<number> {
    if (this.delivering) return 0;
    this.delivering = true;
    let delivered = 0;
    try {
      const due = await this.database.announcement.findMany({ where: { notifiedAt: null, publishedAt: { lte: now } }, orderBy: { publishedAt: 'asc' }, take: DELIVERY_BATCH });
      for (const announcement of due) {
        const claimed = await this.database.announcement.updateMany({ where: { id: announcement.id, notifiedAt: null }, data: { notifiedAt: now } });
        if (claimed.count !== 1 || (announcement.expiresAt && announcement.expiresAt <= now)) continue;
        await this.announce(announcement);
        delivered += 1;
      }
    } catch (error) {
      this.logger.error(`Scheduled announcements could not be delivered: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.delivering = false;
    }
    return delivered;
  }

  /** Checks a target belongs to the college. A section fixes the department and semester, and must agree with any given. */
  private async resolveTarget(target: AnnouncementTarget, collegeId: string): Promise<{ departmentId: string | null; semesterNumber: number | null; sectionId: string | null }> {
    if (target.sectionId) {
      const section = await this.database.section.findFirst({
        where: { id: target.sectionId, collegeId },
        select: { id: true, semester: { select: { number: true, course: { select: { departmentId: true } } } } },
      });
      if (!section) throw new NotFoundException({ code: 'SECTION_NOT_FOUND', message: 'Section not found.' });
      const departmentId = section.semester.course.departmentId;
      const semesterNumber = section.semester.number;
      if ((target.departmentId && target.departmentId !== departmentId) || (target.semesterNumber && target.semesterNumber !== semesterNumber)) {
        throw new BadRequestException({ code: 'TARGET_MISMATCH', message: 'The section is not in the chosen department or semester.' });
      }
      return { departmentId, semesterNumber, sectionId: section.id };
    }
    if (target.departmentId) {
      const department = await this.database.department.findFirst({ where: { id: target.departmentId, collegeId }, select: { id: true } });
      if (!department) throw new NotFoundException({ code: 'DEPARTMENT_NOT_FOUND', message: 'Department not found.' });
    }
    return { departmentId: target.departmentId ?? null, semesterNumber: target.semesterNumber ?? null, sectionId: null };
  }

  /** The targets a user can see, as a filter; null for Admins, who see every announcement. */
  private async visibleTo(context: AuthorizationContext): Promise<Prisma.AnnouncementWhereInput | null> {
    if (context.roles.includes('SUPER_ADMIN') || context.roles.includes('ADMIN')) return null;
    const isStaff = context.roles.includes('FACULTY') || context.roles.includes('HOD');
    const [enrollments, classes] = await Promise.all([
      context.roles.includes('STUDENT')
        ? this.database.enrollment.findMany({ where: { collegeId: context.collegeId, status: 'ACTIVE', student: { userId: context.userId } }, select: { sectionId: true, ...sectionPlace } })
        : Promise.resolve([]),
      isStaff ? this.database.class.findMany({ where: { collegeId: context.collegeId, faculty: { userId: context.userId } }, select: { sectionId: true, ...sectionPlace } }) : Promise.resolve([]),
    ]);
    const places = new Map<string, Placement>();
    for (const row of [...enrollments, ...classes]) places.set(row.sectionId, placeOf(row));

    const options: Prisma.AnnouncementWhereInput[] = [UNTARGETED, ...[...places.values()].map(coveringSection)];
    if (isStaff && context.departmentId) options.push({ departmentId: context.departmentId, semesterNumber: null, sectionId: null });
    if (context.roles.includes('HOD') && context.departmentId) {
      options.push({ departmentId: context.departmentId }, { departmentId: null, sectionId: null, semesterNumber: { not: null } });
    }
    return { OR: options };
  }

  /** Everyone the announcement is for, as in the class comment; the author is left out. */
  private async recipients(announcement: Announcement, notifications: NotificationsService): Promise<string[]> {
    const { collegeId } = announcement;
    const roles = AUDIENCE_ROLES[announcement.audience];
    if (!isTargeted(announcement)) return notifications.usersWithRoles(collegeId, roles);

    const covered = sectionsCoveredBy(announcement);
    const departmentWide = Boolean(announcement.departmentId && !announcement.semesterNumber && !announcement.sectionId);
    const active = { is: { status: 'ACTIVE' as const } };
    const [admins, students, faculty, hods] = await Promise.all([
      roles.includes('ADMIN') ? notifications.usersWithRoles(collegeId, ['ADMIN']) : Promise.resolve([]),
      roles.includes('STUDENT')
        ? this.database.student.findMany({ where: { collegeId, userId: { not: null }, user: active, enrollments: { some: { status: 'ACTIVE', section: covered } } }, select: { userId: true } })
        : Promise.resolve([]),
      roles.includes('FACULTY')
        ? this.database.faculty.findMany({
            where: { collegeId, userId: { not: null }, user: active, OR: [{ classes: { some: { section: covered } } }, ...(departmentWide ? [{ departmentId: announcement.departmentId }] : [])] },
            select: { userId: true },
          })
        : Promise.resolve([]),
      roles.includes('HOD')
        ? announcement.departmentId
          ? notifications.hodsOf(collegeId, announcement.departmentId)
          : notifications.usersWithRoles(collegeId, ['HOD'])
        : Promise.resolve([]),
    ]);
    return [...new Set([...admins, ...students.map((row) => row.userId as string), ...faculty.map((row) => row.userId as string), ...hods])];
  }

  /** Notifies everyone the announcement is for. Best effort: a failure is logged and never undoes the announcement. */
  private async announce(announcement: Announcement): Promise<void> {
    await this.notifications?.safely(async (notifications) => {
      const users = await this.recipients(announcement, notifications);
      await notifications.notify(announcement.collegeId, users.filter((id) => id !== announcement.authorId), {
        category: 'ANNOUNCEMENT',
        title: `Announcement: ${announcement.title}`,
        body: announcement.body.length > 160 ? `${announcement.body.slice(0, 157)}...` : announcement.body,
        link: '/dashboard/announcements',
      });
    });
  }
}
