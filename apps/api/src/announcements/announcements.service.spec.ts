import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AnnouncementAudience } from '@prisma/client';
import { AnnouncementsService, audiencesFor, stateOf } from './announcements.service';
import { parseAnnouncementListQuery, parseCreateAnnouncementDto, parseManageAnnouncementQuery, parseUpdateAnnouncementDto } from './announcements.dto';
import type { CreateAnnouncementDto, UpdateAnnouncementDto } from './announcements.dto';
import type { AuthorizationContext } from '../authorization/authorization.types';

const context = (roles: AuthorizationContext['roles'], departmentId: string | null = null): AuthorizationContext => ({ userId: 'user-1', collegeId: 'col-a', roles, permissions: [], departmentId });
const place = (sectionId: string, semesterNumber: number, departmentId: string) => ({ sectionId, section: { semester: { number: semesterNumber, course: { departmentId } } } });
const covering = (sectionId: string, semesterNumber: number, departmentId: string) => ({
  AND: [
    { OR: [{ departmentId: null }, { departmentId }] },
    { OR: [{ semesterNumber: null }, { semesterNumber }] },
    { OR: [{ sectionId: null }, { sectionId }] },
  ],
});
const UNTARGETED = { departmentId: null, semesterNumber: null, sectionId: null };
const input = (overrides: Partial<CreateAnnouncementDto> = {}): CreateAnnouncementDto => ({ title: 'Holiday', body: 'Campus closed on Friday.', audience: AnnouncementAudience.ALL, category: 'HOLIDAY', target: {}, ...overrides });
const stored = (overrides: Record<string, unknown> = {}) => ({
  id: 'ann-1',
  collegeId: 'col-a',
  authorId: 'user-1',
  title: 'Holiday',
  body: 'Campus closed on Friday.',
  audience: 'ALL',
  category: 'HOLIDAY',
  departmentId: null,
  semesterNumber: null,
  sectionId: null,
  publishedAt: new Date(),
  expiresAt: null,
  notifiedAt: null,
  ...overrides,
});

function setup() {
  // Rows by id, as the delivery reads the claimed row back.
  const rows = new Map<string, ReturnType<typeof stored>>();
  const database = {
    announcement: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        const row = stored({ ...data, id: 'ann-1' });
        rows.set(row.id, row);
        return Promise.resolve(row);
      }),
      findUniqueOrThrow: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => Promise.resolve(rows.get(where.id) ?? stored({ id: where.id }))),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn().mockResolvedValue(stored({ notifiedAt: new Date('2026-11-18T09:00:00Z'), publishedAt: new Date('2026-11-18T09:00:00Z') })),
      // A fixed past time: a fresh new Date() here could land a millisecond after the service's own clock and read as scheduled.
      findFirstOrThrow: jest.fn().mockImplementation(() => Promise.resolve(stored({ notifiedAt: new Date('2026-11-18T09:00:00Z'), publishedAt: new Date('2026-11-18T09:00:00Z') }))),
    },
    enrollment: { findMany: jest.fn().mockResolvedValue([place('sec-a', 3, 'dept-cse')]) },
    class: { findMany: jest.fn().mockResolvedValue([place('sec-b', 5, 'dept-cse')]) },
    section: { findFirst: jest.fn().mockResolvedValue({ id: 'sec-a', semester: { number: 3, course: { departmentId: 'dept-cse' } } }) },
    department: { findFirst: jest.fn().mockResolvedValue({ id: 'dept-cse' }) },
    student: { findMany: jest.fn().mockResolvedValue([{ userId: 'student-1' }, { userId: 'student-2' }]) },
    faculty: { findMany: jest.fn().mockResolvedValue([{ userId: 'faculty-1' }]) },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  database.$transaction.mockImplementation((work: (tx: typeof database) => Promise<unknown>) => work(database));
  const push = jest.fn();
  const notifications = {
    usersWithRoles: jest.fn().mockImplementation((_college: string, roles: string[]) => Promise.resolve(roles.includes('STUDENT') ? ['user-1', 'admin-2', 'student-1'] : roles.includes('HOD') && roles.length === 1 ? ['hod-1', 'hod-2'] : ['admin-2'])),
    hodsOf: jest.fn().mockResolvedValue(['hod-1']),
    store: jest.fn().mockResolvedValue(push),
  };
  return { database, notifications, push, rows, service: new AnnouncementsService(database as never, notifications as never) };
}

