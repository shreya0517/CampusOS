import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EnrollmentStatus } from '@prisma/client';
import { DatabaseService } from '../database.service';
import type { AuthorizationContext } from '../authorization/authorization.types';
import type { CreateStudentDto, EnrollmentDto, StudentListQuery, UpdateStudentDto } from './students.dto';

const denied = (): ForbiddenException => new ForbiddenException({ code: 'FORBIDDEN', message: 'You are not authorized to access this resource.' });
const missing = (): NotFoundException => new NotFoundException({ code: 'STUDENT_NOT_FOUND', message: 'Student was not found.' });

@Injectable()
export class StudentsService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async create(input: CreateStudentDto, context: AuthorizationContext) {
    this.assertManager(context);
    const section = await this.sectionForContext(input.sectionId, context);
    try {
      return await this.database.student.create({ data: { collegeId: context.collegeId, studentCode: input.studentCode, firstName: input.firstName, lastName: input.lastName, dateOfBirth: input.dateOfBirth, enrollments: { create: { sectionId: section.id } } }, include: studentInclude });
    } catch (error) { if (isUnique(error)) throw new ConflictException({ code: 'STUDENT_EXISTS', message: 'Student code already exists.' }); throw error; }
  }

  async list(query: StudentListQuery, context: AuthorizationContext) {
    if (context.roles.includes('STUDENT')) throw denied();
    const departmentId = this.scopedDepartment(context, query.departmentId);
    const sectionWhere = { ...(departmentId ? { semester: { course: { departmentId } } } : {}), ...(query.courseId ? { semester: { courseId: query.courseId } } : {}), ...(query.semesterId ? { semesterId: query.semesterId } : {}), ...(query.sectionId ? { id: query.sectionId } : {}) };
    const where = { collegeId: context.collegeId, ...(query.search ? { OR: [{ studentCode: { contains: query.search, mode: 'insensitive' as const } }, { firstName: { contains: query.search, mode: 'insensitive' as const } }, { lastName: { contains: query.search, mode: 'insensitive' as const } }] } : {}), ...(Object.keys(sectionWhere).length ? { enrollments: { some: { section: sectionWhere } } } : {}) };
    const [items, total] = await Promise.all([this.database.student.findMany({ where, include: studentInclude, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }), this.database.student.count({ where })]);
    return { items, page: query.page, pageSize: query.pageSize, total };
  }

  async get(id: string, context: AuthorizationContext) { const student = await this.database.student.findFirst({ where: this.studentWhere(id, context), include: studentInclude }); if (!student) throw missing(); return student; }
  async me(context: AuthorizationContext) { if (!context.roles.includes('STUDENT')) throw denied(); const student = await this.database.student.findFirst({ where: { collegeId: context.collegeId, userId: context.userId }, include: studentInclude }); if (!student) throw missing(); return student; }
  async update(id: string, input: UpdateStudentDto, context: AuthorizationContext) { this.assertManager(context); await this.get(id, context); return this.database.student.update({ where: { collegeId_id: { collegeId: context.collegeId, id } }, data: input, include: studentInclude }); }
  async enroll(id: string, input: EnrollmentDto, context: AuthorizationContext) { this.assertManager(context); await this.get(id, context); const section = await this.sectionForContext(input.sectionId, context); return this.database.enrollment.upsert({ where: { collegeId_studentId_sectionId: { collegeId: context.collegeId, studentId: id, sectionId: section.id } }, create: { collegeId: context.collegeId, studentId: id, sectionId: section.id, status: input.status ?? EnrollmentStatus.ACTIVE }, update: { status: input.status ?? EnrollmentStatus.ACTIVE }, include: { section: { include: { semester: { include: { course: true } } } } } }); }

  private assertManager(context: AuthorizationContext) { if (!context.roles.includes('ADMIN') && !context.roles.includes('HOD')) throw denied(); }
  private scopedDepartment(context: AuthorizationContext, requested?: string) { if (context.roles.includes('HOD') || context.roles.includes('FACULTY')) { if (!context.departmentId || requested && requested !== context.departmentId) throw denied(); return context.departmentId; } return requested; }
  private studentWhere(id: string, context: AuthorizationContext) { if (context.roles.includes('STUDENT')) return { id, collegeId: context.collegeId, userId: context.userId }; const departmentId = this.scopedDepartment(context); return { id, collegeId: context.collegeId, ...(departmentId ? { enrollments: { some: { section: { semester: { course: { departmentId } } } } } } : {}) }; }
  private async sectionForContext(sectionId: string, context: AuthorizationContext) { const section = await this.database.section.findFirst({ where: { id: sectionId, collegeId: context.collegeId }, include: { semester: { include: { course: true } } } }); if (!section) throw denied(); const departmentId = this.scopedDepartment(context); if (departmentId && section.semester.course.departmentId !== departmentId) throw denied(); return section; }
}

const studentInclude = { enrollments: { include: { section: { include: { semester: { include: { course: true } } } } } } };
const isUnique = (error: unknown): boolean => typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2002';