import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AnnouncementAudience } from '@prisma/client';
import type { Announcement, Prisma } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { DatabaseService } from '../database.service';
import type { AuthorizationContext } from '../authorization/authorization.types';
import type { AnnouncementListQuery, AnnouncementState, AnnouncementTarget, CreateAnnouncementDto, ManageAnnouncementQuery, UpdateAnnouncementDto } from './announcements.dto';

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

/** Where an announcement stands: archived, waiting for its publish time, past its expiry, or live. */
export const stateOf = (announcement: Pick<Announcement, 'archivedAt' | 'publishedAt' | 'expiresAt'>, now = new Date()): AnnouncementState => {
  if (announcement.archivedAt) return 'ARCHIVED';
  if (!announcement.publishedAt || announcement.publishedAt > now) return 'SCHEDULED';
  if (announcement.expiresAt && announcement.expiresAt <= now) return 'EXPIRED';
  return 'PUBLISHED';
};

/** The same states as filters. */
const stateWhere = (state: AnnouncementState, now: Date): Prisma.AnnouncementWhereInput =>
  ({
    ARCHIVED: { archivedAt: { not: null } },
    SCHEDULED: { archivedAt: null, OR: [{ publishedAt: null }, { publishedAt: { gt: now } }] },
    EXPIRED: { archivedAt: null, publishedAt: { lte: now }, expiresAt: { lte: now } },
    PUBLISHED: { archivedAt: null, publishedAt: { lte: now }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
  })[state];

const denied = (): never => {
  throw new ForbiddenException({ code: 'FORBIDDEN', message: 'You are not authorized to access this resource.' });
};
const missing = (): never => {
  throw new NotFoundException({ code: 'ANNOUNCEMENT_NOT_FOUND', message: 'Announcement not found.' });
};
const searchWhere = (search: string): Prisma.AnnouncementWhereInput => ({
  OR: [{ title: { contains: search, mode: 'insensitive' } }, { body: { contains: search, mode: 'insensitive' } }],
});

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
      archivedAt: null,
      ...(query.category ? { category: query.category } : {}),
      AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, ...(visible ? [visible] : []), ...(query.search ? [searchWhere(query.search)] : [])],
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
      },
      include,
    });
    // Due now: delivered straight away. A scheduled one is left for the delivery check.
    const delivered = dueNow && (await this.deliverSafely(announcement, now));
    return delivered ? { ...announcement, notifiedAt: now } : announcement;
  }

  /** Delivers scheduled announcements whose time has come, oldest first. Returns how many were announced. */
  async deliverDue(now = new Date()): Promise<number> {
    if (this.delivering) return 0;
    this.delivering = true;
    let delivered = 0;
    try {
      const due = await this.database.announcement.findMany({ where: { notifiedAt: null, archivedAt: null, publishedAt: { lte: now } }, orderBy: { publishedAt: 'asc' }, take: DELIVERY_BATCH });
      for (const announcement of due) if (await this.deliverSafely(announcement, now)) delivered += 1;
    } catch (error) {
      this.logger.error(`Scheduled announcements could not be delivered: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.delivering = false;
    }
    return delivered;
  }

  /**
   * Delivers one announcement, exactly once. The claim (a conditional update of notifiedAt) and the notifications are
   * written in one transaction, and the claim holds the row lock until they are stored: an archive either commits first,
   * and the claim finds nothing to deliver, or waits until delivery has finished. So an archived announcement is never
   * delivered, and two checks (or API instances) never both deliver it. Recipients are read from the claimed row, so a
   * target edited just before delivery is the one used. One that expired before its turn is marked done without
   * notifying anyone. Returns whether this call announced it.
   */
  private async deliver(announcement: Pick<Announcement, 'id'>, now: Date): Promise<boolean> {
    const notifications = this.notifications;
    const pending: { push?: () => void } = {};
    const announced = await this.database.$transaction(
      async (tx) => {
        const claim = await tx.announcement.updateMany({ where: { id: announcement.id, notifiedAt: null, archivedAt: null }, data: { notifiedAt: now } });
        if (claim.count !== 1) return false;
        const row = await tx.announcement.findUniqueOrThrow({ where: { id: announcement.id } });
        if (row.expiresAt && row.expiresAt <= now) return false;
        if (notifications) {
          const users = (await this.recipients(row, notifications)).filter((id) => id !== row.authorId);
          pending.push = await notifications.store(tx, row.collegeId, users, {
            category: 'ANNOUNCEMENT',
            title: `Announcement: ${row.title}`,
            body: row.body.length > 160 ? `${row.body.slice(0, 157)}...` : row.body,
            link: '/dashboard/announcements',
          });
        }
        return true;
      },
      { timeout: 30_000 },
    );
    // Pushed live only once the notifications are committed.
    pending.push?.();
    return announced;
  }

  /**
   * Delivery never fails the request that triggered it: an error is logged and the announcement stays unclaimed, so the
   * next check delivers it.
   */
  private async deliverSafely(announcement: Pick<Announcement, 'id'>, now: Date): Promise<boolean> {
    try {
      return await this.deliver(announcement, now);
    } catch (error) {
      this.logger.error(`Announcement ${announcement.id} could not be delivered yet: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Admin's announcement history: every announcement in the college, whatever its state, newest first, with its state
   * and how many are in each.
   */
  async manage(query: ManageAnnouncementQuery, context: AuthorizationContext) {
    if (!context.roles.includes('ADMIN')) denied();
    const now = new Date();
    const base: Prisma.AnnouncementWhereInput = {
      collegeId: context.collegeId,
      ...(query.category ? { category: query.category } : {}),
      ...(query.search ? { AND: [searchWhere(query.search)] } : {}),
    };
    const where: Prisma.AnnouncementWhereInput = query.state ? { AND: [base, stateWhere(query.state, now)] } : base;
    const states: AnnouncementState[] = ['PUBLISHED', 'SCHEDULED', 'EXPIRED', 'ARCHIVED'];
    const [items, total, ...counts] = await Promise.all([
      this.database.announcement.findMany({ where, include, orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.database.announcement.count({ where }),
      ...states.map((state) => this.database.announcement.count({ where: { AND: [base, stateWhere(state, now)] } })),
    ]);
    return {
      items: items.map((item) => ({ ...item, state: stateOf(item, now) })),
      total,
      page: query.page,
      pageSize: query.pageSize,
      counts: Object.fromEntries(states.map((state, index) => [state, counts[index] ?? 0])) as Record<AnnouncementState, number>,
    };
  }

  /**
   * Admin edits an announcement. A published one keeps its publish time and is not announced again; a scheduled one
   * can be moved, and if it is moved to now (or earlier) it goes out at once. The write only applies if the announcement
   * hasn't been delivered since it was read, so an edit can't race the scheduled delivery.
   */
  async update(id: string, input: UpdateAnnouncementDto, context: AuthorizationContext) {
    if (!context.roles.includes('ADMIN')) denied();
    const existing = await this.database.announcement.findFirst({ where: { id, collegeId: context.collegeId } });
    if (!existing) return missing();
    const now = new Date();
    const delivered = existing.notifiedAt !== null;
    if (delivered && input.publishedAt && input.publishedAt.getTime() !== existing.publishedAt?.getTime()) {
      throw new ConflictException({ code: 'ALREADY_PUBLISHED', message: 'This announcement has already been published, so its publish time can no longer change.' });
    }
    const publishedAt = input.publishedAt ?? existing.publishedAt ?? now;
    if (input.expiresAt && input.expiresAt <= publishedAt) throw new BadRequestException({ code: 'INVALID_INPUT', message: 'The expiry must be after the publish time.' });
    const target = await this.resolveTarget(input.target, context.collegeId);
    const dueNow = !delivered && !existing.archivedAt && publishedAt <= now;

    await this.database.$transaction(async (tx) => {
      const written = await tx.announcement.updateMany({
        where: { id, collegeId: context.collegeId, notifiedAt: existing.notifiedAt },
        data: {
          title: input.title,
          body: input.body,
          audience: input.audience,
          category: input.category,
          ...target,
          publishedAt,
          expiresAt: input.expiresAt,
        },
      });
      if (written.count !== 1) throw new ConflictException({ code: 'ANNOUNCEMENT_CHANGED', message: 'This announcement was just published. Reload it and try again.' });
      await tx.auditLog.create({ data: { collegeId: context.collegeId, actorId: context.userId, action: 'ANNOUNCEMENT_UPDATED', entityType: 'Announcement', entityId: id } });
    });
    // Moved to now: delivered straight away, with the edited target.
    if (dueNow) await this.deliverSafely({ id }, now);
    const updated = await this.database.announcement.findFirstOrThrow({ where: { id, collegeId: context.collegeId }, include });
    return { ...updated, state: stateOf(updated, now) };
  }

  /** Archives an announcement: hidden from every list and, if not yet delivered, never delivered while archived. */
  async archive(id: string, context: AuthorizationContext) {
    return this.setArchived(id, true, context);
  }

  /** Restores an archived announcement. One whose publish time passed while archived goes out at the next check. */
  async restore(id: string, context: AuthorizationContext) {
    return this.setArchived(id, false, context);
  }

  private async setArchived(id: string, archive: boolean, context: AuthorizationContext) {
    if (!context.roles.includes('ADMIN')) denied();
    const now = new Date();
    await this.database.$transaction(async (tx) => {
      const written = await tx.announcement.updateMany({
        where: { id, collegeId: context.collegeId, archivedAt: archive ? null : { not: null } },
        data: { archivedAt: archive ? now : null },
      });
      if (written.count !== 1) {
        const exists = await tx.announcement.count({ where: { id, collegeId: context.collegeId } });
        if (!exists) missing();
        throw new ConflictException(archive ? { code: 'ALREADY_ARCHIVED', message: 'This announcement is already archived.' } : { code: 'NOT_ARCHIVED', message: 'This announcement is not archived.' });
      }
      await tx.auditLog.create({
        data: { collegeId: context.collegeId, actorId: context.userId, action: archive ? 'ANNOUNCEMENT_ARCHIVED' : 'ANNOUNCEMENT_RESTORED', entityType: 'Announcement', entityId: id },
      });
    });
    const announcement = await this.database.announcement.findFirstOrThrow({ where: { id, collegeId: context.collegeId }, include });
    return { ...announcement, state: stateOf(announcement, now) };
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
}
