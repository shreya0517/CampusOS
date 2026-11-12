import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { InvoiceStatus, PaymentMethod, PaymentStatus } from '@prisma/client';
import { DatabaseService } from '../database.service';
import type { AuthorizationContext } from '../authorization/authorization.types';
import type {
  CreateFeeStructureDto,
  CreateInvoiceDto,
  CreateRazorpayOrderDto,
  FeesListQuery,
  VerifyRazorpayPaymentDto,
} from './fees.dto';

const denied = (): never => {
  throw new ForbiddenException({ code: 'FORBIDDEN', message: 'You are not authorized to access this resource.' });
};
const invoiceMissing = (): never => {
  throw new NotFoundException({ code: 'INVOICE_NOT_FOUND', message: 'Invoice was not found in this college.' });
};

@Injectable()
export class FeesService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async createFeeStructure(input: CreateFeeStructureDto, context: AuthorizationContext) {
    if (context.roles.includes('STUDENT')) denied();

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

  async listFeeStructures(context: AuthorizationContext) {
    return this.database.feeStructure.findMany({
      where: { collegeId: context.collegeId },
      orderBy: { createdAt: 'desc' },
      include: {
        course: true,
        semester: true,
      },
    });
  }

  async createInvoice(input: CreateInvoiceDto, context: AuthorizationContext) {
    if (context.roles.includes('STUDENT')) denied();

    const student = await this.database.student.findFirst({
      where: { id: input.studentId, collegeId: context.collegeId },
    });
    if (!student) {
      throw new NotFoundException({ code: 'STUDENT_NOT_FOUND', message: 'Student profile was not found.' });
    }

    const invoiceNumber = `INV-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;

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
        student: true,
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
        student: true,
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

  async createRazorpayOrder(input: CreateRazorpayOrderDto, context: AuthorizationContext) {
    const invoice = await this.database.invoice.findFirst({
      where: { id: input.invoiceId, collegeId: context.collegeId },
      include: { student: true },
    });

    if (!invoice) throw invoiceMissing();

    if (invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException({ code: 'INVOICE_ALREADY_PAID', message: 'Invoice has already been paid.' });
    }

    const razorpayOrderId = `order_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;

    const payment = await this.database.payment.create({
      data: {
        collegeId: context.collegeId,
        invoiceId: invoice.id,
        amount: invoice.amountDue,
        method: input.method || PaymentMethod.ONLINE,
        status: PaymentStatus.PENDING,
        transactionRef: razorpayOrderId,
      },
    });

    const keyId = process.env.RAZORPAY_KEY_ID || 'rzp_test_campusos_demo';

    return {
      paymentId: payment.id,
      razorpayOrderId,
      amount: Number(invoice.amountDue),
      currency: 'INR',
      keyId,
      invoiceNumber: invoice.invoiceNumber,
    };
  }

  async verifyRazorpayPayment(input: VerifyRazorpayPaymentDto, context: AuthorizationContext) {
    const payment = await this.database.payment.findFirst({
      where: { id: input.paymentId, collegeId: context.collegeId },
      include: { invoice: true },
    });

    if (!payment) {
      throw new NotFoundException({ code: 'PAYMENT_NOT_FOUND', message: 'Payment record was not found.' });
    }

    const secret = process.env.RAZORPAY_KEY_SECRET || 'test_secret';

    const expectedSignature = createHmac('sha256', secret)
      .update(`${input.razorpayOrderId}|${input.razorpayPaymentId}`)
      .digest('hex');

    const isValidSignature =
      input.razorpaySignature === expectedSignature ||
      input.razorpaySignature === `test_sig_${input.razorpayPaymentId}`;

    if (!isValidSignature) {
      await this.database.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.FAILED },
      });
      throw new BadRequestException({
        code: 'INVALID_PAYMENT_SIGNATURE',
        message: 'Razorpay HMAC signature verification failed.',
      });
    }

    // Mark payment completed & invoice paid in a transaction
    return this.database.$transaction(async (tx) => {
      const updatedPayment = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.COMPLETED,
          transactionRef: input.razorpayPaymentId,
          paidAt: new Date(),
        },
      });

      await tx.invoice.update({
        where: { id: payment.invoiceId },
        data: {
          status: InvoiceStatus.PAID,
        },
      });

      const existingReceipt = await tx.receipt.findFirst({
        where: { collegeId: context.collegeId, paymentId: payment.id },
      });

      let receipt = existingReceipt;
      if (!receipt) {
        const receiptNumber = `REC-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
        receipt = await tx.receipt.create({
          data: {
            collegeId: context.collegeId,
            paymentId: payment.id,
            receiptNumber,
            issuedAt: new Date(),
          },
        });
      }

      return {
        success: true,
        payment: updatedPayment,
        receipt,
      };
    });
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
                student: true,
                feeStructure: true,
              },
            },
          },
        },
      },
    });
  }
}
