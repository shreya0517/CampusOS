import { ForbiddenException } from '@nestjs/common';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { parseVisitorListQuery } from './visitors.dto';
import { VisitorsService } from './visitors.service';

const admin: AuthorizationContext = { userId: 'admin', collegeId: 'col-a', roles: ['ADMIN'], permissions: [], departmentId: null };
const hod: AuthorizationContext = { userId: 'hod', collegeId: 'col-a', roles: ['HOD'], permissions: [], departmentId: 'dept-cse' };
const faculty: AuthorizationContext = { userId: 'fac', collegeId: 'col-a', roles: ['FACULTY'], permissions: [], departmentId: 'dept-cse' };

function setup(status = 'APPROVED') {
  const visitor = { id: 'v1', name: 'Ramesh', purpose: 'Guest lecture', status, hostUserId: 'user-host', registeredByUserId: 'fac' };
  const database = {
    visitor: { findFirst: jest.fn().mockResolvedValue(visitor), updateMany: jest.fn().mockResolvedValue({ count: 1 }), findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    auditLog: { create: jest.fn() },
  };
  const notifications = { notify: jest.fn() };
  return { database, notifications, service: new VisitorsService(database as never, notifications as never) };
}

describe('VisitorsService check-in and check-out', () => {
  it('checks in an approved visitor, records the time, audits it and tells the host', async () => {
    const { database, notifications, service } = setup();
    await service.checkIn('v1', admin);
    expect(database.visitor.updateMany).toHaveBeenCalledWith({ where: { id: 'v1', collegeId: 'col-a', status: 'APPROVED' }, data: { status: 'CHECKED_IN', checkedInAt: expect.any(Date) } });
    expect(database.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'VISITOR_CHECKED_IN', entityId: 'v1', actorId: 'admin' }) });
    expect(notifications.notify).toHaveBeenCalledWith('col-a', ['user-host'], expect.objectContaining({ category: 'VISITOR', title: 'Your visitor has arrived: Ramesh' }));
  });

  it('checks out only a checked-in visitor', async () => {
    const { database, notifications, service } = setup('CHECKED_IN');
    await service.checkOut('v1', admin);
    expect(database.visitor.updateMany).toHaveBeenCalledWith({ where: { id: 'v1', collegeId: 'col-a', status: 'CHECKED_IN' }, data: { status: 'CHECKED_OUT', checkedOutAt: expect.any(Date) } });
    expect(notifications.notify).not.toHaveBeenCalled();
    database.visitor.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.checkOut('v1', admin)).rejects.toMatchObject({ response: { code: 'VISITOR_NOT_CHECKED_IN' } });
  });

  it('refuses to check in someone not approved, keeps HODs to their department, and blocks faculty', async () => {
    const { database, service } = setup('PENDING');
    database.visitor.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.checkIn('v1', admin)).rejects.toMatchObject({ response: { code: 'VISITOR_NOT_APPROVED' } });
    await service.checkIn('v1', hod);
    expect(database.visitor.findFirst).toHaveBeenCalledWith({ where: expect.objectContaining({ id: 'v1', collegeId: 'col-a', OR: expect.any(Array) }) });
    await expect(service.checkIn('v1', faculty)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('filters the list by visit date', async () => {
    const { database, service } = setup();
    await service.listVisitors(parseVisitorListQuery({ on: '2026-11-18', status: 'APPROVED' }), admin);
    expect(database.visitor.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { collegeId: 'col-a', status: 'APPROVED', visitDate: new Date('2026-11-18') } }));
    expect(() => parseVisitorListQuery({ on: '2026-13-45' })).toThrow();
    expect(() => parseVisitorListQuery({ on: 'today' })).toThrow();
  });
});
