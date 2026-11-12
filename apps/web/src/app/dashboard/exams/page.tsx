'use client';

import Link from 'next/link';
import { useDeferredValue, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { EmptyState, ErrorState, Skeleton } from '@/components/feedback/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/form-field';
import { Pagination } from '@/components/ui/pagination';
import { listExams } from '@/lib/exams-api';
import type { Exam, ExamStatus } from '@/lib/exams-api';

const STATUS_COLORS: Record<ExamStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200 border-gray-300',
  SCHEDULED: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200 border-blue-300',
  COMPLETED: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200 border-green-300',
  CANCELLED: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200 border-red-300',
};

export default function ExamsPage() {
  const { primaryRole } = useAuth();
  const isAdminOrHOD = primaryRole === 'Admin' || primaryRole === 'HOD';
  const isStudent = primaryRole === 'Student';

  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [page, setPage] = useState(1);

  const [exams, setExams] = useState<Exam[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '12' });
      if (deferredSearch) params.set('search', deferredSearch);
      if (statusFilter !== 'ALL') params.set('status', statusFilter);

      const result = await listExams(params);
      setExams(result.items);
      setTotal(result.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load exams.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [deferredSearch, statusFilter, page]);

  return (
    <div className="grid gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[.16em] text-[hsl(var(--primary))]">Academics</p>
          <h1 className="mt-1 text-3xl font-semibold">Exams & Results</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            Schedule examinations, record student marks, evaluate percentages, and publish term results.
          </p>
        </div>
        {isAdminOrHOD && (
          <Link href="/dashboard/exams/new">
            <Button className="w-full sm:w-auto">+ Create Exam</Button>
          </Link>
        )}
      </div>

      {isStudent && (
        <Card className="border-green-500/40 bg-green-50/50 dark:bg-green-950/20">
          <CardHeader>
            <CardTitle>My Personal Results & Report Card</CardTitle>
            <CardDescription>View your official exam results, percentages, pass/fail status, and subject breakdown.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard/exams/me">
              <Button variant="outline">View My Results &rarr;</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Exam Directory</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex-1">
              <Input
                label="Search exams"
                placeholder="Search by exam name..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5 self-end pb-0.5">
              {['ALL', 'DRAFT', 'SCHEDULED', 'COMPLETED', 'CANCELLED'].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setStatusFilter(s);
                    setPage(1);
                  }}
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
          </div>

          {loading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : error ? (
            <ErrorState message={error} onRetry={() => void load()} />
          ) : exams.length ? (
            <>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {exams.map((exam) => (
                  <Card key={exam.id} className="flex flex-col justify-between transition hover:shadow-md">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-base font-semibold">{exam.name}</CardTitle>
                        <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-bold ${STATUS_COLORS[exam.status]}`}>
                          {exam.status}
                        </span>
                      </div>
                      <CardDescription className="text-xs">
                        {new Date(exam.startsOn).toLocaleDateString()} &mdash; {new Date(exam.endsOn).toLocaleDateString()}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="mb-4 flex gap-4 text-xs text-[hsl(var(--muted-foreground))]">
                        <div>
                          <strong className="text-[hsl(var(--foreground))]">{exam._count?.examSubjects ?? 0}</strong> Scheduled Subjects
                        </div>
                        <div>
                          <strong className="text-[hsl(var(--foreground))]">{exam._count?.results ?? 0}</strong> Published Results
                        </div>
                      </div>
                      <Link href={`/dashboard/exams/${exam.id}`} className="block">
                        <Button variant="outline" className="w-full text-xs">
                          Manage & View Exam &rarr;
                        </Button>
                      </Link>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <Pagination page={page} pageCount={Math.max(1, Math.ceil(total / 12))} onPageChange={setPage} />
            </>
          ) : (
            <EmptyState
              title="No exams found"
              description="No exams match your active search or status filter."
              action={
                <Button variant="outline" onClick={() => { setSearch(''); setStatusFilter('ALL'); setPage(1); }}>
                  Clear Filters
                </Button>
              }
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
