import { ForbiddenException } from '@nestjs/common';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { verifyPassword } from '../auth/auth.service';
import { parseFacultyAccountDto, parseFacultyDto, parseFacultyUpdateDto } from './faculty.dto';
import { FacultyService } from './faculty.service';

const admin: AuthorizationContext = { userId: 'admin', collegeId: 'college-a', roles: ['ADMIN'], permissions: [], departmentId: null };
const hod: AuthorizationContext = { userId: 'hod', collegeId: 'college-a', roles: ['HOD'], permissions: [], departmentId: 'department-a' };
const faculty: AuthorizationContext = { userId: 'fac', collegeId: 'college-a', roles: ['FACULTY'], permissions: [], departmentId: 'department-a' };

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 'faculty-a',
  employeeCode: 'F-1',
  firstName: 'Priya',
  lastName: 'Sharma',
  designation: 'Professor',
  departmentId: 'department-a',
  userId: 'user-priya',
  user: { email: 'priya@college.test', status: 'ACTIVE', userRoles: [{ role: { name: 'FACULTY' } }, { role: { name: 'HOD' } }] },
  _count: { classes: 2 },
  ...overrides,
});

function createDatabase() {
  const database = {
    department: { findFirst: jest.fn().mockResolvedValue({ id: 'department-a' }) },
    faculty: {
      create: jest.fn().mockResolvedValue(row({ userId: 'new-user', user: { email: 'asha@college.test', status: 'ACTIVE', userRoles: [{ role: { name: 'FACULTY' } }] }, _count: { classes: 0 } })),
      findFirst: jest.fn().mockResolvedValue(row()),
      findMany: jest.fn().mockResolvedValue([row()]),
      count: jest.fn().mockResolvedValue(1),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    user: { create: jest.fn().mockResolvedValue({ id: 'new-user' }), update: jest.fn() },
    role: { upsert: jest.fn().mockResolvedValue({ id: 'role-faculty' }) },
    userRole: { create: jest.fn() },
    authSession: { updateMany: jest.fn() },
    passwordResetToken: { updateMany: jest.fn() },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  database.$transaction.mockImplementation((work: (tx: typeof database) => Promise<unknown>) => work(database));
  return database;
}

describe('FacultyService accounts and designation', () => {
  it('validates designation and email input', () => {
    expect(parseFacultyDto({ employeeCode: 'F-9', firstName: 'Asha', lastName: 'Nair', email: 'Asha@College.Test', designation: 'Assistant Professor' })).toMatchObject({
      email: 'asha@college.test',
      designation: 'Assistant Professor',
    });
    expect(() => parseFacultyDto({ employeeCode: 'F-9', firstName: 'Asha', lastName: 'Nair', email: 'not-an-email' })).toThrow();
    expect(parseFacultyUpdateDto({ designation: '' })).toMatchObject({ designation: null });
    expect(() => parseFacultyUpdateDto({ designation: 'x'.repeat(81) })).toThrow();
    expect(() => parseFacultyAccountDto({})).toThrow();
  });

  it('creates a faculty account with a FACULTY role and a verified, hashed temporary password', async () => {
    const database = createDatabase();
    const service = new FacultyService(database as never);
    const result = await service.create({ employeeCode: 'F-9', firstName: 'Asha', lastName: 'Nair', departmentId: 'department-a', designation: 'Lecturer', email: 'asha@college.test' }, admin);

    expect(result.temporaryPassword).toMatch(/^[A-Za-z0-9_-]{16}$/);
    const userData = (database.user.create.mock.calls[0]?.[0] as { data: { passwordHash: string; emailVerifiedAt: Date } }).data;
    expect(userData).toMatchObject({ collegeId: 'college-a', email: 'asha@college.test', displayName: 'Asha Nair', status: 'ACTIVE' });
    expect(userData.emailVerifiedAt).toBeInstanceOf(Date);
    await expect(verifyPassword(result.temporaryPassword as string, userData.passwordHash)).resolves.toBe(true);
    expect(database.userRole.create).toHaveBeenCalledWith({ data: { collegeId: 'college-a', userId: 'new-user', roleId: 'role-faculty' } });
    expect(database.faculty.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: 'new-user', designation: 'Lecturer', departmentId: 'department-a' }) }));
    expect(database.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'FACULTY_ACCOUNT_CREATED', actorId: 'admin' }) });
  });

  it('creates a record without an account when no email is given', async () => {
    const database = createDatabase();
    database.faculty.create.mockResolvedValue(row({ userId: null, user: null }));
    const service = new FacultyService(database as never);
    const result = await service.create({ employeeCode: 'F-10', firstName: 'Ravi', lastName: 'Kumar' }, admin);
    expect(result).not.toHaveProperty('temporaryPassword');
    expect(result).toMatchObject({ account: null });
    expect(database.user.create).not.toHaveBeenCalled();
  });

  it('reports a taken email as ACCOUNT_EXISTS', async () => {
    const database = createDatabase();
    database.user.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002', meta: { target: ['collegeId', 'email'] } }));
    const service = new FacultyService(database as never);
    await expect(service.create({ employeeCode: 'F-9', firstName: 'Asha', lastName: 'Nair', email: 'priya@college.test' }, admin)).rejects.toMatchObject({ response: { code: 'ACCOUNT_EXISTS' } });
  });

  it('adds an account to an existing record only once', async () => {
    const database = createDatabase();
    database.faculty.findFirst.mockResolvedValueOnce({ id: 'faculty-b', userId: null, firstName: 'Ravi', lastName: 'Kumar' });
    const service = new FacultyService(database as never);
    const result = await service.createAccount('faculty-b', { email: 'ravi@college.test' }, admin);
    expect(result.temporaryPassword).toBeTruthy();
    expect(database.faculty.updateMany).toHaveBeenCalledWith({ where: { id: 'faculty-b', collegeId: 'college-a', userId: null }, data: { userId: 'new-user' } });

    database.faculty.findFirst.mockResolvedValueOnce({ id: 'faculty-a', userId: 'user-priya', firstName: 'Priya', lastName: 'Sharma' });
    await expect(service.createAccount('faculty-a', { email: 'x@college.test' }, admin)).rejects.toMatchObject({ response: { code: 'ACCOUNT_EXISTS' } });
    await expect(service.createAccount('faculty-a', { email: 'x@college.test' }, hod)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('deactivates an account and ends its sessions, but not your own', async () => {
    const database = createDatabase();
    const service = new FacultyService(database as never);
    await service.setAccountStatus('faculty-a', { status: 'INACTIVE' }, admin);
    expect(database.user.update).toHaveBeenCalledWith({ where: { collegeId_id: { collegeId: 'college-a', id: 'user-priya' } }, data: { status: 'INACTIVE' } });
    expect(database.authSession.updateMany).toHaveBeenCalledWith({ where: { collegeId: 'college-a', userId: 'user-priya', revokedAt: null }, data: { revokedAt: expect.any(Date) } });
    expect(database.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'FACULTY_ACCOUNT_DEACTIVATED' }) });

    database.faculty.findFirst.mockResolvedValueOnce({ id: 'faculty-a', userId: 'admin' });
    await expect(service.setAccountStatus('faculty-a', { status: 'INACTIVE' }, admin)).rejects.toMatchObject({ response: { code: 'OWN_ACCOUNT' } });
  });

  it('issues a new temporary password, signs the person out and voids open reset links, for admins only', async () => {
    const database = createDatabase();
    const service = new FacultyService(database as never);
    const result = await service.resetAccountPassword('faculty-a', admin);
    const update = database.user.update.mock.calls[0]?.[0] as { where: unknown; data: { passwordHash: string } };
    expect(update.where).toEqual({ collegeId_id: { collegeId: 'college-a', id: 'user-priya' } });
    await expect(verifyPassword(result.temporaryPassword, update.data.passwordHash)).resolves.toBe(true);
    expect(database.authSession.updateMany).toHaveBeenCalledWith({ where: { collegeId: 'college-a', userId: 'user-priya', revokedAt: null }, data: { revokedAt: expect.any(Date) } });
    expect(database.passwordResetToken.updateMany).toHaveBeenCalledWith({ where: { collegeId: 'college-a', userId: 'user-priya', usedAt: null }, data: { usedAt: expect.any(Date) } });
    expect(database.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'FACULTY_ACCOUNT_PASSWORD_RESET', actorId: 'admin', entityId: 'faculty-a' }) });

    await expect(service.resetAccountPassword('faculty-a', hod)).rejects.toBeInstanceOf(ForbiddenException);
    database.faculty.findFirst.mockResolvedValueOnce({ id: 'faculty-a', userId: null });
    await expect(service.resetAccountPassword('faculty-a', admin)).rejects.toMatchObject({ response: { code: 'NO_ACCOUNT' } });
    database.faculty.findFirst.mockResolvedValueOnce({ id: 'faculty-a', userId: 'admin' });
    await expect(service.resetAccountPassword('faculty-a', admin)).rejects.toMatchObject({ response: { code: 'OWN_ACCOUNT' } });
  });

  it('shows account details to admins and HODs, not to faculty', async () => {
    const database = createDatabase();
    const service = new FacultyService(database as never);
    const asAdmin = await service.list({ page: 1, pageSize: 20 }, admin);
    expect(asAdmin.items[0]).toMatchObject({ isHod: true, classCount: 2, designation: 'Professor', account: { email: 'priya@college.test', status: 'ACTIVE' } });
    expect(asAdmin.items[0]).not.toHaveProperty('user');
    const asFaculty = await service.list({ page: 1, pageSize: 20 }, faculty);
    expect(asFaculty.items[0]).toMatchObject({ isHod: true, classCount: 2 });
    expect(asFaculty.items[0]).not.toHaveProperty('account');
  });
});
