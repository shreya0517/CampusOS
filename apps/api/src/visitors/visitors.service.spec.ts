import { ConflictException, NotFoundException } from '@nestjs/common';
import { VisitorStatus } from '@prisma/client';
import { VisitorsService } from './visitors.service';
import type { AuthorizationContext } from '../authorization/authorization.types';

const hod: AuthorizationContext = { userId: 'hod-1', collegeId: 'col-a', roles: ['HOD'], permissions: [], departmentId: 'dept-a' };
const admin: AuthorizationContext = { userId: 'admin-1', collegeId: 'col-a', roles: ['ADMIN'], permissions: [], departmentId: null };
const hodScope = { OR: [{ host: { facultyProfiles: { some: { departmentId: 'dept-a' } } } }, { hostUserId: null, registeredBy: { facultyProfiles: { some: { departmentId: 'dept-a' } } } }] };

describe('VisitorsService department scope', () => {
  const database = { visitor: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0), findFirst: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
  const service = new VisitorsService(database as never);
  beforeEach(() => jest.clearAllMocks());

  it('lists an HOD only the visitors hosted by, or registered by, their department', async () => {
    await service.listVisitors({ page: 1, pageSize: 20 }, hod);
    expect(database.visitor.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { collegeId: 'col-a', ...hodScope } }));
  });

  it('lists admins every visitor in the college', async () => {
    await service.listVisitors({ page: 1, pageSize: 20 }, admin);
    expect(database.visitor.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { collegeId: 'col-a' } }));
  });

  it('does not let an HOD open or review another department\'s visitor', async () => {
    database.visitor.findFirst.mockResolvedValue(null);
    await expect(service.getVisitor('v-1', hod)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.reviewVisitor('v-1', { decision: 'APPROVED' }, hod)).rejects.toBeInstanceOf(NotFoundException);
    expect(database.visitor.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'v-1', collegeId: 'col-a', ...hodScope } }));
    expect(database.visitor.updateMany).not.toHaveBeenCalled();
  });

  it('only reviews pending requests', async () => {
    database.visitor.findFirst.mockResolvedValue({ id: 'v-1', status: VisitorStatus.APPROVED });
    await expect(service.reviewVisitor('v-1', { decision: 'REJECTED' }, admin)).rejects.toBeInstanceOf(ConflictException);
    database.visitor.findFirst.mockResolvedValue({ id: 'v-1', status: VisitorStatus.PENDING });
    await service.reviewVisitor('v-1', { decision: 'APPROVED' }, hod);
    expect(database.visitor.updateMany).toHaveBeenCalledWith({
      // An HOD's write also carries their department scope.
      where: { id: 'v-1', collegeId: 'col-a', status: VisitorStatus.PENDING, OR: expect.any(Array) },
      data: expect.objectContaining({ status: VisitorStatus.APPROVED, approvedByUserId: 'hod-1' }),
    });
  });

  it('turns a review that lost a race into a conflict', async () => {
    database.visitor.findFirst.mockResolvedValue({ id: 'v-1', status: VisitorStatus.PENDING });
    database.visitor.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.reviewVisitor('v-1', { decision: 'REJECTED' }, admin)).rejects.toBeInstanceOf(ConflictException);
  });
});
