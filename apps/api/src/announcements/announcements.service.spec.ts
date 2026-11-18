import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AnnouncementAudience } from '@prisma/client';
import { AnnouncementsService, audiencesFor } from './announcements.service';
import { parseAnnouncementListQuery, parseCreateAnnouncementDto } from './announcements.dto';
import type { CreateAnnouncementDto } from './announcements.dto';
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
  const database = {
    announcement: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve(stored({ ...data, id: 'ann-1' }))),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    enrollment: { findMany: jest.fn().mockResolvedValue([place('sec-a', 3, 'dept-cse')]) },
    class: { findMany: jest.fn().mockResolvedValue([place('sec-b', 5, 'dept-cse')]) },
    section: { findFirst: jest.fn().mockResolvedValue({ id: 'sec-a', semester: { number: 3, course: { departmentId: 'dept-cse' } } }) },
    department: { findFirst: jest.fn().mockResolvedValue({ id: 'dept-cse' }) },
    student: { findMany: jest.fn().mockResolvedValue([{ userId: 'student-1' }, { userId: 'student-2' }]) },
    faculty: { findMany: jest.fn().mockResolvedValue([{ userId: 'faculty-1' }]) },
  };
  const notifications = {
    safely: jest.fn().mockImplementation((work: (n: unknown) => Promise<void>) => work(notifications)),
    usersWithRoles: jest.fn().mockImplementation((_college: string, roles: string[]) => Promise.resolve(roles.includes('STUDENT') ? ['user-1', 'admin-2', 'student-1'] : roles.includes('HOD') && roles.length === 1 ? ['hod-1', 'hod-2'] : ['admin-2'])),
    hodsOf: jest.fn().mockResolvedValue(['hod-1']),
    notify: jest.fn().mockResolvedValue(undefined),
  };
  return { database, notifications, service: new AnnouncementsService(database as never, notifications as never) };
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
  it('publishes now as the caller and notifies the audience, except the author', async () => {
    const { database, notifications, service } = setup();
    await service.create(input(), context(['ADMIN']));
    expect(database.announcement.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ collegeId: 'col-a', authorId: 'user-1', category: 'HOLIDAY', departmentId: null, publishedAt: expect.any(Date), notifiedAt: expect.any(Date) }) }),
    );
    expect(notifications.usersWithRoles).toHaveBeenCalledWith('col-a', ['ADMIN', 'HOD', 'FACULTY', 'STUDENT']);
    expect(notifications.notify).toHaveBeenCalledWith('col-a', ['admin-2', 'student-1'], expect.objectContaining({ category: 'ANNOUNCEMENT', title: 'Announcement: Holiday' }));
  });

  it('leaves a scheduled announcement for the delivery check', async () => {
    const { database, notifications, service } = setup();
    await service.create(input({ publishedAt: new Date(Date.now() + 3_600_000) }), context(['ADMIN']));
    expect(database.announcement.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ notifiedAt: null }) }));
    expect(notifications.notify).not.toHaveBeenCalled();
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
    expect(notifications.notify).toHaveBeenCalledWith('col-a', ['admin-2', 'student-1', 'student-2', 'faculty-1', 'hod-1'], expect.anything());
  });

  it('notifies students only for a student announcement to one semester, and every HOD for a semester-wide staff one', async () => {
    const { database, notifications, service } = setup();
    await service.create(input({ audience: 'STUDENTS', target: { semesterNumber: 3 } }), context(['ADMIN']));
    expect(database.faculty.findMany).not.toHaveBeenCalled();
    expect(notifications.hodsOf).not.toHaveBeenCalled();
    expect(notifications.notify).toHaveBeenLastCalledWith('col-a', ['student-1', 'student-2'], expect.anything());

    await service.create(input({ audience: 'FACULTY', target: { semesterNumber: 3 } }), context(['ADMIN']));
    expect(database.faculty.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({ OR: [{ classes: { some: { section: { semester: { number: 3 } } } } }] }) }));
    expect(notifications.notify).toHaveBeenLastCalledWith('col-a', ['faculty-1', 'hod-1', 'hod-2'], expect.anything());
  });
});

describe('AnnouncementsService.deliverDue', () => {
  it('claims each due announcement before announcing it, once', async () => {
    const { database, notifications, service } = setup();
    const now = new Date('2026-11-20T09:00:00Z');
    database.announcement.findMany.mockResolvedValueOnce([stored({ id: 'due-1' }), stored({ id: 'taken' }), stored({ id: 'expired', expiresAt: new Date('2026-11-20T08:00:00Z') })]);
    database.announcement.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });
    await expect(service.deliverDue(now)).resolves.toBe(1);
    expect(database.announcement.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { notifiedAt: null, publishedAt: { lte: now } } }));
    expect(database.announcement.updateMany).toHaveBeenCalledWith({ where: { id: 'due-1', notifiedAt: null }, data: { notifiedAt: now } });
    expect(notifications.notify).toHaveBeenCalledTimes(1);
  });

  it('logs a failure instead of throwing', async () => {
    const { database, service } = setup();
    database.announcement.findMany.mockRejectedValueOnce(new Error('database down'));
    const log = jest.spyOn((service as unknown as { logger: { error: () => void } }).logger, 'error').mockImplementation(() => undefined);
    await expect(service.deliverDue()).resolves.toBe(0);
    expect(log).toHaveBeenCalled();
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

  it('validates list queries', () => {
    expect(() => parseAnnouncementListQuery({ pageSize: '500' })).toThrow();
    expect(() => parseAnnouncementListQuery({ category: 'NOPE' })).toThrow();
    expect(parseAnnouncementListQuery({ search: '', category: 'HOLIDAY' })).toEqual({ search: undefined, category: 'HOLIDAY', page: 1, pageSize: 10 });
  });
});
