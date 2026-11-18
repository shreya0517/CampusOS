import { NotFoundException } from '@nestjs/common';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { AnnouncementsService } from '../announcements/announcements.service';
import { VisitorsService } from '../visitors/visitors.service';
import { parseNotificationListQuery } from './notifications.dto';
import { NOTIFICATION_EVENT, NotificationsService } from './notifications.service';

const faculty: AuthorizationContext = { userId: 'user-fac', collegeId: 'col-a', roles: ['FACULTY'], permissions: [], departmentId: 'dept-cse' };
const admin: AuthorizationContext = { userId: 'user-admin', collegeId: 'col-a', roles: ['ADMIN'], permissions: [], departmentId: null };

function createService() {
  const database = {
    notification: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(3),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    user: { findMany: jest.fn().mockResolvedValue([{ id: 'user-admin' }, { id: 'user-admin-2' }]) },
    faculty: { findMany: jest.fn().mockResolvedValue([{ userId: 'user-hod' }]), findFirst: jest.fn().mockResolvedValue({ departmentId: 'dept-cse' }) },
    student: { findMany: jest.fn().mockResolvedValue([{ userId: 'user-stu' }]) },
  };
  const events = { emitToUser: jest.fn() };
  return { database, events, service: new NotificationsService(database as never, events as never) };
}

describe('NotificationsService', () => {
  it('stores one row per distinct recipient and pushes it live', async () => {
    const { database, events, service } = createService();
    await service.notify('col-a', ['user-1', 'user-1', null, undefined, 'user-2'], { category: 'TASK', title: 'New task: Report', body: 'Due soon.', link: '/dashboard/tasks/t1' });
    const rows = (database.notification.createMany.mock.calls[0]?.[0] as { data: Array<Record<string, unknown>> }).data;
    expect(rows.map((row) => row.userId)).toEqual(['user-1', 'user-2']);
    expect(rows[0]).toMatchObject({ collegeId: 'col-a', channel: 'IN_APP', status: 'SENT', category: 'TASK', title: 'New task: Report', link: '/dashboard/tasks/t1' });
    expect(events.emitToUser).toHaveBeenCalledTimes(2);
    expect(events.emitToUser).toHaveBeenCalledWith('user-2', NOTIFICATION_EVENT, { category: 'TASK', title: 'New task: Report', link: '/dashboard/tasks/t1' });
  });

  it('writes large audiences in batches and never throws to the caller', async () => {
    const { database, service } = createService();
    await service.notify('col-a', Array.from({ length: 1201 }, (_, index) => `user-${index}`), { category: 'ANNOUNCEMENT', title: 'Holiday', body: 'Closed on Friday.' });
    expect(database.notification.createMany).toHaveBeenCalledTimes(3);
    database.notification.createMany.mockRejectedValueOnce(new Error('database down'));
    await expect(service.notify('col-a', ['user-1'], { category: 'TASK', title: 'x', body: 'y' })).resolves.toBeUndefined();
  });

  it('keeps lookup failures inside safely()', async () => {
    const { service } = createService();
    await expect(
      service.safely(async () => {
        throw new Error('lookup failed');
      }),
    ).resolves.toBeUndefined();
  });

  it('does nothing without recipients', async () => {
    const { database, service } = createService();
    await service.notify('col-a', [], { category: 'TASK', title: 'x', body: 'y' });
    expect(database.notification.createMany).not.toHaveBeenCalled();
  });

  it("lists only the caller's own notifications, with filters", async () => {
    const { database, service } = createService();
    await service.list(parseNotificationListQuery({ category: 'EXAM', unread: 'true' }), faculty);
    expect(database.notification.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { collegeId: 'col-a', userId: 'user-fac', category: 'EXAM', readAt: null } }));
    expect(() => parseNotificationListQuery({ category: 'NOPE' })).toThrow();
    expect(() => parseNotificationListQuery({ unread: 'yes' })).toThrow();
  });

  it("marks only the caller's own notification read, and reports others as not found", async () => {
    const { database, service } = createService();
    await expect(service.markRead('n1', faculty)).resolves.toEqual({ unread: 3 });
    expect(database.notification.updateMany).toHaveBeenCalledWith({ where: { id: 'n1', collegeId: 'col-a', userId: 'user-fac', readAt: null }, data: { readAt: expect.any(Date), status: 'READ' } });
    database.notification.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.markRead('someone-elses', faculty)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('marks everything (or one category) read', async () => {
    const { database, service } = createService();
    await service.markAllRead(faculty, 'TASK');
    expect(database.notification.updateMany).toHaveBeenCalledWith({ where: { collegeId: 'col-a', userId: 'user-fac', readAt: null, category: 'TASK' }, data: { readAt: expect.any(Date), status: 'READ' } });
  });
});

