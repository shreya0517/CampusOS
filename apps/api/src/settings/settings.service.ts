import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { DatabaseService } from '../database.service';
import type { AuthorizationContext } from '../authorization/authorization.types';
import type { InstitutionSettingsDto } from './settings.dto';

/** The settings an Admin edits. The code is shown but fixed: everyone in the college signs in with it. */
const SETTINGS_SELECT = {
  code: true,
  name: true,
  timezone: true,
  address: true,
  phone: true,
  email: true,
  website: true,
  attendanceThreshold: true,
  correctionWindowHours: true,
  updatedAt: true,
} satisfies Prisma.CollegeSelect;

const EDITABLE = ['name', 'timezone', 'address', 'phone', 'email', 'website', 'attendanceThreshold', 'correctionWindowHours'] as const;
type Editable = (typeof EDITABLE)[number];

export const SETTINGS_UPDATED = 'SETTINGS_UPDATED';

const denied = (): never => { throw new ForbiddenException({ code: 'FORBIDDEN', message: 'You are not authorized to access this resource.' }); };
const missing = (): never => { throw new NotFoundException({ code: 'COLLEGE_NOT_FOUND', message: 'College was not found.' }); };
const changed = (): never => {
  throw new ConflictException({ code: 'SETTINGS_CHANGED', message: 'Someone else changed these settings after you opened them. Reload to see the latest before saving.' });
};

@Injectable()
export class SettingsService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  /** The college profile and rules, with who changed them last. */
  async getInstitution(context: AuthorizationContext) {
    if (!context.roles.includes('ADMIN')) denied();
    const [college, last] = await Promise.all([
      this.database.college.findUnique({ where: { id: context.collegeId }, select: SETTINGS_SELECT }),
      this.database.auditLog.findFirst({
        where: { collegeId: context.collegeId, action: SETTINGS_UPDATED, entityType: 'College', entityId: context.collegeId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, actor: { select: { displayName: true } } },
      }),
    ]);
    if (!college) missing();
    return { ...college!, lastChange: last ? { at: last.createdAt, by: last.actor?.displayName ?? null } : null };
  }

  /**
   * Saves the whole form. Only applies if nobody saved since the Admin read the settings (409 otherwise), and records
   * each changed field with its old and new value in the audit log. Saving with nothing changed writes nothing.
   */
  async updateInstitution(input: InstitutionSettingsDto, context: AuthorizationContext) {
    if (!context.roles.includes('ADMIN')) denied();
    const current = await this.database.college.findUnique({ where: { id: context.collegeId }, select: SETTINGS_SELECT });
    if (!current) missing();
    if (current!.updatedAt.getTime() !== input.updatedAt.getTime()) changed();

    const changes: Partial<Record<Editable, { from: string | number | null; to: string | number | null }>> = {};
    for (const field of EDITABLE) if (current![field] !== input[field]) changes[field] = { from: current![field], to: input[field] };
    if (Object.keys(changes).length === 0) return this.getInstitution(context);

    const data = Object.fromEntries(EDITABLE.map((field) => [field, input[field]])) as Pick<InstitutionSettingsDto, Editable>;
    await this.database.$transaction(async (tx) => {
      const written = await tx.college.updateMany({ where: { id: context.collegeId, updatedAt: current!.updatedAt }, data });
      if (written.count !== 1) changed();
      await tx.auditLog.create({
        data: { collegeId: context.collegeId, actorId: context.userId, action: SETTINGS_UPDATED, entityType: 'College', entityId: context.collegeId, metadata: { changes } },
      });
    });
    return this.getInstitution(context);
  }
}