type ListArgs = { where: { AND: unknown[]; category?: string } & Record<string, unknown>; skip: number; take: number };
const listArgs = (database: ReturnType<typeof setup>['database']) => database.announcement.findMany.mock.calls[0]?.[0] as ListArgs;

describe('audiencesFor', () => {
  it('shows students only college-wide and student announcements', () => {
    expect(audiencesFor(context(['STUDENT'])).sort()).toEqual([AnnouncementAudience.ALL, AnnouncementAudience.STUDENTS].sort());
  });

  it('shows faculty and HOD college-wide, faculty and staff announcements but not student ones', () => {
    for (const role of ['FACULTY', 'HOD'] as const) {
      expect(audiencesFor(context([role])).sort()).toEqual([AnnouncementAudience.ALL, AnnouncementAudience.FACULTY, AnnouncementAudience.STAFF].sort());
    }
  });

  it('shows admins every audience', () => {
    expect(audiencesFor(context(['ADMIN'])).sort()).toEqual(Object.values(AnnouncementAudience).sort());
  });
});

describe('AnnouncementsService.list', () => {
  it('lists published, unexpired announcements in the caller college, untargeted or covering their section', async () => {
    const { database, service } = setup();
    await service.list({ page: 2, pageSize: 5, category: 'EXAMINATION' }, context(['STUDENT']));
    const args = listArgs(database);
    expect(args.where).toMatchObject({ collegeId: 'col-a', category: 'EXAMINATION', audience: { in: expect.arrayContaining(['ALL', 'STUDENTS']) }, publishedAt: { lte: expect.any(Date) } });
    expect(args.where.AND).toContainEqual({ OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }] });
    expect(args.where.AND).toContainEqual({ OR: [UNTARGETED, covering('sec-a', 3, 'dept-cse')] });
    expect(database.enrollment.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { collegeId: 'col-a', status: 'ACTIVE', student: { userId: 'user-1' } } }));
    expect(database.class.findMany).not.toHaveBeenCalled();
    expect(args).toMatchObject({ skip: 5, take: 5 });
  });

  it('shows faculty announcements for the sections they teach and their whole department', async () => {
    const { database, service } = setup();
    await service.list({ page: 1, pageSize: 10 }, context(['FACULTY'], 'dept-cse'));
    expect(listArgs(database).where.AND).toContainEqual({ OR: [UNTARGETED, covering('sec-b', 5, 'dept-cse'), { departmentId: 'dept-cse', semesterNumber: null, sectionId: null }] });
  });

  it('shows an HOD everything in their department and semester-wide notices', async () => {
    const { database, service } = setup();
    database.class.findMany.mockResolvedValueOnce([]);
    await service.list({ page: 1, pageSize: 10 }, context(['HOD'], 'dept-ece'));
    expect(listArgs(database).where.AND).toContainEqual({
      OR: [UNTARGETED, { departmentId: 'dept-ece', semesterNumber: null, sectionId: null }, { departmentId: 'dept-ece' }, { departmentId: null, sectionId: null, semesterNumber: { not: null } }],
    });
  });

  it('does not limit what Admins see', async () => {
    const { database, service } = setup();
    await service.list({ page: 1, pageSize: 10, search: 'exam' }, context(['ADMIN']));
    expect(listArgs(database).where.AND).toHaveLength(2);
    expect(database.enrollment.findMany).not.toHaveBeenCalled();
    expect(database.class.findMany).not.toHaveBeenCalled();
  });
});

