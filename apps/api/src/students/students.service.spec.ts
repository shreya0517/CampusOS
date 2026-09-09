import { ForbiddenException } from '@nestjs/common';
import { StudentsService } from './students.service';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { parseCreateStudentDto, parseEnrollmentDto, parseStudentListQuery } from './students.dto';

const admin: AuthorizationContext = { userId: 'admin', collegeId: 'college-a', roles: ['ADMIN'], permissions: [], departmentId: null };
const hod: AuthorizationContext = { userId: 'hod', collegeId: 'college-a', roles: ['HOD'], permissions: [], departmentId: 'department-a' };
const student: AuthorizationContext = { userId: 'user-a', collegeId: 'college-a', roles: ['STUDENT'], permissions: [], departmentId: null };
const record = { id: 'student-a', collegeId: 'college-a', userId: 'user-a', studentCode: 'STU-1', firstName: 'Aarav', lastName: 'Mehta', enrollments: [] };

describe('StudentsService', () => {
  const database = { section: { findFirst: jest.fn() }, student: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), update: jest.fn() }, enrollment: { upsert: jest.fn() } };
  const service = new StudentsService(database as never);
  beforeEach(() => jest.clearAllMocks());

  it('validates required student, enrollment, and pagination input', () => {
    expect(() => parseCreateStudentDto({ firstName: 'A' })).toThrow();
    expect(() => parseEnrollmentDto({ sectionId: 4 })).toThrow();
    expect(() => parseStudentListQuery({ page: 'zero' })).toThrow();
    expect(parseStudentListQuery({ search: 'Aarav', page: '2', pageSize: '10' })).toMatchObject({ search: 'Aarav', page: 2, pageSize: 10 });
  });

  it('allows ADMIN create in its college and scopes its section query by authenticated college', async () => {
    database.section.findFirst.mockResolvedValue({ id: 'section-a', collegeId: 'college-a', semester: { course: { departmentId: 'department-a' } } });
    database.student.create.mockResolvedValue(record);
    await expect(service.create({ studentCode: 'STU-1', firstName: 'Aarav', lastName: 'Mehta', sectionId: 'section-a' }, admin)).resolves.toEqual(record);
    expect(database.section.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'section-a', collegeId: 'college-a' } }));
  });

  it('rejects HOD cross-department enrollment and faculty/student write escalation', async () => {
    database.section.findFirst.mockResolvedValue({ id: 'section-b', collegeId: 'college-a', semester: { course: { departmentId: 'department-b' } } });
    await expect(service.create({ studentCode: 'STU-2', firstName: 'Nisha', lastName: 'Rao', sectionId: 'section-b' }, hod)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.update('student-a', { firstName: 'New' }, { ...admin, roles: ['FACULTY'] })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets a STUDENT retrieve only its linked profile and blocks another profile', async () => {
    database.student.findFirst.mockResolvedValueOnce(record).mockResolvedValueOnce(null);
    await expect(service.me(student)).resolves.toEqual(record);
    await expect(service.get('student-b', student)).rejects.toMatchObject({ response: expect.objectContaining({ code: 'STUDENT_NOT_FOUND' }) });
    expect(database.student.findFirst).toHaveBeenLastCalledWith(expect.objectContaining({ where: { id: 'student-b', collegeId: 'college-a', userId: 'user-a' } }));
  });
});