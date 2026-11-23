import { ForbiddenException } from '@nestjs/common';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { verifyPassword } from '../auth/auth.service';
import { parseCreateStudentDto, parseStudentAccountDto } from './students.dto';
import { StudentsService } from './students.service';

const admin: AuthorizationContext = { userId: 'admin', collegeId: 'college-a', roles: ['ADMIN'], permissions: [], departmentId: null };
const hod: AuthorizationContext = { userId: 'hod', collegeId: 'college-a', roles: ['HOD'], permissions: [], departmentId: 'department-a' };

const section = { id: 'section-a', collegeId: 'college-a', semester: { course: { departmentId: 'department-a', department: { id: 'department-a' } } } };
const studentRow = { id: 'student-a', collegeId: 'college-a', userId: 'new-user', studentCode: 'STU-9', firstName: 'Riya', lastName: 'Sen', enrollments: [], user: { email: 'riya@college.test', status: 'ACTIVE' } };

function createDatabase() {
  const database = {
    section: { findFirst: jest.fn().mockResolvedValue(section) },
    student: { create: jest.fn().mockResolvedValue(studentRow), findFirst: jest.fn().mockResolvedValue({ id: 'student-b', userId: null, firstName: 'Kabir', lastName: 'Singh' }), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    user: { create: jest.fn().mockResolvedValue({ id: 'new-user' }) },
    role: { upsert: jest.fn().mockResolvedValue({ id: 'role-student' }) },
    userRole: { create: jest.fn() },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  database.$transaction.mockImplementation((work: (tx: typeof database) => Promise<unknown>) => work(database));
  return database;
}

describe('StudentsService sign-in accounts', () => {
  it('validates the optional email', () => {
    expect(parseCreateStudentDto({ studentCode: 'S', firstName: 'Riya', lastName: 'Sen', sectionId: 'x', email: 'Riya@College.Test' })).toMatchObject({ email: 'riya@college.test' });
    expect(() => parseCreateStudentDto({ studentCode: 'S', firstName: 'Riya', lastName: 'Sen', sectionId: 'x', email: 'nope' })).toThrow();
    expect(() => parseStudentAccountDto({})).toThrow();
  });

  it('creates the student with a STUDENT account and a temporary password when an email is given', async () => {
    const database = createDatabase();
    const result = await new StudentsService(database as never).create({ studentCode: 'STU-9', firstName: 'Riya', lastName: 'Sen', sectionId: 'section-a', email: 'riya@college.test' }, admin);
    expect(result).toMatchObject({ account: { email: 'riya@college.test', status: 'ACTIVE' } });
    const userData = (database.user.create.mock.calls[0]?.[0] as { data: { passwordHash: string } }).data;
    await expect(verifyPassword(result.temporaryPassword as string, userData.passwordHash)).resolves.toBe(true);
    expect(database.role.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: { collegeId: 'college-a', name: 'STUDENT' } }));
    expect(database.student.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: 'new-user', studentCode: 'STU-9' }) }));
    expect(database.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'STUDENT_ACCOUNT_CREATED' }) });
  });

  it('reports a taken email as ACCOUNT_EXISTS and a taken code as STUDENT_EXISTS', async () => {
    const database = createDatabase();
    const service = new StudentsService(database as never);
    database.user.create.mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002', meta: { target: ['collegeId', 'email'] } }));
    await expect(service.create({ studentCode: 'STU-9', firstName: 'Riya', lastName: 'Sen', sectionId: 'section-a', email: 'taken@college.test' }, admin)).rejects.toMatchObject({ response: { code: 'ACCOUNT_EXISTS' } });
    database.student.create.mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002', meta: { target: ['collegeId', 'studentCode'] } }));
    await expect(service.create({ studentCode: 'STU-1', firstName: 'Riya', lastName: 'Sen', sectionId: 'section-a' }, admin)).rejects.toMatchObject({ response: { code: 'STUDENT_EXISTS' } });
  });

  it('adds an account to a student without one, once, for admins only', async () => {
    const database = createDatabase();
    const service = new StudentsService(database as never);
    database.student.findFirst.mockResolvedValueOnce({ id: 'student-b', userId: null, firstName: 'Kabir', lastName: 'Singh' }).mockResolvedValueOnce({ ...studentRow, id: 'student-b' });
    const result = await service.createAccount('student-b', { email: 'kabir@college.test' }, admin);
    expect(result.temporaryPassword).toBeTruthy();
    expect(database.student.updateMany).toHaveBeenCalledWith({ where: { id: 'student-b', collegeId: 'college-a', userId: null }, data: { userId: 'new-user' } });

    database.student.findFirst.mockResolvedValueOnce({ id: 'student-a', userId: 'user-a', firstName: 'Aarav', lastName: 'Mehta' });
    await expect(service.createAccount('student-a', { email: 'x@college.test' }, admin)).rejects.toMatchObject({ response: { code: 'ACCOUNT_EXISTS' } });
    await expect(service.createAccount('student-b', { email: 'x@college.test' }, hod)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('issues a new temporary password and signs the student out, for admins only', async () => {
    const database = { ...createDatabase(), user: { update: jest.fn() }, authSession: { updateMany: jest.fn() }, passwordResetToken: { updateMany: jest.fn() } };
    database.$transaction.mockImplementation((work: (tx: typeof database) => Promise<unknown>) => work(database));
    const service = new StudentsService(database as never);
    database.student.findFirst.mockResolvedValueOnce({ id: 'student-a', userId: 'user-a' }).mockResolvedValueOnce(studentRow);
    const result = await service.resetAccountPassword('student-a', admin);
    const update = database.user.update.mock.calls[0]?.[0] as { data: { passwordHash: string } };
    await expect(verifyPassword(result.temporaryPassword, update.data.passwordHash)).resolves.toBe(true);
    expect(database.authSession.updateMany).toHaveBeenCalledWith({ where: { collegeId: 'college-a', userId: 'user-a', revokedAt: null }, data: { revokedAt: expect.any(Date) } });
    expect(database.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'STUDENT_ACCOUNT_PASSWORD_RESET', entityId: 'student-a' }) });

    await expect(service.resetAccountPassword('student-a', hod)).rejects.toBeInstanceOf(ForbiddenException);
    database.student.findFirst.mockResolvedValueOnce({ id: 'student-b', userId: null });
    await expect(service.resetAccountPassword('student-b', admin)).rejects.toMatchObject({ response: { code: 'NO_ACCOUNT' } });
  });
});
