import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
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
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  private isAdmin(context: AuthorizationContext): boolean {
    return context.roles.includes('ADMIN');
  }

  private isHod(context: AuthorizationContext): boolean {
    return context.roles.includes('HOD');
  }

  async registerVisitor(input: CreateVisitorDto, context: AuthorizationContext): Promise<unknown> {
    return this.database.visitor.create({
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
  }

  async listVisitors(query: VisitorListQuery, context: AuthorizationContext): Promise<unknown> {
    const where: Record<string, unknown> = { collegeId: context.collegeId };

    if (query.status) where.status = query.status;

    if (this.isAdmin(context)) {
      // sees all
    } else if (this.isHod(context)) {
      // HOD sees visitors registered by members of their department context
      // Scoped to registeredByUserId within their department; use department context
      if (context.departmentId) {
        where.registeredBy = {
          faculty: { departmentId: context.departmentId, collegeId: context.collegeId },
        };
      } else {
        where.registeredByUserId = context.userId;
      }
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
    const visitor = await this.database.visitor.findFirst({
      where: { id, collegeId: context.collegeId },
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

    const visitor = await this.database.visitor.findFirst({
      where: { id, collegeId: context.collegeId },
    });
    if (!visitor) visitorMissing();

    const newStatus = input.decision === 'APPROVED' ? VisitorStatus.APPROVED : VisitorStatus.REJECTED;

    return this.database.visitor.update({
      where: { id },
      data: {
        status: newStatus,
        approvedByUserId: context.userId,
        approvedAt: new Date(),
      },
      include: visitorInclude,
    });
  }

  async myVisitors(context: AuthorizationContext): Promise<unknown> {
    return this.database.visitor.findMany({
      where: { collegeId: context.collegeId, registeredByUserId: context.userId },
      include: visitorInclude,
      orderBy: [{ visitDate: 'desc' }, { createdAt: 'desc' }],
    });
  }
}
