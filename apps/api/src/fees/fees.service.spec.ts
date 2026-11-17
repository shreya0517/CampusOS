import { createHmac } from 'node:crypto';
import { BadRequestException, ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
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
    beforeEach(() => database.student.findFirst.mockResolvedValue({ id: 'stu-1' }));

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
    beforeEach(() => database.student.findFirst.mockResolvedValue({ id: 'stu-1' }));

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

describe('FeesService fee structure visibility', () => {
  const database = { feeStructure: { findMany: jest.fn().mockResolvedValue([]) }, student: { findFirst: jest.fn() } };
  const service = new FeesService(database as unknown as DatabaseService);
  const structureWhere = (): unknown => (database.feeStructure.findMany.mock.calls.at(-1)?.[0] as { where: unknown }).where;

  beforeEach(() => jest.clearAllMocks());

  it('shows students only college-wide structures and the ones for their course and semester', async () => {
    database.student.findFirst.mockResolvedValue({ enrollments: [{ section: { semesterId: 'sem-1', semester: { courseId: 'course-1' } } }] });
    await service.listFeeStructures(studentContext);
    expect(structureWhere()).toEqual({
      collegeId: 'col-a',
      OR: [
        { courseId: null, semesterId: null },
        { AND: [{ OR: [{ courseId: null }, { courseId: 'course-1' }] }, { OR: [{ semesterId: null }, { semesterId: 'sem-1' }] }] },
      ],
    });
  });

  it('shows a student without enrollments only college-wide structures', async () => {
    database.student.findFirst.mockResolvedValue(null);
    await service.listFeeStructures(studentContext);
    expect(structureWhere()).toEqual({ collegeId: 'col-a', OR: [{ courseId: null, semesterId: null }] });
  });

  it('shows staff every structure in the college', async () => {
    await service.listFeeStructures(admin);
    expect(structureWhere()).toEqual({ collegeId: 'col-a' });
    expect(database.student.findFirst).not.toHaveBeenCalled();
  });
});

describe('FeesService access and payment checks', () => {
  const hod: AuthorizationContext = { userId: 'hod-1', collegeId: 'col-a', roles: ['HOD'], permissions: [], departmentId: 'dept-a' };
  const database = {
    student: { findFirst: jest.fn().mockResolvedValue({ id: 'stu-1' }) },
    invoice: { findFirst: jest.fn(), update: jest.fn() },
    payment: { create: jest.fn().mockResolvedValue({ id: 'pay-1' }), findFirst: jest.fn(), update: jest.fn() },
    receipt: { findFirst: jest.fn(), create: jest.fn() },
    feeStructure: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  database.$transaction.mockImplementation((fn: (tx: typeof database) => Promise<unknown>) => fn(database));
  const service = new FeesService(database as unknown as DatabaseService);
  const env = { ...process.env };
  const dto = (signature: string) => parseVerifyRazorpayPaymentDto({ paymentId: 'pay-1', razorpayOrderId: 'order_1', razorpayPaymentId: 'pay_rzp_1', razorpaySignature: signature });

  beforeEach(() => jest.clearAllMocks());
  afterEach(() => {
    process.env = { ...env };
  });

  it('only creates orders for the student\'s own invoice', async () => {
    database.invoice.findFirst.mockResolvedValue(null);
    await expect(service.createRazorpayOrder({ invoiceId: 'someone-elses' }, studentContext)).rejects.toBeInstanceOf(NotFoundException);
    expect(database.invoice.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'someone-elses', collegeId: 'col-a', studentId: 'stu-1' } }));
    expect(database.payment.create).not.toHaveBeenCalled();
  });

  it('only verifies payments on the student\'s own invoices', async () => {
    database.payment.findFirst.mockResolvedValue(null);
    await expect(service.verifyRazorpayPayment(dto('test_sig_pay_rzp_1'), studentContext)).rejects.toBeInstanceOf(NotFoundException);
    expect(database.payment.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'pay-1', collegeId: 'col-a', invoice: { studentId: 'stu-1' } } }));
  });

  it('rejects the simulated signature once a real secret is configured, and accepts the real one', async () => {
    process.env.RAZORPAY_KEY_SECRET = 'real-secret';
    database.payment.findFirst.mockResolvedValue({ id: 'pay-1', invoiceId: 'inv-1', amount: 100, status: PaymentStatus.PENDING });
    await expect(service.verifyRazorpayPayment(dto('test_sig_pay_rzp_1'), studentContext)).rejects.toBeInstanceOf(BadRequestException);
    const real = createHmac('sha256', 'real-secret').update('order_1|pay_rzp_1').digest('hex');
    database.receipt.findFirst.mockResolvedValue(null);
    database.receipt.create.mockResolvedValue({ id: 'rec-1' });
    await expect(service.verifyRazorpayPayment(dto(real), studentContext)).resolves.toMatchObject({ success: true });
  });

  it('refuses online payments in production without Razorpay keys', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    await expect(service.createRazorpayOrder({ invoiceId: 'inv-1' }, studentContext)).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(service.verifyRazorpayPayment(dto('test_sig_pay_rzp_1'), studentContext)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(database.payment.findFirst).not.toHaveBeenCalled();
  });

  it('marks orders as test mode only outside production without a secret', async () => {
    database.invoice.findFirst.mockResolvedValue({ id: 'inv-1', status: InvoiceStatus.ISSUED, amountDue: 100, invoiceNumber: 'INV-1' });
    await expect(service.createRazorpayOrder({ invoiceId: 'inv-1' }, studentContext)).resolves.toMatchObject({ testMode: true });
    process.env.RAZORPAY_KEY_SECRET = 'real-secret';
    await expect(service.createRazorpayOrder({ invoiceId: 'inv-1' }, studentContext)).resolves.toMatchObject({ testMode: false });
  });

  it('leaves fee structures and invoices to admins', async () => {
    await expect(service.createFeeStructure(parseCreateFeeStructureDto({ name: 'Tuition', amount: 1000, activeFrom: '2026-07-01' }), hod)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.createInvoice(parseCreateInvoiceDto({ studentId: 'stu-1', amountDue: 1000 }), hod)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('FeesService payment mode', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it('reports online payments as available only in test mode', () => {
    const service = new FeesService({} as unknown as DatabaseService);
    delete process.env.RAZORPAY_KEY_SECRET;
    expect(service.getPaymentMode()).toEqual({ testMode: true, onlinePaymentsAvailable: true });
    process.env.RAZORPAY_KEY_SECRET = 'real-secret';
    expect(service.getPaymentMode()).toEqual({ testMode: false, onlinePaymentsAvailable: false });
  });
});
