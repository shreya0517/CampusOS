import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EnrollmentStatus, UserStatus } from '@prisma/client';
import { DatabaseService } from '../database.service';
import type { AuthorizationContext } from '../authorization/authorization.types';
import type { AccountStatusDto, CreateStudentDto, EnrollmentDto, StudentAccountDto, StudentListQuery, UpdateMyContactDto, UpdateStudentDto } from './students.dto';
import { accountConflict, createAccountWithRole, generateTemporaryPassword } from '../auth/accounts';

/** The CSV export stops at this many students; filter the list to export more. */
export const STUDENT_EXPORT_LIMIT = 10_000;

const denied = (): ForbiddenException => new ForbiddenException({ code: 'FORBIDDEN', message: 'You are not authorized to access this resource.' });
const missing = (): NotFoundException => new NotFoundException({ code: 'STUDENT_NOT_FOUND', message: 'Student was not found.' });

@Injectable()
export class StudentsService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async create(input: CreateStudentDto, context: AuthorizationContext) {
    // Enrolling new students is an Admin task (HOD decision 1: the spec reserves enrollment changes for Admin).
    if (!context.roles.includes('ADMIN')) throw denied();
    this.assertManager(context);
    const section = await this.sectionForContext(input.sectionId, context);
    // With an email the student's STUDENT sign-in account is created too, and a temporary password returned once.
    const temporaryPassword = input.email ? generateTemporaryPassword() : undefined;
    try {
      const student = await this.database.$transaction(async (tx) => {
        const userId = input.email
          ? await createAccountWithRole(tx, { collegeId: context.collegeId, email: input.email, displayName: `${input.firstName} ${input.lastName}`, roleName: 'STUDENT', temporaryPassword: temporaryPassword as string })
          : null;
        const created = await tx.student.create({
          data: { collegeId: context.collegeId, userId, studentCode: input.studentCode, firstName: input.firstName, lastName: input.lastName, dateOfBirth: input.dateOfBirth, enrollments: { create: { sectionId: section.id } } },
          include: studentAccountInclude,
        });
        if (userId) await tx.auditLog.create({ data: { collegeId: context.collegeId, actorId: context.userId, action: 'STUDENT_ACCOUNT_CREATED', entityType: 'Student', entityId: created.id } });
        return created;
      });
      return { ...this.withAccount(student, context), ...(temporaryPassword ? { temporaryPassword } : {}) };
    } catch (error) { if (isUnique(error)) throw accountConflict(error, { code: 'STUDENT_EXISTS', message: 'Student code already exists.' }); throw error; }
  }

  /** Admin gives a student without a sign-in account one, returning a temporary password once. */
  async createAccount(id: string, input: StudentAccountDto, context: AuthorizationContext) {
    if (!context.roles.includes('ADMIN')) throw denied();
    const student = await this.database.student.findFirst({ where: { id, collegeId: context.collegeId }, select: { id: true, userId: true, firstName: true, lastName: true } });
    if (!student) throw missing();
    if (student.userId) throw new ConflictException({ code: 'ACCOUNT_EXISTS', message: 'This student already has a sign-in account.' });
    const temporaryPassword = generateTemporaryPassword();
    try {
      await this.database.$transaction(async (tx) => {
        const userId = await createAccountWithRole(tx, { collegeId: context.collegeId, email: input.email, displayName: `${student.firstName} ${student.lastName}`, roleName: 'STUDENT', temporaryPassword });
        // Only links if the record still has no account, so two concurrent requests can't both attach one.
        const linked = await tx.student.updateMany({ where: { id, collegeId: context.collegeId, userId: null }, data: { userId } });
        if (linked.count !== 1) throw new ConflictException({ code: 'ACCOUNT_EXISTS', message: 'This student already has a sign-in account.' });
        await tx.auditLog.create({ data: { collegeId: context.collegeId, actorId: context.userId, action: 'STUDENT_ACCOUNT_CREATED', entityType: 'Student', entityId: id } });
      });
    } catch (error) { if (isUnique(error)) throw accountConflict(error, { code: 'ACCOUNT_EXISTS', message: 'This student already has a sign-in account.' }); throw error; }
    return { ...(await this.get(id, context)), temporaryPassword };
  }

  async list(query: StudentListQuery, context: AuthorizationContext) {
    if (context.roles.includes('STUDENT')) throw denied();
    const where = this.listWhere(query, context);
    const [items, total] = await Promise.all([this.database.student.findMany({ where, include: studentAccountInclude, omit: this.contactOmit(context), orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }), this.database.student.count({ where })]);
    return { items: items.map((student) => this.withAccount(student, context)), page: query.page, pageSize: query.pageSize, total };
  }

  /** Every student matching the list filters as CSV, for Admin. Cells that a spreadsheet would run as formulas are neutralised. */
  async exportCsv(query: StudentListQuery, context: AuthorizationContext): Promise<string> {
    if (!context.roles.includes('ADMIN')) throw denied();
    const students = await this.database.student.findMany({ where: this.listWhere(query, context), include: studentAccountInclude, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }], take: STUDENT_EXPORT_LIMIT });
    const header = ['Student code', 'First name', 'Last name', 'Email', 'Department', 'Course', 'Semester', 'Section', 'Enrollment status', 'Account status'];
    const rows = students.map((student) => {
      const enrollment = student.enrollments.find((item) => item.status === EnrollmentStatus.ACTIVE) ?? student.enrollments[0];
      const section = enrollment?.section;
      return [
        student.studentCode,
        student.firstName,
        student.lastName,
        student.user?.email ?? '',
        section?.semester.course.department.name ?? '',
        section?.semester.course.name ?? '',
        section?.semester.name ?? '',
        section?.code ?? '',
        enrollment?.status ?? '',
        student.user?.status ?? 'NO_ACCOUNT',
      ];
    });
    return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
  }

  /** Sections with their semester, course and department, for enrollment forms: all for Admin, the HOD's department for an HOD. */
  async sections(context: AuthorizationContext) {
    const isAdmin = context.roles.includes('ADMIN');
    if (!isAdmin && !context.roles.includes('HOD')) throw denied();
    if (!isAdmin && !context.departmentId) throw denied();
    return this.database.section.findMany({
      where: { collegeId: context.collegeId, ...(isAdmin ? {} : { semester: { course: { departmentId: context.departmentId ?? '' } } }) },
      select: { id: true, code: true, semester: { select: { id: true, name: true, number: true, course: { select: { id: true, code: true, name: true, department: { select: { id: true, code: true, name: true } } } } } } },
      orderBy: [{ semester: { course: { name: 'asc' } } }, { semester: { number: 'asc' } }, { code: 'asc' }],
    });
  }

  /**
   * Admin activates or deactivates a student's sign-in account. Deactivating also ends every session, so the student is
   * signed out at once; both are recorded in the audit log.
   */
  async setAccountStatus(id: string, input: AccountStatusDto, context: AuthorizationContext) {
    if (!context.roles.includes('ADMIN')) throw denied();
    const student = await this.database.student.findFirst({ where: { id, collegeId: context.collegeId }, select: { id: true, userId: true } });
    if (!student) throw missing();
    const userId = student.userId;
    if (!userId) throw new ConflictException({ code: 'NO_ACCOUNT', message: 'This student does not have a sign-in account yet.' });
    await this.database.$transaction(async (tx) => {
      await tx.user.update({ where: { collegeId_id: { collegeId: context.collegeId, id: userId } }, data: { status: input.status } });
      if (input.status !== 'ACTIVE') {
        await tx.authSession.updateMany({ where: { collegeId: context.collegeId, userId, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      await tx.auditLog.create({
        data: { collegeId: context.collegeId, actorId: context.userId, action: input.status === 'ACTIVE' ? 'STUDENT_ACCOUNT_ACTIVATED' : 'STUDENT_ACCOUNT_DEACTIVATED', entityType: 'Student', entityId: student.id },
      });
    });
    return this.get(id, context);
  }

  private listWhere(query: StudentListQuery, context: AuthorizationContext) {
    const departmentId = this.scopedDepartment(context, query.departmentId);
    // Department and course filters are merged into one semester condition; a courseId must never replace the department scope.
    const semesterWhere = { ...(departmentId ? { course: { departmentId } } : {}), ...(query.courseId ? { courseId: query.courseId } : {}) };
    const sectionWhere = { ...(Object.keys(semesterWhere).length ? { semester: semesterWhere } : {}), ...(query.semesterId ? { semesterId: query.semesterId } : {}), ...(query.sectionId ? { id: query.sectionId } : {}), ...this.teachingScope(context) };
    const enrollmentWhere = { ...(Object.keys(sectionWhere).length ? { section: sectionWhere } : {}), ...(this.isFacultyOnly(context) ? { status: EnrollmentStatus.ACTIVE } : {}) };
    // Account status is an Admin and HOD filter; faculty never see account details, so it is ignored for them.
    const accountWhere = this.isFacultyOnly(context) || !query.accountStatus
      ? {}
      : query.accountStatus === 'NO_ACCOUNT'
        ? { userId: null }
        : { user: { is: { status: query.accountStatus === 'ACTIVE' ? UserStatus.ACTIVE : { in: [UserStatus.INACTIVE, UserStatus.SUSPENDED] } } } };
    return { collegeId: context.collegeId, ...(query.search ? { OR: [{ studentCode: { contains: query.search, mode: 'insensitive' as const } }, { firstName: { contains: query.search, mode: 'insensitive' as const } }, { lastName: { contains: query.search, mode: 'insensitive' as const } }] } : {}), ...(Object.keys(enrollmentWhere).length ? { enrollments: { some: enrollmentWhere } } : {}), ...accountWhere };
  }

  /** Admin and HOD see the student's sign-in email and account status as `account`; faculty get academic details only. */
  private withAccount<T extends { user: { email: string; status: UserStatus } | null }>(student: T, context: AuthorizationContext) {
    const { user, ...rest } = student;
    return this.isFacultyOnly(context) ? rest : { ...rest, account: user ? { email: user.email, status: user.status } : null };
  }

  async get(id: string, context: AuthorizationContext) { const student = await this.database.student.findFirst({ where: this.studentWhere(id, context), include: studentAccountInclude, omit: this.contactOmit(context) }); if (!student) throw missing(); return this.withAccount(student, context); }
  async me(context: AuthorizationContext) { if (!context.roles.includes('STUDENT')) throw denied(); const student = await this.database.student.findFirst({ where: { collegeId: context.collegeId, userId: context.userId }, include: myStudentInclude }); if (!student) throw missing(); return student; }
  async update(id: string, input: UpdateStudentDto, context: AuthorizationContext) { this.assertManager(context); await this.get(id, context); const student = await this.database.student.update({ where: { collegeId_id: { collegeId: context.collegeId, id } }, data: input, include: studentAccountInclude }); return this.withAccount(student, context); }
  async enroll(id: string, input: EnrollmentDto, context: AuthorizationContext) { if (!context.roles.includes('ADMIN')) throw denied(); await this.get(id, context); const section = await this.sectionForContext(input.sectionId, context); return this.database.enrollment.upsert({ where: { collegeId_studentId_sectionId: { collegeId: context.collegeId, studentId: id, sectionId: section.id } }, create: { collegeId: context.collegeId, studentId: id, sectionId: section.id, status: input.status ?? EnrollmentStatus.ACTIVE }, update: { status: input.status ?? EnrollmentStatus.ACTIVE }, include: { section: { include: { semester: { include: { course: { include: { department: true } } } } } } } }); }

  /** A student updates only their own phone and address; everything else stays with the college. */
  async updateMyContact(input: UpdateMyContactDto, context: AuthorizationContext) {
    if (!context.roles.includes('STUDENT')) throw denied();
    const student = await this.database.student.findFirst({ where: { collegeId: context.collegeId, userId: context.userId }, select: { id: true } });
    if (!student) throw missing();
    await this.database.student.update({ where: { collegeId_id: { collegeId: context.collegeId, id: student.id } }, data: { phone: input.phone, address: input.address } });
    return this.me(context);
  }

  private isFacultyOnly(context: AuthorizationContext): boolean {
    return context.roles.includes('FACULTY') && !context.roles.includes('HOD') && !context.roles.includes('ADMIN') && !context.roles.includes('SUPER_ADMIN');
  }

  /** Faculty only reach students in sections where they teach a class; being in the same department is not enough. */
  private teachingScope(context: AuthorizationContext) {
    return this.isFacultyOnly(context) ? { classes: { some: { faculty: { userId: context.userId } } } } : {};
  }

  /** Faculty get academic details only; a student's phone and address stay with Admin and HOD. */
  private contactOmit(context: AuthorizationContext) {
    const facultyOnly = context.roles.includes('FACULTY') && !context.roles.includes('ADMIN') && !context.roles.includes('HOD') && !context.roles.includes('SUPER_ADMIN');
    return facultyOnly ? { phone: true, address: true } : undefined;
  }

  private assertManager(context: AuthorizationContext) { if (!context.roles.includes('ADMIN') && !context.roles.includes('HOD')) throw denied(); }
  private scopedDepartment(context: AuthorizationContext, requested?: string) { if (context.roles.includes('HOD') || context.roles.includes('FACULTY')) { if (!context.departmentId || requested && requested !== context.departmentId) throw denied(); return context.departmentId; } return requested; }
  private studentWhere(id: string, context: AuthorizationContext) { if (context.roles.includes('STUDENT')) return { id, collegeId: context.collegeId, userId: context.userId }; if (this.isFacultyOnly(context)) return { id, collegeId: context.collegeId, enrollments: { some: { status: EnrollmentStatus.ACTIVE, section: this.teachingScope(context) } } }; const departmentId = this.scopedDepartment(context); return { id, collegeId: context.collegeId, ...(departmentId ? { enrollments: { some: { section: { semester: { course: { departmentId } } } } } } : {}) }; }
  private async sectionForContext(sectionId: string, context: AuthorizationContext) { const section = await this.database.section.findFirst({ where: { id: sectionId, collegeId: context.collegeId }, include: { semester: { include: { course: { include: { department: true } } } } } }); if (!section) throw denied(); const departmentId = this.scopedDepartment(context); if (departmentId && section.semester.course.departmentId !== departmentId) throw denied(); return section; }
}

const studentInclude = { enrollments: { include: { section: { include: { semester: { include: { course: { include: { department: true } } } } } } } } };
const studentAccountInclude = { ...studentInclude, user: { select: { email: true, status: true } } };

/** Quotes every cell, and prefixes values a spreadsheet would treat as a formula so they open as plain text. */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

const myStudentInclude = {
  ...studentInclude,
  college: { select: { name: true, code: true } },
  user: { select: { email: true, status: true, emailVerifiedAt: true } },
};
const isUnique = (error: unknown): boolean => typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2002';