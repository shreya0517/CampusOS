import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createHmac, randomBytes } from 'crypto';
import { InvoiceStatus, PaymentMethod, PaymentStatus } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { DatabaseService } from '../database.service';
import type { AuthorizationContext } from '../authorization/authorization.types';
import type {
  CreateFeeStructureDto,
  CreateInvoiceDto,
  CreateRazorpayOrderDto,
  FeesListQuery,
  VerifyRazorpayPaymentDto,
} from './fees.dto';

/** Students in exam and fee responses carry only identity fields, never contact details. */
const STUDENT_SUMMARY = { select: { id: true, studentCode: true, firstName: true, lastName: true } };

const denied = (): never => {
  throw new ForbiddenException({ code: 'FORBIDDEN', message: 'You are not authorized to access this resource.' });
};
const invoiceMissing = (): never => {
  throw new NotFoundException({ code: 'INVOICE_NOT_FOUND', message: 'Invoice was not found in this college.' });
};

/** Invoices a student can pay online: issued and not yet fully paid. Draft invoices aren't issued yet; void ones are cancelled. */
const PAYABLE: InvoiceStatus[] = [InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE];

/**
 * A document number such as INV-2026-3FA9C1B2D4. Ten random hex characters make a clash practically impossible, so
 * the unique constraint on invoice and receipt numbers never turns a payment into a 500 (six random digits could).
 */
const documentNumber = (prefix: 'INV' | 'REC'): string => `${prefix}-${new Date().getFullYear()}-${randomBytes(5).toString('hex').toUpperCase()}`;

const isUniqueViolation = (error: unknown): boolean => typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2002';

const notPending = (): never => {
  throw new ConflictException({ code: 'PAYMENT_NOT_PENDING', message: 'This payment has already been processed.' });
};

/** What has been paid on an invoice so far: its completed payments. */
const paidSoFar = async (client: Pick<Prisma.TransactionClient, 'payment'>, collegeId: string, invoiceId: string): Promise<number> => {
  const paid = await client.payment.aggregate({ where: { collegeId, invoiceId, status: PaymentStatus.COMPLETED }, _sum: { amount: true } });
  return Number(paid._sum.amount ?? 0);
};

/** Without a Razorpay secret, outside production, payments run in a test mode that accepts simulated signatures. */
const paymentsInTestMode = (): boolean => process.env.NODE_ENV !== 'production' && !process.env.RAZORPAY_KEY_SECRET;

/** In production, online payments need real Razorpay keys; otherwise refuse instead of accepting unverifiable payments. */
const assertPaymentsAvailable = (): void => {
  if (process.env.NODE_ENV === 'production' && (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET)) {
    throw new ServiceUnavailableException({ code: 'PAYMENTS_NOT_CONFIGURED', message: 'Online payments are not set up yet. Please pay at the accounts office.' });
  }
};

@Injectable()
export class FeesService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async createFeeStructure(input: CreateFeeStructureDto, context: AuthorizationContext) {
    if (!context.roles.includes('ADMIN')) denied();

