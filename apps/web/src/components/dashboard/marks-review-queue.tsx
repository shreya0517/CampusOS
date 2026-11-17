'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { listMarksReviewQueue } from '@/lib/exams-api';
import type { MarksReviewItem } from '@/lib/exams-api';

/** Papers whose marks are waiting for the HOD's or Admin's review. Renders nothing when the queue is empty. */
export function MarksReviewQueue() {
  const [items, setItems] = useState<MarksReviewItem[]>([]);

  useEffect(() => {
    listMarksReviewQueue().then(setItems).catch(() => setItems([]));
  }, []);

  if (items.length === 0) return null;

  return (
    <Card className="border-amber-300 dark:border-amber-900">
      <CardHeader>
        <CardTitle>Marks awaiting your review ({items.length})</CardTitle>
        <CardDescription>Approve them or return them for changes; results can be published once every paper of an exam is approved.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
              <div>
                <p className="font-semibold">
                  {item.subject.name} <span className="text-xs text-[hsl(var(--muted-foreground))]">({item.subject.code})</span>
                </p>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  {item.exam.name} · {item.semester.name}
                  {item.section ? ` · Section ${item.section.code}` : ''}
                  {item.marksSubmittedAt ? ` · submitted ${new Date(item.marksSubmittedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}
                </p>
              </div>
              <Link
                href={`/dashboard/exams/${item.exam.id}/subjects/${item.id}/marks`}
                className="font-semibold text-[hsl(var(--primary))] underline underline-offset-4"
              >
                Review marks →
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