describe('AnnouncementsService.create', () => {
  it('publishes now as the caller, claims it and notifies the audience in one transaction, except the author', async () => {
    const { database, notifications, push, service } = setup();
    const result = await service.create(input(), context(['ADMIN']));
    expect(database.announcement.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ collegeId: 'col-a', authorId: 'user-1', category: 'HOLIDAY', departmentId: null, publishedAt: expect.any(Date) }) }),
    );
    expect(database.announcement.updateMany).toHaveBeenCalledWith({ where: { id: 'ann-1', notifiedAt: null, archivedAt: null }, data: { notifiedAt: expect.any(Date) } });
    expect(notifications.usersWithRoles).toHaveBeenCalledWith('col-a', ['ADMIN', 'HOD', 'FACULTY', 'STUDENT']);
    // Stored with the transaction client, then pushed live once it has committed.
    expect(notifications.store).toHaveBeenCalledWith(database, 'col-a', ['admin-2', 'student-1'], expect.objectContaining({ category: 'ANNOUNCEMENT', title: 'Announcement: Holiday' }));
    expect(push).toHaveBeenCalledTimes(1);
    expect(result.notifiedAt).toEqual(expect.any(Date));
  });

  it('leaves a scheduled announcement for the delivery check', async () => {
    const { database, notifications, service } = setup();
    await service.create(input({ publishedAt: new Date(Date.now() + 3_600_000) }), context(['ADMIN']));
    expect(database.announcement.updateMany).not.toHaveBeenCalled();
    expect(notifications.store).not.toHaveBeenCalled();
  });

  it('never fails publishing over notifications: it stays unclaimed for the next check', async () => {
    const { notifications, push, service } = setup();
    notifications.store.mockRejectedValueOnce(new Error('database down'));
    const log = jest.spyOn((service as unknown as { logger: { error: () => void } }).logger, 'error').mockImplementation(() => undefined);
    await expect(service.create(input(), context(['ADMIN']))).resolves.toMatchObject({ id: 'ann-1', notifiedAt: null });
    expect(push).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalled();
  });

  it('targets a section with its department and semester, and checks the target', async () => {
    const { database, service } = setup();
    await service.create(input({ target: { sectionId: 'sec-a' } }), context(['ADMIN']));
    expect(database.section.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'sec-a', collegeId: 'col-a' } }));
    expect(database.announcement.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ departmentId: 'dept-cse', semesterNumber: 3, sectionId: 'sec-a' }) }));

    await expect(service.create(input({ target: { sectionId: 'sec-a', semesterNumber: 5 } }), context(['ADMIN']))).rejects.toBeInstanceOf(BadRequestException);
    database.section.findFirst.mockResolvedValueOnce(null);
    await expect(service.create(input({ target: { sectionId: 'other-college' } }), context(['ADMIN']))).rejects.toBeInstanceOf(NotFoundException);
    database.department.findFirst.mockResolvedValueOnce(null);
    await expect(service.create(input({ target: { departmentId: 'other-college' } }), context(['ADMIN']))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('notifies only the people a targeted announcement is for', async () => {
    const { database, notifications, service } = setup();
    await service.create(input({ target: { departmentId: 'dept-cse' } }), context(['ADMIN']));
    const covered = { semester: { course: { departmentId: 'dept-cse' } } };
    expect(database.student.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ collegeId: 'col-a', enrollments: { some: { status: 'ACTIVE', section: covered } } }) }));
    // Department-wide: its faculty, and anyone teaching one of its sections.
    expect(database.faculty.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ OR: [{ classes: { some: { section: covered } } }, { departmentId: 'dept-cse' }] }) }));
    expect(notifications.hodsOf).toHaveBeenCalledWith('col-a', 'dept-cse');
    expect(notifications.store).toHaveBeenCalledWith(database, 'col-a', ['admin-2', 'student-1', 'student-2', 'faculty-1', 'hod-1'], expect.anything());
  });

  it('notifies students only for a student announcement to one semester, and every HOD for a semester-wide staff one', async () => {
    const { database, notifications, service } = setup();
    await service.create(input({ audience: 'STUDENTS', target: { semesterNumber: 3 } }), context(['ADMIN']));
    expect(database.faculty.findMany).not.toHaveBeenCalled();
    expect(notifications.hodsOf).not.toHaveBeenCalled();
    expect(notifications.store).toHaveBeenLastCalledWith(database, 'col-a', ['student-1', 'student-2'], expect.anything());

    await service.create(input({ audience: 'FACULTY', target: { semesterNumber: 3 } }), context(['ADMIN']));
    expect(database.faculty.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({ OR: [{ classes: { some: { section: { semester: { number: 3 } } } } }] }) }));
    expect(notifications.store).toHaveBeenLastCalledWith(database, 'col-a', ['faculty-1', 'hod-1', 'hod-2'], expect.anything());
  });
});