describe('notification producers', () => {
  it('tells the announcement audience, but not the author and not for a scheduled one', async () => {
    const notifications = { notify: jest.fn(), usersWithRoles: jest.fn().mockResolvedValue(['user-admin', 'user-stu-1', 'user-stu-2']), safely: (work: (n: unknown) => Promise<void>) => work(notifications) };
    const created = {
      id: 'a1',
      collegeId: 'col-a',
      authorId: 'user-admin',
      title: 'Holiday',
      body: 'College closed on Friday.',
      audience: 'STUDENTS',
      departmentId: null,
      semesterNumber: null,
      sectionId: null,
      publishedAt: new Date(Date.now() - 1000),
    };
    const database = { announcement: { create: jest.fn().mockResolvedValue(created) } };
    const service = new AnnouncementsService(database as never, notifications as never);
    const input = { title: 'Holiday', body: 'College closed on Friday.', audience: 'STUDENTS' as const, category: 'HOLIDAY' as const, target: {} };
    await service.create(input, admin);
    expect(notifications.usersWithRoles).toHaveBeenCalledWith('col-a', ['STUDENT']);
    expect(notifications.notify).toHaveBeenCalledWith('col-a', ['user-stu-1', 'user-stu-2'], expect.objectContaining({ category: 'ANNOUNCEMENT', title: 'Announcement: Holiday', link: '/dashboard/announcements' }));

    notifications.notify.mockClear();
    const later = new Date(Date.now() + 86_400_000);
    database.announcement.create.mockResolvedValue({ ...created, publishedAt: later });
    await service.create({ ...input, title: 'Later', publishedAt: later }, admin);
    expect(notifications.notify).not.toHaveBeenCalled();

    // A failing recipient lookup doesn't fail the request: the announcement is saved and returned.
    const real = new NotificationsService({} as never, { emitToUser: jest.fn() } as never);
    type Fake = { usersWithRoles: jest.Mock; notify: jest.Mock; safely: (work: (n: Fake) => Promise<void>) => Promise<void> };
    const failing: Fake = { usersWithRoles: jest.fn().mockRejectedValue(new Error('db down')), notify: jest.fn(), safely: (work) => real.safely(() => work(failing)) };
    database.announcement.create.mockResolvedValue(created);
    await expect(new AnnouncementsService(database as never, failing as never).create(input, admin)).resolves.toMatchObject({ id: 'a1' });
  });

  it("asks every Admin and the host department's HOD to approve a visitor, and tells the registrant the outcome", async () => {
    const notifications = { notify: jest.fn(), usersWithRoles: jest.fn().mockResolvedValue(['user-admin']), hodsOf: jest.fn().mockResolvedValue(['user-hod']), safely: (work: (n: unknown) => Promise<void>) => work(notifications) };
    const visitor = { id: 'v1', name: 'Ramesh', registeredByUserId: 'user-fac', status: 'PENDING', visitDate: new Date('2026-11-20') };
    const database = {
      visitor: { create: jest.fn().mockResolvedValue(visitor), findFirst: jest.fn().mockResolvedValue(visitor), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      faculty: { findFirst: jest.fn().mockResolvedValue({ departmentId: 'dept-cse' }) },
    };
    const service = new VisitorsService(database as never, notifications as never);
    await service.registerVisitor({ name: 'Ramesh', phone: '9876543210', purpose: 'Parent meeting', visitDate: new Date('2026-11-20') } as never, faculty);
    expect(notifications.hodsOf).toHaveBeenCalledWith('col-a', 'dept-cse');
    expect(notifications.notify).toHaveBeenCalledWith('col-a', ['user-admin', 'user-hod'], expect.objectContaining({ category: 'VISITOR', title: 'Visitor approval requested: Ramesh' }));

    notifications.notify.mockClear();
    await service.reviewVisitor('v1', { decision: 'APPROVED' } as never, admin);
    expect(notifications.notify).toHaveBeenCalledWith('col-a', ['user-fac'], expect.objectContaining({ title: 'Visitor approved: Ramesh' }));
  });
});
