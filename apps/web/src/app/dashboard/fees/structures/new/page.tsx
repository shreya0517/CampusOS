'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/form-field';
import { createFeeStructure } from '@/lib/fees-api';

export default function NewFeeStructurePage() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [activeFrom, setActiveFrom] = useState(new Date().toISOString().split('T')[0] || '');
  const [activeUntil, setActiveUntil] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Fee structure name is required.');
      return;
    }
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Please enter a valid positive fee amount.');
      return;
    }
    if (!activeFrom) {
      setError('Active from date is required.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await createFeeStructure({
        name: name.trim(),
        amount: numAmount,
        activeFrom,
        activeUntil: activeUntil ? activeUntil : undefined,
      });
      router.push('/dashboard/fees');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create fee structure.');
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
        <h1 className="mt-2 text-2xl font-bold">Create Fee Structure Template</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          Define standard academic fee amounts and activation dates.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fee Structure Details</CardTitle>
          <CardDescription>Enter template title and amount in INR.</CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-300">
              <strong>Error:</strong> {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="grid gap-5">
            <Input
              label="Fee Structure Name"
              placeholder="e.g. B.Tech Semester 1 Tuition Fee 2026"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />

            <Input
              label="Fee Amount (₹ INR)"
              type="number"
              placeholder="e.g. 45000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Active From Date"
                type="date"
                value={activeFrom}
                onChange={(e) => setActiveFrom(e.target.value)}
                required
              />
              <Input
                label="Active Until Date (Optional)"
                type="date"
                value={activeUntil}
                onChange={(e) => setActiveUntil(e.target.value)}
              />
            </div>

            <div className="mt-4 flex items-center justify-end gap-3">
              <Link href="/dashboard/fees">
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Creating...' : 'Save Fee Structure'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