describe('AnnouncementsService.deliverDue', () => {
  it('claims each due announcement before announcing it, once', async () => {
    const { database, notifications, push, rows, service } = setup();
    const now = new Date('2026-11-20T09:00:00Z');
    rows.set('expired', stored({ id: 'expired', expiresAt: new Date('2026-11-20T08:00:00Z') }));
    // "taken": another check claimed it, or an archive committed first; either way the claim updates nothing.
    database.announcement.findMany.mockResolvedValueOnce([stored({ id: 'due-1' }), stored({ id: 'taken' }), stored({ id: 'expired' })]);
    database.announcement.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });
    await expect(service.deliverDue(now)).resolves.toBe(1);
    expect(database.announcement.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { notifiedAt: null, archivedAt: null, publishedAt: { lte: now } } }));
    expect(database.announcement.updateMany).toHaveBeenCalledWith({ where: { id: 'due-1', notifiedAt: null, archivedAt: null }, data: { notifiedAt: now } });
    expect(notifications.store).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledTimes(1);
  });

  it('keeps going when one delivery fails', async () => {
    const { database, notifications, service } = setup();
    jest.spyOn((service as unknown as { logger: { error: () => void } }).logger, 'error').mockImplementation(() => undefined);
    database.announcement.findMany.mockResolvedValueOnce([stored({ id: 'broken' }), stored({ id: 'fine' })]);
    notifications.store.mockRejectedValueOnce(new Error('insert failed'));
    await expect(service.deliverDue()).resolves.toBe(1);
    expect(notifications.store).toHaveBeenCalledTimes(2);
  });

  it('logs a failure instead of throwing', async () => {
    const { database, service } = setup();
    database.announcement.findMany.mockRejectedValueOnce(new Error('database down'));
    const log = jest.spyOn((service as unknown as { logger: { error: () => void } }).logger, 'error').mockImplementation(() => undefined);
    await expect(service.deliverDue()).resolves.toBe(0);
    expect(log).toHaveBeenCalled();
  });
});

