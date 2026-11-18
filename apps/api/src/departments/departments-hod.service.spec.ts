import { ForbiddenException } from '@nestjs/common';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { FacultyService } from '../faculty/faculty.service';
import { parseDepartmentHodDto } from './departments.dto';
import { DepartmentsService } from './departments.service';

const admin: AuthorizationContext = { userId: 'admin', collegeId: 'college-a', roles: ['ADMIN'], permissions: [], departmentId: null };
const hod: AuthorizationContext = { userId: 'hod', collegeId: 'college-a', roles: ['HOD'], permissions: [], departmentId: 'dept-cse' };

const inDepartment = (departmentId: string) => ({ section: { semester: { course: { departmentId } } } });

function createDatabase() {
  const database = {
    department: {
      findFirst: jest.fn().mockResolvedValue({ id: 'dept-cse', code: 'CSE', name: 'Computer Science', faculty: [{ id: 'fac-1' }, { id: 'fac-2' }], courses: [], subjects: [] }),
      findMany: jest.fn().mockResolvedValue([
        { id: 'dept-cse', code: 'CSE', name: 'Computer Science', faculty: [{ id: 'fac-1' }, { id: 'fac-2' }], _count: { courses: 1, subjects: 4 } },
        { id: 'dept-ece', code: 'ECE', name: 'Electronics', faculty: [], _count: { courses: 0, subjects: 0 } },
      ]),
      count: jest.fn().mockResolvedValue(2),
      update: jest.fn(),
    },
    faculty: {
      findFirst: jest.fn().mockResolvedValue({ id: 'fac-2', departmentId: 'dept-cse', userId: 'user-2', user: { status: 'ACTIVE' } }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    enrollment: {
      findMany: jest.fn().mockResolvedValue([
        { studentId: 'stu-1', ...inDepartment('dept-cse') },
        { studentId: 'stu-1', ...inDepartment('dept-cse') },
        { studentId: 'stu-2', ...inDepartment('dept-cse') },
      ]),
    },
    role: { upsert: jest.fn().mockResolvedValue({ id: 'role-hod' }) },
    userRole: { deleteMany: jest.fn(), upsert: jest.fn() },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  database.$transaction.mockImplementation((work: (tx: typeof database) => Promise<unknown>) => work(database));
  return database;
}

describe('DepartmentsService HOD assignment and counts', () => {
  it('parses the HOD body, where null removes the HOD', () => {
    expect(parseDepartmentHodDto({ facultyId: null })).toEqual({ facultyId: null });
    expect(parseDepartmentHodDto({ facultyId: 'fac-2' })).toEqual({ facultyId: 'fac-2' });
    expect(() => parseDepartmentHodDto({})).toThrow();
  });

  it('lists each department with its HOD and counts', async () => {
    const database = createDatabase();
    database.faculty.findMany.mockResolvedValue([{ id: 'fac-1', firstName: 'Priya', lastName: 'Sharma', employeeCode: 'F-1', designation: 'Professor', departmentId: 'dept-cse' }]);
    const service = new DepartmentsService(database as never);
    const result = await service.list({ page: 1, pageSize: 20 }, admin);
    expect(result.items[0]).toMatchObject({
      code: 'CSE',
      hod: { facultyId: 'fac-1', name: 'Priya Sharma', employeeCode: 'F-1', designation: 'Professor' },
      counts: { faculty: 2, students: 2, courses: 1, subjects: 4 },
    });
    expect(result.items[1]).toMatchObject({ code: 'ECE', hod: null, counts: { faculty: 0, students: 0, courses: 0, subjects: 0 } });
    expect(result.items[0]).not.toHaveProperty('_count');
  });

  it('makes a department faculty member HOD and removes the previous one', async () => {
    const database = createDatabase();
    database.faculty.findMany.mockResolvedValueOnce([{ id: 'fac-1', userId: 'user-1' }]);
    const service = new DepartmentsService(database as never);
    await service.setHod('dept-cse', { facultyId: 'fac-2' }, admin);
    expect(database.userRole.deleteMany).toHaveBeenCalledWith({ where: { collegeId: 'college-a', roleId: 'role-hod', userId: { in: ['user-1'] } } });
    expect(database.userRole.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: { collegeId: 'college-a', userId: 'user-2', roleId: 'role-hod' } }));
    expect(database.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'DEPARTMENT_HOD_CHANGED', entityId: 'dept-cse', metadata: { from: ['fac-1'], to: 'fac-2' } }) });
    // The department row is locked first and the current HOD read inside the same transaction.
    expect(database.department.update).toHaveBeenCalledWith({ where: { collegeId_id: { collegeId: 'college-a', id: 'dept-cse' } }, data: { updatedAt: expect.any(Date) } });
    expect(database.department.update.mock.invocationCallOrder[0]).toBeLessThan(database.faculty.findMany.mock.invocationCallOrder[0] as number);
  });

  it('removes the HOD when given null', async () => {
    const database = createDatabase();
    database.faculty.findMany.mockResolvedValueOnce([{ id: 'fac-1', userId: 'user-1' }]);
    const service = new DepartmentsService(database as never);
    await service.setHod('dept-cse', { facultyId: null }, admin);
    expect(database.userRole.deleteMany).toHaveBeenCalledWith({ where: { collegeId: 'college-a', roleId: 'role-hod', userId: { in: ['user-1'] } } });
    expect(database.userRole.upsert).not.toHaveBeenCalled();
  });

  it('refuses a candidate from another department, without an account, or inactive', async () => {
    const database = createDatabase();
    const service = new DepartmentsService(database as never);
    database.faculty.findFirst.mockResolvedValueOnce({ id: 'fac-9', departmentId: 'dept-ece', userId: 'user-9', user: { status: 'ACTIVE' } });
    await expect(service.setHod('dept-cse', { facultyId: 'fac-9' }, admin)).rejects.toMatchObject({ response: { code: 'NOT_IN_DEPARTMENT' } });
    database.faculty.findFirst.mockResolvedValueOnce({ id: 'fac-3', departmentId: 'dept-cse', userId: null, user: null });
    await expect(service.setHod('dept-cse', { facultyId: 'fac-3' }, admin)).rejects.toMatchObject({ response: { code: 'NO_ACCOUNT' } });
    database.faculty.findFirst.mockResolvedValueOnce({ id: 'fac-4', departmentId: 'dept-cse', userId: 'user-4', user: { status: 'INACTIVE' } });
    await expect(service.setHod('dept-cse', { facultyId: 'fac-4' }, admin)).rejects.toMatchObject({ response: { code: 'ACCOUNT_INACTIVE' } });
    expect(database.userRole.upsert).not.toHaveBeenCalled();
  });

  it('is for admins only', async () => {
    const service = new DepartmentsService(createDatabase() as never);
    await expect(service.setHod('dept-cse', { facultyId: 'fac-2' }, hod)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('FacultyService moving an HOD', () => {
  it('drops the HOD role when an HOD moves to another department', async () => {
    const database = {
      department: { findFirst: jest.fn().mockResolvedValue({ id: 'dept-ece' }) },
      faculty: {
        findFirst: jest.fn().mockResolvedValue({ id: 'fac-1', departmentId: 'dept-cse', userId: 'user-1', user: { email: 'p@x.test', status: 'ACTIVE', userRoles: [{ role: { name: 'HOD' } }] }, _count: { classes: 0 } }),
        update: jest.fn(),
      },
      userRole: { deleteMany: jest.fn() },
      auditLog: { create: jest.fn() },
      $transaction: jest.fn(),
    };
    database.$transaction.mockImplementation((work: (tx: typeof database) => Promise<unknown>) => work(database));
    const service = new FacultyService(database as never);
    await service.update('fac-1', { departmentId: 'dept-ece' }, admin);
    expect(database.userRole.deleteMany).toHaveBeenCalledWith({ where: { collegeId: 'college-a', userId: 'user-1', role: { name: 'HOD' } } });
    expect(database.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'DEPARTMENT_HOD_CHANGED', entityId: 'dept-cse' }) });

    database.userRole.deleteMany.mockClear();
    await service.update('fac-1', { designation: 'Professor' }, admin);
    expect(database.userRole.deleteMany).not.toHaveBeenCalled();
  });
});
