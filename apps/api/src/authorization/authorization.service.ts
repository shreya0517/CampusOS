import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database.service';
import type { PublicUser } from '../auth/auth.service';
import type { AuthorizationContext, Permission, RoleName } from './authorization.types';
import { PERMISSIONS, ROLE_NAMES } from './authorization.types';

@Injectable()
export class AuthorizationService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async getContext(user: PublicUser): Promise<AuthorizationContext> {
    const [assignments, faculty] = await Promise.all([
      this.database.userRole.findMany({ where: { collegeId: user.collegeId, userId: user.id }, include: { role: { include: { rolePermissions: { include: { permission: true } } } } } }),
      this.database.faculty.findUnique({ where: { collegeId_userId: { collegeId: user.collegeId, userId: user.id } }, select: { departmentId: true } }),
    ]);
    const roles = assignments.map((assignment) => assignment.role.name).filter(isRole);
    const permissions = assignments.flatMap((assignment) => assignment.role.rolePermissions.map((mapping) => mapping.permission.code)).filter(isPermission);
    return { userId: user.id, collegeId: user.collegeId, roles: [...new Set(roles)], permissions: [...new Set(permissions)], departmentId: faculty?.departmentId ?? null };
  }

  assertTenant(context: AuthorizationContext, collegeId: string): void {
    if (context.collegeId !== collegeId && !context.roles.includes('SUPER_ADMIN')) throw forbidden();
  }

  assertDepartment(context: AuthorizationContext, collegeId: string, departmentId: string): void {
    this.assertTenant(context, collegeId);
    if (!context.roles.includes('SUPER_ADMIN') && !context.roles.includes('ADMIN') && context.departmentId !== departmentId) throw forbidden();
  }

  async findDepartmentProbe(context: AuthorizationContext, requestedCollegeId: string, departmentId: string): Promise<{ id: string; collegeId: string }> {
    this.assertTenant(context, requestedCollegeId);
    this.assertDepartment(context, requestedCollegeId, departmentId);
    const department = await this.database.department.findFirst({
      where: { id: departmentId, collegeId: context.roles.includes('SUPER_ADMIN') ? requestedCollegeId : context.collegeId },
      select: { id: true, collegeId: true },
    });
    if (!department) throw forbidden();
    return department;
  }
}

const forbidden = (): ForbiddenException => new ForbiddenException({ code: 'FORBIDDEN', message: 'You are not authorized to access this resource.' });
const isRole = (value: string): value is RoleName => (ROLE_NAMES as readonly string[]).includes(value);
const isPermission = (value: string): value is Permission => (PERMISSIONS as readonly string[]).includes(value);
