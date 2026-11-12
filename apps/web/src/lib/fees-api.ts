import { authenticatedRequest } from './api-client';

export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'VOID' | 'OVERDUE';

export type FeeStructure = {
  id: string;
  name: string;
  amount: string | number;
  currency: string;
  activeFrom: string;
  activeUntil?: string | null;
  course?: { id: string; name: string; code: string } | null;
  semester?: { id: string; name: string } | null;
};

export type Invoice = {
  id: string;
  studentId: string;
  invoiceNumber: string;
  amountDue: string | number;
  status: InvoiceStatus;
  issuedAt?: string | null;
  dueOn?: string | null;
  student?: {
    id: string;
    studentCode: string;
    firstName: string;
    lastName: string;
  } | null;
  feeStructure?: FeeStructure | null;
  payments?: Array<{
    id: string;
    amount: string | number;
    status: string;
    transactionRef?: string | null;
    receipt?: {
      id: string;
      receiptNumber: string;
      issuedAt: string;
    } | null;
  }>;
};

export type Receipt = {
  id: string;
  receiptNumber: string;
  issuedAt: string;
  payment?: {
    id: string;
    amount: string | number;
    invoice?: Invoice | null;
  } | null;
};

export type InvoiceListResponse = {
  items: Invoice[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type RazorpayOrderResponse = {
  paymentId: string;
  razorpayOrderId: string;
  amount: number;
  currency: string;
  keyId: string;
  invoiceNumber: string;
};

export async function listFeeStructures(): Promise<FeeStructure[]> {
  return authenticatedRequest<FeeStructure[]>('/fees/structures');
}

export async function createFeeStructure(input: {
  name: string;
  amount: number;
  activeFrom: string;
  activeUntil?: string;
  courseId?: string;
  semesterId?: string;
}): Promise<FeeStructure> {
  return authenticatedRequest<FeeStructure>('/fees/structures', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function listInvoices(params?: URLSearchParams): Promise<InvoiceListResponse> {
  const query = params ? `?${params.toString()}` : '';
  return authenticatedRequest<InvoiceListResponse>(`/fees/invoices${query}`);
}

export async function getMyInvoices(): Promise<Invoice[]> {
  return authenticatedRequest<Invoice[]>('/fees/invoices/me');
}

export async function createInvoice(input: {
  studentId: string;
  feeStructureId?: string;
  amountDue: number;
  dueOn?: string;
}): Promise<Invoice> {
  return authenticatedRequest<Invoice>('/fees/invoices', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function createRazorpayOrder(invoiceId: string): Promise<RazorpayOrderResponse> {
  return authenticatedRequest<RazorpayOrderResponse>(`/fees/invoices/${invoiceId}/create-razorpay-order`, {
    method: 'POST',
  });
}

export async function verifyRazorpayPayment(input: {
  paymentId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): Promise<{ success: boolean; receipt?: Receipt }> {
  return authenticatedRequest<{ success: boolean; receipt?: Receipt }>('/fees/payments/verify-razorpay', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function getReceipts(): Promise<Receipt[]> {
  return authenticatedRequest<Receipt[]>('/fees/receipts');
}
