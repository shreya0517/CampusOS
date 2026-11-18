import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import type { AuthorizationContext } from '../authorization/authorization.types';
import type { DepartmentDto, DepartmentHodDto, DepartmentUpdateDto } from './departments.dto';

const forbidden = (): never => {
  throw new ForbiddenException({ code: 'FORBIDDEN', message: 'You are not authorized to access this resource.' });
};
const missing = (): never => {
  throw new NotFoundException({ code: 'DEPARTMENT_NOT_FOUND', message: 'Department was not found.' });
};
const conflict = (code: string, message: string): never => {
  throw new ConflictException({ code, message });
};
const isUniqueViolation = (error: unknown): boolean => (error as { code?: string }).code === 'P2002';

type Hod = { facultyId: string; name: string; employeeCode: string; designation: string | null };

@Injectable()
export class DepartmentsService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  private manager(context: AuthorizationContext): void {
    if (!context.roles.includes('ADMIN')) forbidden();
  }

  /** Admin sees every department; HOD and faculty only their own. */
  private scope(context: AuthorizationContext, id?: string): string | undefined {
    if (context.roles.includes('ADMIN')) return id;
    if (!context.departmentId || (id && id !== context.departmentId)) forbidden();
    return context.departmentId as string;
  }

  async create(input: DepartmentDto, context: AuthorizationContext) {
    this.manager(context);
    try {
      return await this.database.department.create({ data: { collegeId: context.collegeId, ...input } });
    } catch (error) {
      if (isUniqueViolation(error)) conflict('DEPARTMENT_EXISTS', 'Department code already exists.');
      throw error;
    }
  }

  /** Departments with their HOD and faculty, student, course and subject counts. */
  async list(query: { search?: string; page: number; pageSize: number }, context: AuthorizationContext) {
    const id = this.scope(context);
    const where = {
      collegeId: context.collegeId,
      ...(id ? { id } : {}),
      ...(query.search ? { OR: [{ name: { contains: query.search, mode: 'insensitive' as const } }, { code: { contains: query.search, mode: 'insensitive' as const } }] } : {}),
    };
    const [departments, total] = await Promise.all([
      this.database.department.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { faculty: { select: { id: true, firstName: true, lastName: true, employeeCode: true } }, _count: { select: { courses: true, subjects: true } } },
      }),
      this.database.department.count({ where }),
    ]);
    const ids = departments.map((department) => department.id);
    const [hods, students] = await Promise.all([this.hodsFor(ids, context.collegeId), this.studentCounts(ids, context.collegeId)]);
    return {
      items: departments.map(({ _count, ...department }) => ({
        ...department,
        hod: hods.get(department.id) ?? null,
        counts: { faculty: department.faculty.length, students: students.get(department.id) ?? 0, courses: _count.courses, subjects: _count.subjects },
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /** One department with its HOD, counts, and its courses and subjects. */
  async get(id: string, context: AuthorizationContext) {
    const scoped = this.scope(context, id);
    const department = await this.database.department.findFirst({
      where: { id: scoped, collegeId: context.collegeId },
      include: {
        faculty: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
        courses: { select: { id: true, code: true, name: true, durationYears: true, _count: { select: { semesters: true } } }, orderBy: { name: 'asc' } },
        subjects: { select: { id: true, code: true, name: true, credits: true, course: { select: { code: true } }, semester: { select: { name: true, number: true } } }, orderBy: [{ semester: { number: 'asc' } }, { code: 'asc' }] },
      },
    });
    if (!department) missing();
    const [hods, students] = await Promise.all([this.hodsFor([department!.id], context.collegeId), this.studentCounts([department!.id], context.collegeId)]);
    return {
      ...department!,
      courses: department!.courses.map(({ _count, ...course }) => ({ ...course, semesters: _count.semesters })),
      hod: hods.get(department!.id) ?? null,
      counts: { faculty: department!.faculty.length, students: students.get(department!.id) ?? 0, courses: department!.courses.length, subjects: department!.subjects.length },
    };
  }

  async update(id: string, input: DepartmentUpdateDto, context: AuthorizationContext) {
    this.manager(context);
    await this.get(id, context);
    try {
      return await this.database.department.update({ where: { collegeId_id: { collegeId: context.collegeId, id } }, data: input });
    } catch (error) {
      if (isUniqueViolation(error)) conflict('DEPARTMENT_EXISTS', 'Department code already exists.');
      throw error;
    }
  }

  /**
   * Admin assigns, changes or removes a department's HOD. The new HOD must be a faculty member of that department with
   * an active sign-in account; anyone else holding the HOD role in the department loses it, so each department has one
   * head. Roles are read on every request, so the change applies at once. Audited.
   */
  async setHod(id: string, input: DepartmentHodDto, context: AuthorizationContext) {
    this.manager(context);
    const department = await this.database.department.findFirst({ where: { id, collegeId: context.collegeId }, select: { id: true } });
    if (!department) missing();

    let newUserId: string | null = null;
    if (input.facultyId) {
      const candidate = await this.database.faculty.findFirst({
        where: { id: input.facultyId, collegeId: context.collegeId },
        select: { id: true, departmentId: true, userId: true, user: { select: { status: true } } },
      });
      if (!candidate) throw new NotFoundException({ code: 'FACULTY_NOT_FOUND', message: 'Faculty was not found.' });
      if (candidate.departmentId !== id) conflict('NOT_IN_DEPARTMENT', 'Only a faculty member of this department can be its HOD.');
      if (!candidate.userId) conflict('NO_ACCOUNT', 'This faculty member needs a sign-in account before becoming HOD.');
      if (candidate.user?.status !== 'ACTIVE') conflict('ACCOUNT_INACTIVE', "This faculty member's account is not active.");
      newUserId = candidate.userId;
    }

    const current = await this.database.faculty.findMany({
      where: { collegeId: context.collegeId, departmentId: id, userId: { not: null }, user: { is: { userRoles: { some: { role: { name: 'HOD' } } } } } },
      select: { id: true, userId: true },
    });
    const removedUserIds = current.map((member) => member.userId as string).filter((userId) => userId !== newUserId);

    await this.database.$transaction(async (tx) => {
      const role = await tx.role.upsert({ where: { collegeId_name: { collegeId: context.collegeId, name: 'HOD' } }, update: {}, create: { collegeId: context.collegeId, name: 'HOD' } });
      if (removedUserIds.length) await tx.userRole.deleteMany({ where: { collegeId: context.collegeId, roleId: role.id, userId: { in: removedUserIds } } });
      if (newUserId) {
        await tx.userRole.upsert({
          where: { collegeId_userId_roleId: { collegeId: context.collegeId, userId: newUserId, roleId: role.id } },
          update: {},
          create: { collegeId: context.collegeId, userId: newUserId, roleId: role.id },
        });
      }
      await tx.auditLog.create({
        data: {
          collegeId: context.collegeId,
          actorId: context.userId,
          action: 'DEPARTMENT_HOD_CHANGED',
          entityType: 'Department',
          entityId: id,
          metadata: { from: current.map((member) => member.id), to: input.facultyId ?? null },
        },
      });
    });
    return this.get(id, context);
  }

  /** The faculty member holding the HOD role in each department (by their faculty profile's department). */
  private async hodsFor(departmentIds: string[], collegeId: string): Promise<Map<string, Hod>> {
    if (!departmentIds.length) return new Map();
    const hods = await this.database.faculty.findMany({
      where: { collegeId, departmentId: { in: departmentIds }, user: { is: { userRoles: { some: { role: { name: 'HOD' } } } } } },
      select: { id: true, firstName: true, lastName: true, employeeCode: true, designation: true, departmentId: true },
      orderBy: { createdAt: 'asc' },
    });
    const byDepartment = new Map<string, Hod>();
    for (const hod of hods) {
      if (hod.departmentId && !byDepartment.has(hod.departmentId)) {
        byDepartment.set(hod.departmentId, { facultyId: hod.id, name: `${hod.firstName} ${hod.lastName}`, employeeCode: hod.employeeCode, designation: hod.designation });
      }
    }
    return byDepartment;
  }

  /** Students with an active enrollment in each department, each counted once. */
  private async studentCounts(departmentIds: string[], collegeId: string): Promise<Map<string, number>> {
    if (!departmentIds.length) return new Map();
    const enrollments = await this.database.enrollment.findMany({
      where: { collegeId, status: 'ACTIVE', section: { semester: { course: { departmentId: { in: departmentIds } } } } },
      select: { studentId: true, section: { select: { semester: { select: { course: { select: { departmentId: true } } } } } } },
    });
    const sets = new Map<string, Set<string>>();
    for (const enrollment of enrollments) {
      const departmentId = enrollment.section.semester.course.departmentId;
      const set = sets.get(departmentId) ?? new Set<string>();
      set.add(enrollment.studentId);
      sets.set(departmentId, set);
    }
    return new Map([...sets].map(([departmentId, set]) => [departmentId, set.size]));
  }
}
