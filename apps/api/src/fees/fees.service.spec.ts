import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InvoiceStatus, PaymentStatus } from '@prisma/client';
import { FeesService } from './fees.service';
import type { AuthorizationContext } from '../authorization/authorization.types';
import type { DatabaseService } from '../database.service';
import {
  parseCreateFeeStructureDto,
  parseCreateInvoiceDto,
  parseVerifyRazorpayPaymentDto,
} from './fees.dto';

const admin: AuthorizationContext = { userId: 'admin-1', collegeId: 'col-a', roles: ['ADMIN'], permissions: [], departmentId: null };
const studentContext: AuthorizationContext = { userId: 'stu-user', collegeId: 'col-a', roles: ['STUDENT'], permissions: [], departmentId: null };

describe('FeesService', () => {
  const mockTransaction = jest.fn();
  const database = {
    feeStructure: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    invoice: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    payment: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    receipt: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    student: {
      findFirst: jest.fn(),
    },
    $transaction: mockTransaction,
  };

  let service: FeesService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockTransaction.mockImplementation((fn: (tx: typeof database) => Promise<unknown>) => fn(database));
    service = new FeesService(database as unknown as DatabaseService);
  });

  describe('createFeeStructure', () => {
    it('throws ForbiddenException for student', async () => {
      const dto = parseCreateFeeStructureDto({ name: 'Tuition Fee', amount: 50000, activeFrom: '2026-01-01' });
      await expect(service.createFeeStructure(dto, studentContext)).rejects.toThrow(ForbiddenException);
    });

    it('creates fee structure for admin', async () => {
      database.feeStructure.create.mockResolvedValue({ id: 'fs-1', name: 'Tuition Fee', amount: 50000 });
      const dto = parseCreateFeeStructureDto({ name: 'Tuition Fee', amount: 50000, activeFrom: '2026-01-01' });
      const result = await service.createFeeStructure(dto, admin);

      expect(result).toHaveProperty('id', 'fs-1');
      expect(database.feeStructure.create).toHaveBeenCalled();
    });
  });

  describe('createInvoice', () => {
    it('throws NotFoundException if student not found', async () => {
      database.student.findFirst.mockResolvedValue(null);
      const dto = parseCreateInvoiceDto({ studentId: 'stu-99', amountDue: 25000 });
      await expect(service.createInvoice(dto, admin)).rejects.toThrow(NotFoundException);
    });

    it('creates invoice for student', async () => {
      database.student.findFirst.mockResolvedValue({ id: 'stu-1' });
      database.invoice.create.mockResolvedValue({
        id: 'inv-1',
        invoiceNumber: 'INV-2026-1001',
        amountDue: 25000,
        status: InvoiceStatus.ISSUED,
      });

      const dto = parseCreateInvoiceDto({ studentId: 'stu-1', amountDue: 25000 });
      const result = await service.createInvoice(dto, admin);

      expect(result).toHaveProperty('id', 'inv-1');
      expect(result.status).toBe(InvoiceStatus.ISSUED);
    });
  });

  describe('createRazorpayOrder', () => {
    it('throws BadRequestException if invoice is already paid', async () => {
      database.invoice.findFirst.mockResolvedValue({
        id: 'inv-1',
        collegeId: 'col-a',
        status: InvoiceStatus.PAID,
        amountDue: 25000,
      });

      await expect(service.createRazorpayOrder({ invoiceId: 'inv-1' }, studentContext)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('creates pending payment and razorpay order payload', async () => {
      database.invoice.findFirst.mockResolvedValue({
        id: 'inv-1',
        collegeId: 'col-a',
        status: InvoiceStatus.ISSUED,
        amountDue: 25000,
        invoiceNumber: 'INV-2026-1001',
      });
      database.payment.create.mockResolvedValue({
        id: 'pay-1',
        collegeId: 'col-a',
        invoiceId: 'inv-1',
        amount: 25000,
        status: PaymentStatus.PENDING,
      });

      const result = await service.createRazorpayOrder({ invoiceId: 'inv-1' }, studentContext);

      expect(result).toHaveProperty('paymentId', 'pay-1');
      expect(result).toHaveProperty('razorpayOrderId');
      expect(result.amount).toBe(25000);
    });
  });

  describe('verifyRazorpayPayment', () => {
    it('throws BadRequestException on invalid HMAC signature', async () => {
      database.payment.findFirst.mockResolvedValue({
        id: 'pay-1',
        collegeId: 'col-a',
        invoiceId: 'inv-1',
        amount: 25000,
        status: PaymentStatus.PENDING,
      });

      const dto = parseVerifyRazorpayPaymentDto({
        paymentId: 'pay-1',
        razorpayOrderId: 'order_123',
        razorpayPaymentId: 'pay_rzp_123',
        razorpaySignature: 'invalid_sig',
      });

      await expect(service.verifyRazorpayPayment(dto, studentContext)).rejects.toThrow(BadRequestException);
      expect(database.payment.update).toHaveBeenCalledWith({
        where: { id: 'pay-1' },
        data: { status: PaymentStatus.FAILED },
      });
    });

    it('settles payment and generates receipt on valid test signature', async () => {
      database.payment.findFirst.mockResolvedValue({
        id: 'pay-1',
        collegeId: 'col-a',
        invoiceId: 'inv-1',
        amount: 25000,
        status: PaymentStatus.PENDING,
      });
      database.payment.update.mockResolvedValue({
        id: 'pay-1',
        status: PaymentStatus.COMPLETED,
      });
      database.invoice.update.mockResolvedValue({
        id: 'inv-1',
        status: InvoiceStatus.PAID,
      });
      database.receipt.findFirst.mockResolvedValue(null);
      database.receipt.create.mockResolvedValue({
        id: 'rec-1',
        receiptNumber: 'REC-2026-1001',
      });

      const dto = parseVerifyRazorpayPaymentDto({
        paymentId: 'pay-1',
        razorpayOrderId: 'order_123',
        razorpayPaymentId: 'pay_rzp_123',
        razorpaySignature: 'test_sig_pay_rzp_123',
      });

      const result = await service.verifyRazorpayPayment(dto, studentContext);

      expect(result.success).toBe(true);
      expect(result.receipt).toHaveProperty('id', 'rec-1');
    });
  });
});
