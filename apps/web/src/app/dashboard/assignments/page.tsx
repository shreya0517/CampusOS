'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useAuth } from '@/components/auth-provider';
import { EmptyState, ErrorState, Skeleton } from '@/components/feedback/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Pagination } from '@/components/ui/pagination';
import { Table, TableCell, TableHead } from '@/components/ui/table';
import { listAssignments } from '@/lib/assignments-api';
import type { Assignment } from '@/lib/assignments-api';

const PAGE_SIZE = 20;

function formatDate(iso: string | null): string {
  if (!iso) return 'No due date';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function AssignmentsPage() {
  const { primaryRole } = useAuth();
  const isStaff = primaryRole === 'Admin' || primaryRole === 'HOD' || primaryRole === 'Faculty';

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async (p = page, s = search): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
      if (s.trim()) params.set('search', s.trim());
      const result = await listAssignments(params);
      setAssignments(result.items);
      setTotal(result.total);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Assignments could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [page]);

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    setPage(1);
    void load(1, search);
  };

  return (
    <div className="grid gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[.16em] text-[hsl(var(--primary))]">Assignments</p>
          <h1 className="mt-2 text-3xl font-semibold">Assignments & Submissions</h1>
          <p className="mt-2 text-[hsl(var(--muted-foreground))]">Manage course assignments, view student submissions, and grade work.</p>
        </div>
        {isStaff && (
          <Link
            href="/dashboard/assignments/new"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[var(--radius)] bg-[hsl(var(--primary))] px-4 text-sm font-semibold text-[hsl(var(--primary-foreground))] transition hover:brightness-95"
          >
            Create assignment
          </Link>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle>All Assignments</CardTitle>
            <form onSubmit={handleSearchSubmit} className="flex gap-2">
              <input
                placeholder="Search assignments..."
                value={search}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
                className="w-64 min-h-10 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm"
              />
              <Button type="submit" variant="secondary">Search</Button>
            </form>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          {loading ? (
            <div className="grid gap-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : error ? (
            <ErrorState message={error} onRetry={() => void load()} />
          ) : assignments.length ? (
            <>
              <Table>
                <thead>
                  <tr>
                    <TableHead>Title</TableHead>
                    <TableHead>Course & Subject</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Max Marks</TableHead>
                    <TableHead>Submissions</TableHead>
                    <TableHead>Action</TableHead>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map((a) => (
                    <tr key={a.id}>
                      <TableCell>
                        <strong>{a.title}</strong>
                        {a.description && (
                          <span className="block truncate max-w-xs text-xs text-[hsl(var(--muted-foreground))]">
                            {a.description}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span>{a.class.subject.name}</span>
                        <span className="block text-xs text-[hsl(var(--muted-foreground))]">
                          {a.class.section.semester.course.code} · {a.class.section.code}
                        </span>
                      </TableCell>
                      <TableCell>{formatDate(a.dueAt)}</TableCell>
                      <TableCell>{a.maxMarks}</TableCell>
                      <TableCell>{a._count?.submissions ?? (a.mySubmission ? 'Submitted' : 'Pending')}</TableCell>
                      <TableCell>
                        <Link
                          className="font-semibold text-[hsl(var(--primary))] underline"
                          href={`/dashboard/assignments/${a.id}`}
                        >
                          View
                        </Link>
                      </TableCell>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <Pagination
                page={page}
                pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
                onPageChange={(p) => setPage(p)}
              />
            </>
          ) : (
            <EmptyState
              title="No assignments found"
              description="No assignments have been published yet."
              action={<Button variant="outline" onClick={() => void load()}>Refresh</Button>}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
