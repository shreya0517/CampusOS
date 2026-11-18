import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service';
import { VisitorStatus } from '@prisma/client';
import { DatabaseService } from '../database.service';
import type { AuthorizationContext } from '../authorization/authorization.types';
import type { CreateVisitorDto, ReviewVisitorDto, VisitorListQuery } from './visitors.dto';

const denied = (): never => {
  throw new ForbiddenException({ code: 'FORBIDDEN', message: 'You are not authorized to access this resource.' });
};
const visitorMissing = (): never => {
  throw new NotFoundException({ code: 'VISITOR_NOT_FOUND', message: 'Visitor record was not found.' });
};

const visitorInclude = {
  host: { select: { id: true, displayName: true, email: true } },
  registeredBy: { select: { id: true, displayName: true, email: true } },
  approvedBy: { select: { id: true, displayName: true, email: true } },
};

@Injectable()
export class VisitorsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Optional() @Inject(NotificationsService) private readonly notifications?: NotificationsService,
  ) {}

  private isAdmin(context: AuthorizationContext): boolean {
    return context.roles.includes('ADMIN');
  }

  private isHod(context: AuthorizationContext): boolean {
    return context.roles.includes('HOD');
  }

  /** An HOD's visitors: hosted by someone in their department, or, when nobody is named as host, registered by someone in it. */
  private hodScope(context: AuthorizationContext) {
    if (!context.departmentId) denied();
    const inDepartment = { facultyProfiles: { some: { departmentId: context.departmentId ?? '' } } };
    return { OR: [{ host: inDepartment }, { hostUserId: null, registeredBy: inDepartment }] };
  }

  async registerVisitor(input: CreateVisitorDto, context: AuthorizationContext): Promise<unknown> {
    const visitor = await this.database.visitor.create({
      data: {
        collegeId: context.collegeId,
        name: input.name,
        phone: input.phone,
        email: input.email,
        purpose: input.purpose,
        hostUserId: input.hostUserId,
        visitDate: input.visitDate,
        registeredByUserId: context.userId,
        status: VisitorStatus.PENDING,
      },
      include: visitorInclude,
    });
    // Approvers: every Admin, and the HOD of the host's department (or the registrant's, when no host is named).
    if (this.notifications) {
      const departmentUser = input.hostUserId ?? context.userId;
      const profile = await this.database.faculty.findFirst({ where: { collegeId: context.collegeId, userId: departmentUser }, select: { departmentId: true } });
      const [admins, hods] = await Promise.all([this.notifications.usersWithRoles(context.collegeId, ['ADMIN']), this.notifications.hodsOf(context.collegeId, profile?.departmentId)]);
      await this.notifications.notify(context.collegeId, [...admins, ...hods].filter((id) => id !== context.userId), {
        category: 'VISITOR',
        title: `Visitor approval requested: ${input.name}`,
        body: `${input.purpose} · ${input.visitDate.toISOString().slice(0, 10)}`,
        link: '/dashboard/visitors',
      });
    }
    return visitor;
  }

  async listVisitors(query: VisitorListQuery, context: AuthorizationContext): Promise<unknown> {
    const where: Record<string, unknown> = { collegeId: context.collegeId };

    if (query.status) where.status = query.status;

    if (this.isAdmin(context)) {
      // sees all
    } else if (this.isHod(context)) {
      Object.assign(where, this.hodScope(context));
    } else {
      denied();
    }

    const [items, total] = await Promise.all([
      this.database.visitor.findMany({
        where,
        include: visitorInclude,
        orderBy: [{ visitDate: 'desc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.database.visitor.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async getVisitor(id: string, context: AuthorizationContext): Promise<unknown> {
    const hodOnly = this.isHod(context) && !this.isAdmin(context);
    const visitor = await this.database.visitor.findFirst({
      where: { id, collegeId: context.collegeId, ...(hodOnly ? this.hodScope(context) : {}) },
      include: visitorInclude,
    });
    if (!visitor) visitorMissing();

    // Non-admin, non-HOD can only see their own registrations
    if (!this.isAdmin(context) && !this.isHod(context)) {
      if (visitor!.registeredByUserId !== context.userId) denied();
    }

    return visitor;
  }

  async reviewVisitor(id: string, input: ReviewVisitorDto, context: AuthorizationContext): Promise<unknown> {
    if (!this.isAdmin(context) && !this.isHod(context)) denied();

    // An HOD can only review visitors for their own department, and a decision can't be changed afterwards.
    const hodOnly = this.isHod(context) && !this.isAdmin(context);
    const visitor = await this.database.visitor.findFirst({
      where: { id, collegeId: context.collegeId, ...(hodOnly ? this.hodScope(context) : {}) },
    });
    if (!visitor) visitorMissing();
    if (visitor!.status !== VisitorStatus.PENDING) {
      throw new ConflictException({ code: 'VISITOR_ALREADY_REVIEWED', message: 'This visitor request has already been reviewed.' });
    }

    const newStatus = input.decision === 'APPROVED' ? VisitorStatus.APPROVED : VisitorStatus.REJECTED;

    // Only a still-pending request is updated, so if two reviewers decide at once the second one gets a conflict.
    const decided = await this.database.visitor.updateMany({
      where: { id, collegeId: context.collegeId, status: VisitorStatus.PENDING },
      data: { status: newStatus, approvedByUserId: context.userId, approvedAt: new Date() },
    });
    if (decided.count !== 1) {
      throw new ConflictException({ code: 'VISITOR_ALREADY_REVIEWED', message: 'This visitor request has already been reviewed.' });
    }
    await this.notifications?.notify(context.collegeId, [visitor!.registeredByUserId].filter((id) => id !== context.userId), {
      category: 'VISITOR',
      title: `Visitor ${newStatus === VisitorStatus.APPROVED ? 'approved' : 'rejected'}: ${visitor!.name}`,
      body: `Your visitor request for ${visitor!.visitDate.toISOString().slice(0, 10)} was ${newStatus === VisitorStatus.APPROVED ? 'approved' : 'rejected'}.`,
      link: '/dashboard/visitors',
    });
    return this.database.visitor.findFirst({ where: { id, collegeId: context.collegeId }, include: visitorInclude });
  }

  async myVisitors(context: AuthorizationContext): Promise<unknown> {
    return this.database.visitor.findMany({
      where: { collegeId: context.collegeId, registeredByUserId: context.userId },
      include: visitorInclude,
      orderBy: [{ visitDate: 'desc' }, { createdAt: 'desc' }],
    });
  }
}
