'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/form-field';
import { createInvoice, listFeeStructures } from '@/lib/fees-api';
import type { FeeStructure } from '@/lib/fees-api';
import { listStudents } from '@/lib/student-api';
import type { Student } from '@/lib/student-api';

export default function NewInvoicePage() {
  const router = useRouter();

  const [students, setStudents] = useState<Student[]>([]);
  const [structures, setStructures] = useState<FeeStructure[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);

  const [studentId, setStudentId] = useState('');
  const [feeStructureId, setFeeStructureId] = useState('');
  const [amountDue, setAmountDue] = useState('');
  const [dueOn, setDueOn] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      try {
        const [stuRes, structList] = await Promise.all([
          listStudents(new URLSearchParams({ pageSize: '100' })),
          listFeeStructures(),
        ]);
        setStudents(stuRes.items);
        setStructures(structList);

        if (stuRes.items.length > 0 && stuRes.items[0]) setStudentId(stuRes.items[0].id);
        if (structList.length > 0 && structList[0]) {
          setFeeStructureId(structList[0].id);
          setAmountDue(String(structList[0].amount));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load dropdown options.');
      } finally {
        setLoadingOptions(false);
      }
    }
    void init();
  }, []);

  const handleStructureChange = (id: string) => {
    setFeeStructureId(id);
    const found = structures.find((s) => s.id === id);
    if (found) {
      setAmountDue(String(found.amount));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId) {
      setError('Please select a student.');
      return;
    }
    const numAmount = Number(amountDue);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Please enter a valid amount due.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await createInvoice({
        studentId,
        feeStructureId: feeStructureId ? feeStructureId : undefined,
        amountDue: numAmount,
        dueOn: dueOn ? dueOn : undefined,
      });
      router.push('/dashboard/fees');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to issue invoice.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl grid gap-6">
      <div>
        <Link href="/dashboard/fees" className="text-xs font-semibold text-[hsl(var(--primary))] hover:underline">
          &larr; Back to Fees
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Issue Student Billing Invoice</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          Generate an official fee invoice for an enrolled student.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Invoice Billing Details</CardTitle>
          <CardDescription>Select student, optional fee template, amount due, and payment due date.</CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-300">
              <strong>Error:</strong> {error}
            </div>
          )}

          {loadingOptions ? (
            <div className="py-8 text-center text-xs text-[hsl(var(--muted-foreground))]">
              Loading options...
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="grid gap-5">
              <Select
                label="Student"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
              >
                {students.length === 0 ? (
                  <option value="">No students available</option>
                ) : (
                  students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.firstName} {s.lastName} ({s.studentCode})
                    </option>
                  ))
                )}
              </Select>

              <Select
                label="Fee Structure Template (Optional)"
                value={feeStructureId}
                onChange={(e) => handleStructureChange(e.target.value)}
              >
                <option value="">Custom / No Template</option>
                {structures.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — ₹{Number(s.amount).toLocaleString('en-IN')}
                  </option>
                ))}
              </Select>

              <Input
                label="Amount Due (₹ INR)"
                type="number"
                placeholder="e.g. 50000"
                value={amountDue}
                onChange={(e) => setAmountDue(e.target.value)}
                required
              />

              <Input
                label="Payment Due Date (Optional)"
                type="date"
                value={dueOn}
                onChange={(e) => setDueOn(e.target.value)}
              />

              <div className="mt-4 flex items-center justify-end gap-3">
                <Link href="/dashboard/fees">
                  <Button type="button" variant="outline">
                    Cancel
                  </Button>
                </Link>
                <Button type="submit" disabled={submitting || students.length === 0}>
                  {submitting ? 'Issuing Invoice...' : 'Issue Invoice'}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