describe('Admin announcement history, edits and archive', () => {
  const edit = (overrides: Partial<UpdateAnnouncementDto> = {}): UpdateAnnouncementDto => ({ ...input(), expiresAt: null, ...overrides });

  it('works out each state', () => {
    const now = new Date('2026-11-18T10:00:00Z');
    expect(stateOf({ archivedAt: now, publishedAt: now, expiresAt: null }, now)).toBe('ARCHIVED');
    expect(stateOf({ archivedAt: null, publishedAt: new Date('2026-11-19T00:00:00Z'), expiresAt: null }, now)).toBe('SCHEDULED');
    expect(stateOf({ archivedAt: null, publishedAt: new Date('2026-11-01T00:00:00Z'), expiresAt: new Date('2026-11-10T00:00:00Z') }, now)).toBe('EXPIRED');
    expect(stateOf({ archivedAt: null, publishedAt: new Date('2026-11-01T00:00:00Z'), expiresAt: null }, now)).toBe('PUBLISHED');
  });

  it('lists every announcement in the college for Admin, by state, with counts', async () => {
    const { database, service } = setup();
    database.announcement.findMany.mockResolvedValueOnce([stored({ publishedAt: new Date(Date.now() + 60_000) })]);
    database.announcement.count.mockResolvedValueOnce(1).mockResolvedValueOnce(4).mockResolvedValueOnce(1).mockResolvedValueOnce(2).mockResolvedValueOnce(0);
    const result = await service.manage({ page: 1, pageSize: 10, state: 'SCHEDULED' }, context(['ADMIN']));
    expect(database.announcement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { AND: [{ collegeId: 'col-a' }, { archivedAt: null, OR: [{ publishedAt: null }, { publishedAt: { gt: expect.any(Date) } }] }] } }),
    );
    expect(result).toMatchObject({ total: 1, counts: { PUBLISHED: 4, SCHEDULED: 1, EXPIRED: 2, ARCHIVED: 0 }, items: [{ id: 'ann-1', state: 'SCHEDULED' }] });
    await expect(service.manage({ page: 1, pageSize: 10 }, context(['HOD'], 'dept-cse'))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('edits a published announcement without announcing it again', async () => {
    const { database, notifications, service } = setup();
    const result = await service.update('ann-1', edit({ title: 'Holiday moved', target: { departmentId: 'dept-cse' } }), context(['ADMIN']));
    expect(database.announcement.updateMany).toHaveBeenCalledWith({
      where: { id: 'ann-1', collegeId: 'col-a', notifiedAt: new Date('2026-11-18T09:00:00Z') },
      data: expect.objectContaining({ title: 'Holiday moved', departmentId: 'dept-cse', publishedAt: new Date('2026-11-18T09:00:00Z'), expiresAt: null }),
    });
    expect(database.announcement.updateMany.mock.calls[0]?.[0]).not.toHaveProperty('data.notifiedAt');
    expect(database.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'ANNOUNCEMENT_UPDATED', entityId: 'ann-1', actorId: 'user-1' }) });
    expect(notifications.store).not.toHaveBeenCalled();
    expect(result.state).toBe('PUBLISHED');
  });

  it("won't move a published announcement's publish time", async () => {
    const { service } = setup();
    await expect(service.update('ann-1', edit({ publishedAt: new Date(Date.now() + 86_400_000) }), context(['ADMIN']))).rejects.toMatchObject({ response: { code: 'ALREADY_PUBLISHED' } });
  });

  it('publishes a scheduled announcement at once when it is moved to now', async () => {
    const { database, notifications, service } = setup();
    database.announcement.findFirst.mockResolvedValueOnce(stored({ publishedAt: new Date(Date.now() + 86_400_000), notifiedAt: null }));
    await service.update('ann-1', edit({ publishedAt: new Date(Date.now() - 1000) }), context(['ADMIN']));
    // The edit is written first, then claimed and announced by the same path as every delivery.
    expect(database.announcement.updateMany).toHaveBeenNthCalledWith(1, { where: expect.objectContaining({ notifiedAt: null }), data: expect.not.objectContaining({ notifiedAt: expect.anything() }) });
    expect(database.announcement.updateMany).toHaveBeenNthCalledWith(2, { where: { id: 'ann-1', notifiedAt: null, archivedAt: null }, data: { notifiedAt: expect.any(Date) } });
    expect(notifications.store).toHaveBeenCalledTimes(1);
  });

  it('refuses an edit that races the scheduled delivery, and a missing announcement', async () => {
    const { database, service } = setup();
    database.announcement.findFirst.mockResolvedValueOnce(stored({ publishedAt: new Date(Date.now() + 60_000), notifiedAt: null }));
    database.announcement.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.update('ann-1', edit(), context(['ADMIN']))).rejects.toMatchObject({ response: { code: 'ANNOUNCEMENT_CHANGED' } });
    expect(database.auditLog.create).not.toHaveBeenCalled();
    database.announcement.findFirst.mockResolvedValueOnce(null);
    await expect(service.update('other-college', edit(), context(['ADMIN']))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('archives and restores once each, with an audit entry', async () => {
    const { database, service } = setup();
    await service.archive('ann-1', context(['ADMIN']));
    expect(database.announcement.updateMany).toHaveBeenCalledWith({ where: { id: 'ann-1', collegeId: 'col-a', archivedAt: null }, data: { archivedAt: expect.any(Date) } });
    expect(database.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'ANNOUNCEMENT_ARCHIVED', entityId: 'ann-1' }) });

    database.announcement.updateMany.mockResolvedValueOnce({ count: 0 });
    database.announcement.count.mockResolvedValueOnce(1);
    await expect(service.archive('ann-1', context(['ADMIN']))).rejects.toBeInstanceOf(ConflictException);

    await service.restore('ann-1', context(['ADMIN']));
    expect(database.announcement.updateMany).toHaveBeenLastCalledWith({ where: { id: 'ann-1', collegeId: 'col-a', archivedAt: { not: null } }, data: { archivedAt: null } });

    database.announcement.updateMany.mockResolvedValueOnce({ count: 0 });
    database.announcement.count.mockResolvedValueOnce(0);
    await expect(service.restore('missing', context(['ADMIN']))).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.archive('ann-1', context(['FACULTY'], 'dept-cse'))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('hides archived announcements from the list', async () => {
    const { database, service } = setup();
    await service.list({ page: 1, pageSize: 10 }, context(['ADMIN']));
    expect(listArgs(database).where).toMatchObject({ archivedAt: null });
  });
});

