'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { EmptyState, ErrorState, Skeleton } from '@/components/feedback/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  createRazorpayOrder,
  getMyInvoices,
  getPaymentMode,
  getReceipts,
  listFeeStructures,
  listInvoices,
  verifyRazorpayPayment,
} from '@/lib/fees-api';
import type {
  FeeStructure,
  Invoice,
  InvoiceStatus,
  Receipt,
} from '@/lib/fees-api';

const STATUS_COLORS: Record<InvoiceStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200 border-gray-300',
  ISSUED: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200 border-amber-300',
  PARTIALLY_PAID: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200 border-blue-300',
  PAID: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200 border-green-300',
  VOID: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200 border-red-300',
  OVERDUE: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200 border-rose-300',
};

export default function FeesPage() {
  const { primaryRole } = useAuth();
  const isStaff = primaryRole === 'Admin' || primaryRole === 'HOD';
  const isStudent = primaryRole === 'Student';

  const [activeTab, setActiveTab] = useState<'invoices' | 'structures' | 'receipts'>('invoices');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [structures, setStructures] = useState<FeeStructure[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [payingInvoice, setPayingInvoice] = useState<Invoice | null>(null);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState<string | null>(null);
  // Asked before any order is created, so a click never leaves a pending payment behind when checkout isn't available.
  const [onlinePayments, setOnlinePayments] = useState<{ testMode: boolean; onlinePaymentsAvailable: boolean } | null>(null);

  useEffect(() => {
    if (isStudent) getPaymentMode().then(setOnlinePayments).catch(() => setOnlinePayments({ testMode: false, onlinePaymentsAvailable: false }));
  }, [isStudent]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      if (activeTab === 'invoices') {
        if (isStudent) {
          const data = await getMyInvoices();
          setInvoices(data);
        } else {
          const params = new URLSearchParams({ pageSize: '50' });
          if (statusFilter !== 'ALL') params.set('status', statusFilter);
          const res = await listInvoices(params);
          setInvoices(res.items);
        }
      } else if (activeTab === 'structures') {
        const data = await listFeeStructures();
        setStructures(data);
      } else if (activeTab === 'receipts') {
        const data = await getReceipts();
        setReceipts(data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load fee records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [activeTab, statusFilter]);

  const handleInitiatePayment = async (inv: Invoice) => {
    setPayingInvoice(inv);
    setProcessingPayment(true);
    setPaymentSuccess(null);
    setError(null);

    try {
      const order = await createRazorpayOrder(inv.id);

      // Razorpay Checkout isn't integrated yet, so a payment can only be simulated, and only when the API is in test
      // mode. Anywhere else, don't pretend the payment went through.
      if (!order.testMode) {
        throw new Error('Online checkout is not available yet. Please pay at the accounts office.');
      }
      const razorpayPaymentId = `pay_rzp_${Date.now()}`;
      const razorpaySignature = `test_sig_${razorpayPaymentId}`;

      const res = await verifyRazorpayPayment({
        paymentId: order.paymentId,
        razorpayOrderId: order.razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
      });

      setPaymentSuccess(
        `Test payment of ₹${Number(inv.amountDue).toLocaleString('en-IN')} recorded (test mode, no money was charged). Receipt Number: ${
          res.receipt?.receiptNumber || 'Generated'
        }`,
      );

      // Reload invoice list
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Razorpay payment processing failed.');
    } finally {
      setProcessingPayment(false);
      setPayingInvoice(null);
    }
  };

  return (
    <div className="grid gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[.16em] text-[hsl(var(--primary))]">Finance</p>
          <h1 className="mt-1 text-3xl font-semibold">Fees & Online Payments</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            {isStudent
              ? 'Your invoices, payments and receipts.'
              : 'Manage fee structures, issue student billing invoices, and accept online Razorpay payments with digital receipts.'}
          </p>
        </div>
        {isStaff && (
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/fees/structures/new">
              <Button variant="outline">+ Fee Structure</Button>
            </Link>
            <Link href="/dashboard/fees/invoices/new">
              <Button>+ Issue Invoice</Button>
            </Link>
          </div>
        )}
      </div>

      {paymentSuccess && (
        <div className="rounded-lg border border-green-300 bg-green-50 p-4 text-sm text-green-900 dark:border-green-900/50 dark:bg-green-950/40 dark:text-green-200">
          <strong>Success!</strong> {paymentSuccess}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 border-b pb-4">
        <button
          type="button"
          onClick={() => setActiveTab('invoices')}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
            activeTab === 'invoices'
              ? 'bg-[hsl(var(--primary))] text-white shadow'
              : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]'
          }`}
        >
          {isStudent ? 'My Invoices' : 'Invoices & Billing'}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('structures')}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
            activeTab === 'structures'
              ? 'bg-[hsl(var(--primary))] text-white shadow'
              : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]'
          }`}
        >
          Fee Structures
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('receipts')}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
            activeTab === 'receipts'
              ? 'bg-[hsl(var(--primary))] text-white shadow'
              : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]'
          }`}
        >
          Payment Receipts
        </button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>
                {activeTab === 'invoices'
                  ? isStudent
                    ? 'My Pending & Paid Invoices'
                    : 'College Invoices Directory'
                  : activeTab === 'structures'
                    ? 'Active Fee Structures'
                    : 'Verified Digital Receipts'}
              </CardTitle>
              <CardDescription>
                {activeTab === 'invoices'
                  ? 'Review invoice status, due dates, amounts, and process online payments.'
                  : activeTab === 'structures'
                    ? 'Configured academic fee templates by course and semester.'
                    : 'List of verified payment receipts and transaction records.'}
              </CardDescription>
            </div>
            {activeTab === 'invoices' && !isStudent && (
              <div className="flex flex-wrap items-center gap-1.5">
                {['ALL', 'ISSUED', 'PAID', 'OVERDUE'].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatusFilter(s)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition border ${
                      statusFilter === s
                        ? 'bg-[hsl(var(--primary))] text-white border-[hsl(var(--primary))]'
                        : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] border-transparent hover:border-[hsl(var(--border))]'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Skeleton className="h-36 w-full" />
              <Skeleton className="h-36 w-full" />
              <Skeleton className="h-36 w-full" />
            </div>
          ) : error ? (
            <ErrorState message={error} onRetry={() => void loadData()} />
          ) : activeTab === 'invoices' ? (
            <>
            {isStudent && invoices.length > 0 && <StudentFeeSummary invoices={invoices} />}
            {invoices.length === 0 ? (
              <EmptyState
                title="No invoices found"
                description={
                  isStudent
                    ? 'You have no active fee invoices pending.'
                    : 'No invoices match your selected status filter.'
                }
                action={
                  isStaff ? (
                    <Link href="/dashboard/fees/invoices/new">
                      <Button variant="outline">+ Issue Invoice</Button>
                    </Link>
                  ) : undefined
                }
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {invoices.map((inv) => (
                  <Card key={inv.id} className="flex flex-col justify-between transition hover:shadow-md">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <CardTitle className="text-base font-semibold">{inv.invoiceNumber}</CardTitle>
                          <CardDescription className="text-xs">
                            {inv.feeStructure ? inv.feeStructure.name : 'Academic Fee Invoice'}
                          </CardDescription>
                        </div>
                        <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-bold ${STATUS_COLORS[inv.status]}`}>
                          {inv.status}
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0 text-xs">
                      <div className="mb-4 grid gap-1.5 text-[hsl(var(--muted-foreground))]">
                        {inv.student && (
                          <div>
                            <strong>Student:</strong> {inv.student.firstName} {inv.student.lastName} ({inv.student.studentCode})
                          </div>
                        )}
                        <div>
                          <strong>Amount Due:</strong>{' '}
                          <span className="text-sm font-bold text-[hsl(var(--foreground))]">
                            ₹{Number(inv.amountDue).toLocaleString('en-IN')}
                          </span>
                        </div>
                        {inv.dueOn && (
                          <div>
                            <strong>Due Date:</strong> {new Date(inv.dueOn).toLocaleDateString()}
                          </div>
                        )}
                      </div>

                      {inv.status !== 'PAID' && onlinePayments && !onlinePayments.onlinePaymentsAvailable ? (
                        <p className="rounded bg-[hsl(var(--muted))] p-2 text-center text-xs text-[hsl(var(--muted-foreground))]">
                          Online payment isn&apos;t available yet. Please pay at the accounts office.
                        </p>
                      ) : inv.status !== 'PAID' ? (
                        <Button
                          disabled={!onlinePayments || (processingPayment && payingInvoice?.id === inv.id)}
                          onClick={() => void handleInitiatePayment(inv)}
                          className="w-full text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                          {processingPayment && payingInvoice?.id === inv.id
                            ? 'Verifying Razorpay...'
                            : onlinePayments?.testMode
                              ? 'Pay Now (test mode)'
                              : 'Pay Now via Razorpay'}
                        </Button>
                      ) : (
                        <div className="rounded bg-green-50 p-2 text-center text-xs font-semibold text-green-800 dark:bg-green-950/40 dark:text-green-300">
                          Payment Complete
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
            </>
          ) : activeTab === 'structures' ? (
            structures.length === 0 ? (
              <EmptyState
                title="No fee structures found"
                description="No academic fee structures have been created yet."
                action={
                  isStaff ? (
                    <Link href="/dashboard/fees/structures/new">
                      <Button variant="outline">+ Fee Structure</Button>
                    </Link>
                  ) : undefined
                }
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {structures.map((s) => (
                  <Card key={s.id} className="flex flex-col justify-between">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base font-semibold">{s.name}</CardTitle>
                      <CardDescription className="text-xs">
                        Active from {new Date(s.activeFrom).toLocaleDateString()}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0 text-xs">
                      <div className="grid gap-1 text-[hsl(var(--muted-foreground))]">
                        <div>
                          <strong>Amount:</strong>{' '}
                          <span className="text-base font-bold text-[hsl(var(--foreground))]">
                            ₹{Number(s.amount).toLocaleString('en-IN')} {s.currency}
                          </span>
                        </div>
                        {s.course && (
                          <div>
                            <strong>Course:</strong> {s.course.name} ({s.course.code})
                          </div>
                        )}
                        {s.semester && (
                          <div>
                            <strong>Semester:</strong> {s.semester.name}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )
          ) : receipts.length === 0 ? (
            <EmptyState
              title="No payment receipts found"
              description="Digital receipts will appear here after payments are settled."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {receipts.map((r) => (
                <Card key={r.id} className="flex flex-col justify-between border-green-200 dark:border-green-900/50">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base font-semibold text-emerald-700 dark:text-emerald-400">
                        {r.receiptNumber}
                      </CardTitle>
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-800 dark:bg-green-950 dark:text-green-300">
                        VERIFIED
                      </span>
                    </div>
                    <CardDescription className="text-xs">
                      Issued on {new Date(r.issuedAt).toLocaleDateString()}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0 text-xs text-[hsl(var(--muted-foreground))]">
                    <div>
                      <strong>Invoice Number:</strong> {r.payment?.invoice?.invoiceNumber || 'N/A'}
                    </div>
                    <div>
                      <strong>Amount Paid:</strong>{' '}
                      <span className="font-bold text-[hsl(var(--foreground))]">
                        ₹{Number(r.payment?.amount || 0).toLocaleString('en-IN')}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Totals across the student's own invoices, so the balance is visible before scrolling through them. */
function StudentFeeSummary({ invoices }: { invoices: Invoice[] }) {
  const billable = invoices.filter((invoice) => invoice.status !== 'VOID' && invoice.status !== 'DRAFT');
  const billed = billable.reduce((sum, invoice) => sum + Number(invoice.amountDue), 0);
  // A completed payment settles its invoice in full; amountDue stays the invoice total.
  const paid = billable.flatMap((invoice) => invoice.payments ?? []).filter((payment) => payment.status === 'COMPLETED').reduce((sum, payment) => sum + Number(payment.amount), 0);
  const outstanding = billable.filter((invoice) => invoice.status !== 'PAID').reduce((sum, invoice) => sum + Number(invoice.amountDue), 0);
  const nextDue = billable
    .filter((invoice) => invoice.status !== 'PAID' && invoice.dueOn)
    .map((invoice) => invoice.dueOn as string)
    .sort()[0];
  const rupees = (value: number): string => '₹' + value.toLocaleString('en-IN');
  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-3">
      <div className="rounded-[var(--radius)] border p-4">
        <p className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">Total billed</p>
        <p className="mt-1 text-2xl font-bold tabular-nums">{rupees(billed)}</p>
      </div>
      <div className="rounded-[var(--radius)] border p-4">
        <p className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">Paid</p>
        <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{rupees(paid)}</p>
      </div>
      <div className="rounded-[var(--radius)] border p-4">
        <p className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">Outstanding</p>
        <p className={'mt-1 text-2xl font-bold tabular-nums ' + (outstanding > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400')}>{rupees(outstanding)}</p>
        {nextDue && outstanding > 0 && (
          <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Next due {new Date(nextDue).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}</p>
        )}
      </div>
    </div>
  );
}
