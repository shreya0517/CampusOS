'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ErrorState } from '@/components/feedback/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/form-field';
import { createExam } from '@/lib/exams-api';
import type { ExamStatus } from '@/lib/exams-api';

export default function NewExamPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const name = String(formData.get('name') ?? '').trim();
    const status = String(formData.get('status') ?? 'DRAFT') as ExamStatus;
    const startsOn = String(formData.get('startsOn') ?? '');
    const endsOn = String(formData.get('endsOn') ?? '');

    try {
      const created = await createExam({ name, status, startsOn, endsOn });
      router.push(`/dashboard/exams/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create exam.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl grid gap-6">
      <div>
        <Link href="/dashboard/exams" className="text-sm font-semibold text-[hsl(var(--primary))] hover:underline">
          &larr; Back to Exams
        </Link>
        <h1 className="mt-2 text-3xl font-semibold">Create New Examination</h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          Set up a new examination term for scheduling subject papers and grading.
        </p>
      </div>

      {error && <ErrorState message={error} />}

      <Card>
        <CardHeader>
          <CardTitle>Exam Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-4">
            <Input
              label="Exam Name"
              name="name"
              placeholder="e.g. End Semester Examinations Fall 2026"
              required
            />

            <div className="grid gap-2">
              <label className="text-sm font-medium text-[hsl(var(--foreground))]">Status</label>
              <select
                name="status"
                defaultValue="DRAFT"
                className="w-full rounded-[var(--radius)] border bg-[hsl(var(--card))] px-3 py-2 text-sm text-[hsl(var(--foreground))]"
              >
                <option value="DRAFT">Draft</option>
                <option value="SCHEDULED">Scheduled</option>
                <option value="COMPLETED">Completed</option>
              </select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Start Date"
                name="startsOn"
                type="date"
                required
              />
              <Input
                label="End Date"
                name="endsOn"
                type="date"
                required
              />
            </div>

            <div className="mt-4 flex items-center justify-end gap-3">
              <Link href="/dashboard/exams">
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
              <Button type="submit" loading={submitting}>
                Create Exam &rarr;
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