describe('announcement input', () => {
  it('validates announcements', () => {
    expect(() => parseCreateAnnouncementDto({ title: 'Hi', body: 'x' })).toThrow();
    expect(() => parseCreateAnnouncementDto({ title: 'Holiday', body: '' })).toThrow();
    expect(() => parseCreateAnnouncementDto({ title: 'Holiday', body: 'Closed', audience: 'PARENTS' })).toThrow();
    expect(() => parseCreateAnnouncementDto({ title: 'Holiday', body: 'Closed', category: 'GOSSIP' })).toThrow();
    expect(() => parseCreateAnnouncementDto({ title: 'Holiday', body: 'Closed', publishedAt: '2099-12-01', expiresAt: '2099-11-30' })).toThrow();
    expect(() => parseCreateAnnouncementDto({ title: 'Holiday', body: 'Closed', expiresAt: '2020-01-01' })).toThrow();
    for (const semesterNumber of [0, 13, 2.5, 'x']) expect(() => parseCreateAnnouncementDto({ title: 'Holiday', body: 'Closed', semesterNumber })).toThrow();
    expect(parseCreateAnnouncementDto({ title: ' Holiday ', body: 'Closed', departmentId: '', sectionId: null })).toMatchObject({
      title: 'Holiday',
      audience: 'ALL',
      category: 'GENERAL',
      target: { departmentId: undefined, semesterNumber: undefined, sectionId: undefined },
    });
    expect(parseCreateAnnouncementDto({ title: 'Mid-sem', body: 'Timetable out', category: 'EXAMINATION', departmentId: 'dept-cse', semesterNumber: '3' })).toMatchObject({
      category: 'EXAMINATION',
      target: { departmentId: 'dept-cse', semesterNumber: 3 },
    });
  });

  it('reads an edit and the history filters', () => {
    expect(parseUpdateAnnouncementDto({ title: 'Holiday', body: 'Closed', expiresAt: '' })).toMatchObject({ expiresAt: null, publishedAt: undefined, target: {} });
    // An expired announcement keeps its past expiry when corrected; new announcements can't be created expired.
    expect(parseUpdateAnnouncementDto({ title: 'Holiday', body: 'Closed', expiresAt: '2020-01-01' })).toMatchObject({ expiresAt: new Date('2020-01-01') });
    expect(() => parseUpdateAnnouncementDto({ title: 'Holiday', body: 'Closed', publishedAt: '2020-02-01', expiresAt: '2020-01-01' })).toThrow();
    expect(parseManageAnnouncementQuery({ state: 'ARCHIVED' })).toMatchObject({ state: 'ARCHIVED', page: 1 });
    expect(() => parseManageAnnouncementQuery({ state: 'DELETED' })).toThrow();
  });

  it('validates list queries', () => {
    expect(() => parseAnnouncementListQuery({ pageSize: '500' })).toThrow();
    expect(() => parseAnnouncementListQuery({ category: 'NOPE' })).toThrow();
    expect(parseAnnouncementListQuery({ search: '', category: 'HOLIDAY' })).toEqual({ search: undefined, category: 'HOLIDAY', page: 1, pageSize: 10 });
  });
});
