'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { EmptyState, ErrorState, Skeleton } from '@/components/feedback/states';
import { Card, CardContent } from '@/components/ui/card';
import { listMyClasses } from '@/lib/attendance-api';
import type { AttendanceSummary, MyClass } from '@/lib/attendance-api';

const formatPercentage = (summary: AttendanceSummary): string =>
  summary.percentage === null ? '—' : `${summary.percentage.toFixed(1)}%`;

function Stat({ label, value, tone = '' }: { label: string; value: string | number; tone?: string }) {
  return (
    <div>
      <p className={`text-lg font-bold tabular-nums ${tone}`}>{value}</p>
      <p className="text-xs text-[hsl(var(--muted-foreground))]">{label}</p>
    </div>
  );
}

export default function MyClassesPage() {
  const [classes, setClasses] = useState<MyClass[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async (): Promise<void> => {
    setError(null);
    try {
      setClasses(await listMyClasses());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Your classes could not be loaded.');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Classes</h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">The classes you teach, with each one&apos;s students, attendance and coursework.</p>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : !classes ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-44 w-full" />
        </div>
      ) : classes.length === 0 ? (
        <EmptyState title="No classes assigned yet" description="Classes you are assigned to teach will appear here." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {classes.map((cls) => (
            <Card key={cls.id} className="transition-colors hover:border-[hsl(var(--primary))]/50">
              <CardContent className="grid gap-4 pt-5">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--primary))]">{cls.subject.code}</p>
                  <p className="text-lg font-semibold">{cls.subject.name}</p>
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">
                    {cls.section.semester.course.name} · {cls.section.semester.name} · Section {cls.section.code}
                  </p>
                </div>
                <div className="grid grid-cols-5 gap-3">
                  <Stat label="Students" value={cls.studentCount} />
                  <Stat label="Sessions held" value={cls.sessionsHeld} />
                  <Stat
                    label="Attendance"
                    value={formatPercentage(cls.attendance)}
                    tone={cls.attendance.belowThreshold ? 'text-rose-600 dark:text-rose-400' : cls.attendance.percentage === null ? '' : 'text-emerald-600 dark:text-emerald-400'}
                  />
                  <Stat label="Assignments" value={cls.assignmentCount} />
                  <Stat label="To evaluate" value={cls.pendingEvaluations} tone={cls.pendingEvaluations > 0 ? 'text-amber-600 dark:text-amber-400' : ''} />
                </div>
                <div className="flex flex-wrap gap-3 text-sm font-semibold">
                  <Link href={`/dashboard/classes/${cls.id}`} className="text-[hsl(var(--primary))] underline underline-offset-4">
                    Open class →
                  </Link>
                  <Link href={`/dashboard/attendance/new?classId=${cls.id}`} className="text-[hsl(var(--primary))] underline underline-offset-4">
                    Mark attendance
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
