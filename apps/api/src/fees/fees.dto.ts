import { BadRequestException } from '@nestjs/common';
import { InvoiceStatus, PaymentMethod } from '@prisma/client';

/** Bad input is the client's mistake: a 400 with the reason, not a plain Error that surfaced as a 500. */
function invalid(message: string): never {
  throw new BadRequestException({ code: 'INVALID_INPUT', message });
}

/** Methods Razorpay can take online. Cash and bank transfers are paid at the accounts office, not through an order. */
export const ONLINE_METHODS: PaymentMethod[] = [PaymentMethod.ONLINE, PaymentMethod.UPI, PaymentMethod.CARD];

export type CreateFeeStructureDto = {
  name: string;
  amount: number;
  currency?: string;
  activeFrom: string;
  activeUntil?: string;
  courseId?: string;
  semesterId?: string;
};

export type CreateInvoiceDto = {
  studentId: string;
  feeStructureId?: string;
  amountDue: number;
  dueOn?: string;
};

export type CreateRazorpayOrderDto = {
  invoiceId: string;
  method?: PaymentMethod;
};

export type VerifyRazorpayPaymentDto = {
  paymentId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
};

export type FeesListQuery = {
  page: number;
  pageSize: number;
  status?: InvoiceStatus;
  studentId?: string;
};

export function parseCreateFeeStructureDto(body: unknown): CreateFeeStructureDto {
  const b = (body ?? {}) as Record<string, unknown>;

  if (typeof b.name !== 'string' || !b.name.trim()) {
    invalid('Fee structure name is required');
  }

  const amount = Number(b.amount);
  if (isNaN(amount) || amount <= 0) {
    invalid('amount must be a positive number');
  }

  if (typeof b.activeFrom !== 'string' || isNaN(Date.parse(b.activeFrom))) {
    invalid('Valid activeFrom date is required');
  }

  let activeUntil: string | undefined;
  if (typeof b.activeUntil === 'string' && !isNaN(Date.parse(b.activeUntil))) {
    activeUntil = b.activeUntil;
  }

  return {
    name: b.name.trim(),
    amount,
    currency: typeof b.currency === 'string' && b.currency.trim() ? b.currency.trim().toUpperCase() : 'INR',
    activeFrom: b.activeFrom,
    activeUntil,
    courseId: typeof b.courseId === 'string' && b.courseId.trim() ? b.courseId.trim() : undefined,
    semesterId: typeof b.semesterId === 'string' && b.semesterId.trim() ? b.semesterId.trim() : undefined,
  };
}

export function parseCreateInvoiceDto(body: unknown): CreateInvoiceDto {
  const b = (body ?? {}) as Record<string, unknown>;

  if (typeof b.studentId !== 'string' || !b.studentId.trim()) {
    invalid('studentId is required');
  }

  const amountDue = Number(b.amountDue);
  if (isNaN(amountDue) || amountDue <= 0) {
    invalid('amountDue must be a positive number');
  }

  let dueOn: string | undefined;
  if (typeof b.dueOn === 'string' && !isNaN(Date.parse(b.dueOn))) {
    dueOn = b.dueOn;
  }

  return {
    studentId: b.studentId.trim(),
    feeStructureId: typeof b.feeStructureId === 'string' && b.feeStructureId.trim() ? b.feeStructureId.trim() : undefined,
    amountDue,
    dueOn,
  };
}

export function parseCreateRazorpayOrderDto(body: unknown): CreateRazorpayOrderDto {
  const b = (body ?? {}) as Record<string, unknown>;

  if (typeof b.invoiceId !== 'string' || !b.invoiceId.trim()) {
    invalid('invoiceId is required');
  }

  let method: PaymentMethod = PaymentMethod.ONLINE;
  if (b.method !== undefined && b.method !== null && b.method !== '') {
    const m = typeof b.method === 'string' ? b.method.toUpperCase() : '';
    if (!ONLINE_METHODS.includes(m as PaymentMethod)) invalid('An online payment must use ONLINE, UPI or CARD.');
    method = m as PaymentMethod;
  }

  return {
    invoiceId: b.invoiceId.trim(),
    method,
  };
}

export function parseVerifyRazorpayPaymentDto(body: unknown): VerifyRazorpayPaymentDto {
  const b = (body ?? {}) as Record<string, unknown>;

  if (typeof b.paymentId !== 'string' || !b.paymentId.trim()) {
    invalid('paymentId is required');
  }
  if (typeof b.razorpayOrderId !== 'string' || !b.razorpayOrderId.trim()) {
    invalid('razorpayOrderId is required');
  }
  if (typeof b.razorpayPaymentId !== 'string' || !b.razorpayPaymentId.trim()) {
    invalid('razorpayPaymentId is required');
  }
  if (typeof b.razorpaySignature !== 'string' || !b.razorpaySignature.trim()) {
    invalid('razorpaySignature is required');
  }

  return {
    paymentId: b.paymentId.trim(),
    razorpayOrderId: b.razorpayOrderId.trim(),
    razorpayPaymentId: b.razorpayPaymentId.trim(),
    razorpaySignature: b.razorpaySignature.trim(),
  };
}

export function parseFeesListQuery(query: unknown): FeesListQuery {
  const q = (query ?? {}) as Record<string, unknown>;
  const page = q.page ? Number(q.page) : 1;
  const pageSize = q.pageSize ? Number(q.pageSize) : 20;

  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    invalid('Invalid pagination parameters');
  }

  let status: InvoiceStatus | undefined;
  if (typeof q.status === 'string') {
    const s = q.status.toUpperCase();
    if (Object.values(InvoiceStatus).includes(s as InvoiceStatus)) {
      status = s as InvoiceStatus;
    }
  }

  return {
    page,
    pageSize,
    status,
    studentId: typeof q.studentId === 'string' && q.studentId.trim() ? q.studentId.trim() : undefined,
  };
}
