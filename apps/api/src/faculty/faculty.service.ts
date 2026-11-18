import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { UserStatus } from '@prisma/client';
import { DatabaseService } from '../database.service';
import { accountConflict, createAccountWithRole, generateTemporaryPassword } from '../auth/accounts';
import type { AuthorizationContext } from '../authorization/authorization.types';
import type { FacultyAccountDto, FacultyAccountStatusDto, FacultyDto, FacultyUpdateDto } from './faculty.dto';

const forbidden = (): never => {
  throw new ForbiddenException({ code: 'FORBIDDEN', message: 'You are not authorized to access this resource.' });
};
const missing = (): never => {
  throw new NotFoundException({ code: 'FACULTY_NOT_FOUND', message: 'Faculty was not found.' });
};
const isUniqueViolation = (error: unknown): boolean => (error as { code?: string }).code === 'P2002';


const userSelect = { select: { email: true, status: true, userRoles: { select: { role: { select: { name: true } } } } } } as const;
const facultyInclude = { department: true, user: userSelect, _count: { select: { classes: true } } } as const;

type FacultyRow = {
  user: { email: string; status: UserStatus; userRoles: { role: { name: string } }[] } | null;
  _count: { classes: number };
};

@Injectable()
export class FacultyService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  private write(c: AuthorizationContext): void {
    if (!c.roles.includes('ADMIN')) forbidden();
  }

  /** Admin may target any department; everyone else is held to their own. */
  private department(c: AuthorizationContext, requested?: string | null): string | null | undefined {
    if (c.roles.includes('ADMIN')) return requested;
    if (!c.departmentId || (requested !== undefined && requested !== null && requested !== c.departmentId)) forbidden();
    return c.departmentId;
  }

  private async validDepartment(id: string | undefined | null, c: AuthorizationContext): Promise<string | null> {
    if (!id) return null;
    const department = await this.database.department.findFirst({ where: { id, collegeId: c.collegeId } });
    if (!department) forbidden();
    this.department(c, department!.id);
    return department!.id;
  }

  /**
   * Shapes a row for the caller: `isHod` and `classCount` for everyone; the sign-in `account` (email and status) only
   * for Admin and HOD, as with students.
   */
  private present<T extends FacultyRow>(row: T, c: AuthorizationContext) {
    const { user, _count, ...rest } = row;
    const isHod = Boolean(user?.userRoles.some((assignment) => assignment.role.name === 'HOD'));
    const seesAccounts = c.roles.includes('ADMIN') || c.roles.includes('HOD');
    return { ...rest, isHod, classCount: _count.classes, ...(seesAccounts ? { account: user ? { email: user.email, status: user.status } : null } : {}) };
  }

  async getMe(c: AuthorizationContext) {
    const item = await this.database.faculty.findUnique({ where: { collegeId_userId: { collegeId: c.collegeId, userId: c.userId } }, include: { department: true } });
    if (!item) missing();
    return item;
  }

  /** Admin adds a faculty member; with an email it also creates their FACULTY sign-in account and returns a temporary password once. */
  async create(input: FacultyDto, c: AuthorizationContext) {
    this.write(c);
    const departmentId = await this.validDepartment(input.departmentId ?? this.department(c), c);
    const temporaryPassword = input.email ? generateTemporaryPassword() : undefined;
    try {
      const faculty = await this.database.$transaction(async (tx) => {
        const userId = input.email
          ? await createAccountWithRole(tx, { collegeId: c.collegeId, email: input.email, displayName: `${input.firstName} ${input.lastName}`, roleName: 'FACULTY', temporaryPassword: temporaryPassword as string })
          : null;
        const created = await tx.faculty.create({
          data: { collegeId: c.collegeId, employeeCode: input.employeeCode, firstName: input.firstName, lastName: input.lastName, designation: input.designation ?? null, departmentId, userId },
          include: facultyInclude,
        });
        if (userId) await tx.auditLog.create({ data: { collegeId: c.collegeId, actorId: c.userId, action: 'FACULTY_ACCOUNT_CREATED', entityType: 'Faculty', entityId: created.id } });
        return created;
      });
      return { ...this.present(faculty, c), ...(temporaryPassword ? { temporaryPassword } : {}) };
    } catch (error) {
      if (isUniqueViolation(error)) throw accountConflict(error, { code: 'FACULTY_EXISTS', message: 'Employee code already exists.' });
      throw error;
    }
  }

  /** Gives an existing faculty member without a sign-in account one, returning a temporary password once. Admin only. */
  async createAccount(id: string, input: FacultyAccountDto, c: AuthorizationContext) {
    this.write(c);
    const faculty = await this.database.faculty.findFirst({ where: { id, collegeId: c.collegeId }, select: { id: true, userId: true, firstName: true, lastName: true } });
    if (!faculty) missing();
    if (faculty!.userId) throw new ConflictException({ code: 'ACCOUNT_EXISTS', message: 'This faculty member already has a sign-in account.' });
    const temporaryPassword = generateTemporaryPassword();
    try {
      await this.database.$transaction(async (tx) => {
        const userId = await createAccountWithRole(tx, { collegeId: c.collegeId, email: input.email, displayName: `${faculty!.firstName} ${faculty!.lastName}`, roleName: 'FACULTY', temporaryPassword });
        // Only links if the record still has no account, so two concurrent requests can't both attach one.
        const linked = await tx.faculty.updateMany({ where: { id, collegeId: c.collegeId, userId: null }, data: { userId } });
        if (linked.count !== 1) throw new ConflictException({ code: 'ACCOUNT_EXISTS', message: 'This faculty member already has a sign-in account.' });
        await tx.auditLog.create({ data: { collegeId: c.collegeId, actorId: c.userId, action: 'FACULTY_ACCOUNT_CREATED', entityType: 'Faculty', entityId: id } });
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw accountConflict(error, { code: 'FACULTY_EXISTS', message: 'Employee code already exists.' });
      throw error;
    }
    return { ...(await this.get(id, c)), temporaryPassword };
  }

  /** Admin activates or deactivates a faculty member's account; deactivating ends all of their sessions. Audited. */
  async setAccountStatus(id: string, input: FacultyAccountStatusDto, c: AuthorizationContext) {
    this.write(c);
    const faculty = await this.database.faculty.findFirst({ where: { id, collegeId: c.collegeId }, select: { id: true, userId: true } });
    if (!faculty) missing();
    const userId = faculty!.userId;
    if (!userId) throw new ConflictException({ code: 'NO_ACCOUNT', message: 'This faculty member does not have a sign-in account yet.' });
    if (userId === c.userId) throw new ConflictException({ code: 'OWN_ACCOUNT', message: 'You cannot change the status of your own account.' });
    await this.database.$transaction(async (tx) => {
      await tx.user.update({ where: { collegeId_id: { collegeId: c.collegeId, id: userId } }, data: { status: input.status } });
      if (input.status !== 'ACTIVE') await tx.authSession.updateMany({ where: { collegeId: c.collegeId, userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.auditLog.create({
        data: { collegeId: c.collegeId, actorId: c.userId, action: input.status === 'ACTIVE' ? 'FACULTY_ACCOUNT_ACTIVATED' : 'FACULTY_ACCOUNT_DEACTIVATED', entityType: 'Faculty', entityId: id },
      });
    });
    return this.get(id, c);
  }

  async list(q: { search?: string; departmentId?: string; page: number; pageSize: number }, c: AuthorizationContext) {
    const departmentId = this.department(c, q.departmentId);
    const where = {
      collegeId: c.collegeId,
      ...(departmentId ? { departmentId } : {}),
      ...(q.search
        ? {
            OR: [
              { firstName: { contains: q.search, mode: 'insensitive' as const } },
              { lastName: { contains: q.search, mode: 'insensitive' as const } },
              { employeeCode: { contains: q.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.database.faculty.findMany({ where, include: facultyInclude, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
      this.database.faculty.count({ where }),
    ]);
    return { items: items.map((item) => this.present(item, c)), total, page: q.page, pageSize: q.pageSize };
  }

  /** One faculty member with the classes they teach. */
  async get(id: string, c: AuthorizationContext) {
    const departmentId = this.department(c);
    const item = await this.database.faculty.findFirst({
      where: { id, collegeId: c.collegeId, ...(departmentId ? { departmentId } : {}) },
      include: {
        ...facultyInclude,
        classes: {
          select: {
            id: true,
            status: true,
            subject: { select: { id: true, code: true, name: true } },
            section: { select: { id: true, code: true, semester: { select: { name: true, course: { select: { code: true, name: true } } } } } },
          },
          orderBy: { subject: { name: 'asc' } },
        },
      },
    });
    if (!item) missing();
    return this.present(item!, c);
  }

  async update(id: string, input: FacultyUpdateDto, c: AuthorizationContext) {
    this.write(c);
    const before = await this.get(id, c);
    const departmentId = input.departmentId === undefined ? undefined : await this.validDepartment(input.departmentId, c);
    // An HOD heads the department of their faculty profile; moving them elsewhere ends that, so the HOD role goes too.
    const leavesAsHod = before.isHod && departmentId !== undefined && departmentId !== before.departmentId && Boolean(before.userId);
    try {
      await this.database.$transaction(async (tx) => {
        await tx.faculty.update({ where: { collegeId_id: { collegeId: c.collegeId, id } }, data: { ...input, departmentId } });
        if (leavesAsHod) {
          await tx.userRole.deleteMany({ where: { collegeId: c.collegeId, userId: before.userId as string, role: { name: 'HOD' } } });
          await tx.auditLog.create({ data: { collegeId: c.collegeId, actorId: c.userId, action: 'DEPARTMENT_HOD_CHANGED', entityType: 'Department', entityId: before.departmentId as string, metadata: { from: [id], to: null, reason: 'HOD moved to another department' } } });
        }
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException({ code: 'FACULTY_EXISTS', message: 'Employee code already exists.' });
      throw error;
    }
    return this.get(id, c);
  }
}