    try {
      return await this.database.feeStructure.create({
        data: {
          collegeId: context.collegeId,
          name: input.name,
          amount: input.amount,
          currency: input.currency || 'INR',
          activeFrom: new Date(input.activeFrom),
          activeUntil: input.activeUntil ? new Date(input.activeUntil) : null,
          courseId: input.courseId || null,
          semesterId: input.semesterId || null,
        },
        include: {
          course: true,
          semester: true,
        },
      });
    } catch (e) {
      if (typeof e === 'object' && e !== null && 'code' in e && (e as { code: string }).code === 'P2002') {
        throw new ConflictException({
          code: 'FEE_STRUCTURE_EXISTS',
          message: 'A fee structure with this name and active date already exists.',
        });
      }
      throw e;
    }
  }

  /**
   * Students only see fee structures that apply to them: college-wide ones, or ones for the course
   * and semester they are actively enrolled in. Staff see every structure in the college.
   */
  private async studentFeeStructureScope(context: AuthorizationContext) {
    const isStaff = context.roles.some((role) => role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'HOD' || role === 'FACULTY');
    if (isStaff || !context.roles.includes('STUDENT')) return {};
    const student = await this.database.student.findFirst({
      where: { collegeId: context.collegeId, userId: context.userId },
      select: { enrollments: { where: { status: 'ACTIVE' }, select: { section: { select: { semesterId: true, semester: { select: { courseId: true } } } } } } },
    });
    const placements = (student?.enrollments ?? []).map((enrollment) => ({ courseId: enrollment.section.semester.courseId, semesterId: enrollment.section.semesterId }));
    return {
      OR: [
        { courseId: null, semesterId: null },
        ...placements.map(({ courseId, semesterId }) => ({
          AND: [{ OR: [{ courseId: null }, { courseId }] }, { OR: [{ semesterId: null }, { semesterId }] }],
        })),
      ],
    };
  }

  async listFeeStructures(context: AuthorizationContext) {
    return this.database.feeStructure.findMany({
      where: { collegeId: context.collegeId, ...(await this.studentFeeStructureScope(context)) },
      orderBy: { createdAt: 'desc' },
      include: {
        course: true,
        semester: true,
      },
    });
  }

  async createInvoice(input: CreateInvoiceDto, context: AuthorizationContext) {
    if (!context.roles.includes('ADMIN')) denied();

    const student = await this.database.student.findFirst({
      where: { id: input.studentId, collegeId: context.collegeId },
    });
    if (!student) {
      throw new NotFoundException({ code: 'STUDENT_NOT_FOUND', message: 'Student profile was not found.' });
    }

    const invoiceNumber = documentNumber('INV');

    return this.database.invoice.create({
      data: {
        collegeId: context.collegeId,
        studentId: input.studentId,
        feeStructureId: input.feeStructureId || null,
        invoiceNumber,
        amountDue: input.amountDue,
        status: InvoiceStatus.ISSUED,
        issuedAt: new Date(),
        dueOn: input.dueOn ? new Date(input.dueOn) : null,
      },
      include: {
        student: STUDENT_SUMMARY,
        feeStructure: true,
      },
    });
  }

  async listInvoices(query: FeesListQuery, context: AuthorizationContext) {
    const where: Record<string, unknown> = { collegeId: context.collegeId };

    if (context.roles.includes('STUDENT')) {
      const student = await this.database.student.findFirst({
        where: { collegeId: context.collegeId, userId: context.userId },
      });
      if (!student) {
        return { items: [], total: 0, page: query.page, pageSize: query.pageSize, totalPages: 1 };
      }
      where.studentId = student.id;
    } else if (query.studentId) {
      where.studentId = query.studentId;
    }

    if (query.status) {
      where.status = query.status;
    }

    const total = await this.database.invoice.count({ where });
    const items = await this.database.invoice.findMany({
      where,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        student: STUDENT_SUMMARY,
        feeStructure: true,
        payments: {
          include: {
            receipt: true,
          },
        },
      },
    });

    return {
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize) || 1,
    };
  }

  async getMyInvoices(context: AuthorizationContext) {
    const student = await this.database.student.findFirst({
      where: { collegeId: context.collegeId, userId: context.userId },
    });

    if (!student) {
      return [];
    }

    return this.database.invoice.findMany({
      where: {
        collegeId: context.collegeId,
        studentId: student.id,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        feeStructure: true,
        payments: {
          include: {
            receipt: true,
          },
        },
      },
    });
  }

  /**
   * Whether the web app can take an online payment right now. There is no Razorpay Checkout step in the web app yet,
   * so the only payment it can complete is the simulated one in test mode; it checks this before creating an order.
   */
  getPaymentMode(): { testMode: boolean; onlinePaymentsAvailable: boolean } {
    const testMode = paymentsInTestMode();
    return { testMode, onlinePaymentsAvailable: testMode };
  }

  /** The signed-in student's own profile id; payments are only ever made against their own invoices. */
  private async ownStudentId(context: AuthorizationContext): Promise<string> {
    if (!context.roles.includes('STUDENT')) denied();
    const student = await this.database.student.findFirst({ where: { collegeId: context.collegeId, userId: context.userId }, select: { id: true } });
    if (!student) throw new NotFoundException({ code: 'STUDENT_NOT_FOUND', message: 'Student profile was not found.' });
    return student.id;
  }

  async createRazorpayOrder(input: CreateRazorpayOrderDto, context: AuthorizationContext) {
    assertPaymentsAvailable();
    const invoice = await this.database.invoice.findFirst({
      where: { id: input.invoiceId, collegeId: context.collegeId, studentId: await this.ownStudentId(context) },
      include: { student: STUDENT_SUMMARY },
    });

    if (!invoice) throw invoiceMissing();

    if (invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException({ code: 'INVOICE_ALREADY_PAID', message: 'Invoice has already been paid.' });
    }
    if (!PAYABLE.includes(invoice.status)) {
      throw new ConflictException({
        code: 'INVOICE_NOT_PAYABLE',
        message: invoice.status === InvoiceStatus.VOID ? 'This invoice was cancelled and cannot be paid.' : 'This invoice has not been issued yet.',
      });
    }
    const { payment, balance } = await this.database.$transaction(async (tx) => {
      // Lock the invoice, so orders for it are made one at a time.
      await tx.invoice.updateMany({ where: { id: invoice.id, collegeId: context.collegeId }, data: { updatedAt: new Date() } });
      // The order is for what is still owed, so an earlier part-payment is never charged again.
      const owed = Number(invoice.amountDue) - (await paidSoFar(tx, context.collegeId, invoice.id));
      if (owed <= 0) {
        throw new BadRequestException({ code: 'INVOICE_ALREADY_PAID', message: 'Invoice has already been paid.' });
      }

      // One open order per invoice: a second tab or a retry gets the same order, so the balance can't be charged twice.
      const open = await tx.payment.findFirst({
        where: { collegeId: context.collegeId, invoiceId: invoice.id, status: PaymentStatus.PENDING },
        orderBy: { createdAt: 'desc' },
      });
      const reuse = open && Number(open.amount) === owed ? open : null;
      // Any other open order is closed: one for a different amount is out of date, because the balance has changed.
      await tx.payment.updateMany({
        where: { collegeId: context.collegeId, invoiceId: invoice.id, status: PaymentStatus.PENDING, ...(reuse ? { id: { not: reuse.id } } : {}) },
        data: { status: PaymentStatus.FAILED },
      });
      if (reuse) return { payment: reuse, balance: owed };

      const created = await tx.payment.create({
        data: {
          collegeId: context.collegeId,
          invoiceId: invoice.id,
          amount: owed,
          method: input.method ?? PaymentMethod.ONLINE,
          status: PaymentStatus.PENDING,
          transactionRef: `order_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`,
        },
      });
      return { payment: created, balance: owed };
    }, { timeout: 30_000 });

    const keyId = process.env.RAZORPAY_KEY_ID || 'rzp_test_campusos_demo';

    return {
      paymentId: payment.id,
      razorpayOrderId: payment.transactionRef,
      amount: balance,
      currency: 'INR',
      keyId,
      invoiceNumber: invoice.invoiceNumber,
      // Tells the web app it may complete a simulated payment; never true in production.
      testMode: paymentsInTestMode(),
    };
  }

  async verifyRazorpayPayment(input: VerifyRazorpayPaymentDto, context: AuthorizationContext) {
    assertPaymentsAvailable();
    const payment = await this.database.payment.findFirst({
      where: { id: input.paymentId, collegeId: context.collegeId, invoice: { studentId: await this.ownStudentId(context) } },
      include: { invoice: true },
    });

    if (!payment) {
      throw new NotFoundException({ code: 'PAYMENT_NOT_FOUND', message: 'Payment record was not found.' });
    }
    // Only a pending payment is settled: a completed or failed one can't be flipped by verifying it again.
    if (payment.status !== PaymentStatus.PENDING) notPending();
    // The signature covers the order, so it must be the order this payment was created for.
    if (input.razorpayOrderId !== payment.transactionRef) {
      throw new BadRequestException({ code: 'ORDER_MISMATCH', message: 'This payment was not made for that order.' });
    }

    // A real Razorpay signature is checked against the configured secret. The simulated test signature is only
    // accepted in test mode (outside production, with no secret configured).
    const secret = process.env.RAZORPAY_KEY_SECRET;
    const expectedSignature = secret
      ? createHmac('sha256', secret).update(`${payment.transactionRef}|${input.razorpayPaymentId}`).digest('hex')
      : null;

    const isValidSignature =
      (expectedSignature !== null && input.razorpaySignature === expectedSignature) ||
      (paymentsInTestMode() && input.razorpaySignature === `test_sig_${input.razorpayPaymentId}`);

    if (!isValidSignature) {
      await this.database.payment.updateMany({
        where: { id: payment.id, collegeId: context.collegeId, status: PaymentStatus.PENDING },
        data: { status: PaymentStatus.FAILED },
      });
      throw new BadRequestException({
        code: 'INVALID_PAYMENT_SIGNATURE',
        message: 'Razorpay HMAC signature verification failed.',
      });
    }

    const now = new Date();
    return this.settle(payment, input.razorpayPaymentId, now, context).catch((error: unknown) => {
      // A Razorpay payment id is unique per college, so one payment can never be counted against two orders.
      if (isUniqueViolation(error)) throw new ConflictException({ code: 'PAYMENT_ALREADY_RECORDED', message: 'This Razorpay payment has already been recorded.' });
      throw error;
    });
  }

  /** Completes a pending payment, updates its invoice and issues the receipt, all in one transaction. */
  private settle(payment: { id: string; invoiceId: string; invoice: { amountDue: Prisma.Decimal | number } }, razorpayPaymentId: string, now: Date, context: AuthorizationContext) {
    return this.database.$transaction(async (tx) => {
      // Settle it only if it is still pending, so two verifications of one payment can't both complete it.
      const settled = await tx.payment.updateMany({
        where: { id: payment.id, collegeId: context.collegeId, status: PaymentStatus.PENDING },
        data: { status: PaymentStatus.COMPLETED, transactionRef: razorpayPaymentId, paidAt: now },
      });
      if (settled.count !== 1) notPending();

      // Lock the invoice before adding up its payments, so two payments settling together see each other.
      await tx.invoice.updateMany({ where: { id: payment.invoiceId, collegeId: context.collegeId }, data: { updatedAt: now } });
      const paid = await paidSoFar(tx, context.collegeId, payment.invoiceId);
      await tx.invoice.update({
        where: { id: payment.invoiceId },
        data: { status: paid >= Number(payment.invoice.amountDue) ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID },
      });

      const receipt = await tx.receipt.create({
        data: { collegeId: context.collegeId, paymentId: payment.id, receiptNumber: documentNumber('REC'), issuedAt: now },
      });
      const updatedPayment = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });

      return {
        success: true,
        payment: updatedPayment,
        receipt,
      };
    }, { timeout: 30_000 });
  }

  async getReceipts(context: AuthorizationContext) {
    const where: Record<string, unknown> = { collegeId: context.collegeId };

    if (context.roles.includes('STUDENT')) {
      const student = await this.database.student.findFirst({
        where: { collegeId: context.collegeId, userId: context.userId },
      });
      if (!student) return [];

      where.payment = {
        invoice: {
          studentId: student.id,
        },
      };
    }

    return this.database.receipt.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        payment: {
          include: {
            invoice: {
              include: {
                student: STUDENT_SUMMARY,
                feeStructure: true,
              },
            },
          },
        },
      },
    });
  }
}
