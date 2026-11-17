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

type StudentStatus = 'PENDING' | 'OVERDUE' | 'SUBMITTED' | 'RETURNED' | 'EVALUATED';
type TabKey = 'ALL' | 'PENDING' | 'SUBMITTED' | 'EVALUATED' | 'OVERDUE';

const STUDENT_STATUS: Record<StudentStatus, { label: string; badge: string }> = {
  PENDING: { label: 'Pending', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200' },
  OVERDUE: { label: 'Overdue', badge: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200' },
  SUBMITTED: { label: 'Submitted', badge: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200' },
  RETURNED: { label: 'Returned for changes', badge: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200' },
  EVALUATED: { label: 'Evaluated', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200' },
};

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'ALL', label: 'All' },
  { key: 'PENDING', label: 'Pending' },
  { key: 'SUBMITTED', label: 'Submitted' },
  { key: 'EVALUATED', label: 'Evaluated' },
  { key: 'OVERDUE', label: 'Overdue' },
];

/** Where an assignment stands for the signed-in student, from their own submission and the deadline. */
function studentStatus(assignment: Assignment): StudentStatus {
  const submission = assignment.mySubmission;
  if (submission?.status === 'GRADED') return 'EVALUATED';
  if (submission?.status === 'RETURNED') return 'RETURNED';
  if (submission && submission.status !== 'DRAFT') return 'SUBMITTED';
  return assignment.dueAt && new Date(assignment.dueAt) < new Date() ? 'OVERDUE' : 'PENDING';
}

const matchesTab = (status: StudentStatus, tab: TabKey): boolean => {
  if (tab === 'ALL') return true;
  if (tab === 'SUBMITTED') return status === 'SUBMITTED' || status === 'RETURNED';
  return status === tab;
};

function StudentAssignments() {
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);
  const [tab, setTab] = useState<TabKey>('ALL');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = async (term = search): Promise<void> => {
    setError(null);
    try {
      // The tabs count across everything, so load every page (usually just one) instead of paginating.
      const all: Assignment[] = [];
      for (let page = 1; ; page += 1) {
        const params = new URLSearchParams({ page: String(page), pageSize: '100' });
        if (term.trim()) params.set('search', term.trim());
        const result = await listAssignments(params);
        all.push(...result.items);
        if (result.items.length === 0 || all.length >= result.total) break;
      }
      setAssignments(all);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Your assignments could not be loaded.');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const withStatus = (assignments ?? []).map((assignment) => ({ assignment, status: studentStatus(assignment) }));
  const visible = withStatus.filter(({ status }) => matchesTab(status, tab));
  const tabLabel = TABS.find((item) => item.key === tab)?.label.toLowerCase() ?? '';

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-3xl font-semibold">My Assignments</h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">Coursework from your subjects and where each one stands.</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Filter assignments by status" className="flex flex-wrap gap-2">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={
                'rounded-full px-3 py-1.5 text-sm font-medium transition-colors ' +
                (tab === key
                  ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                  : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]')
              }
            >
              {label}
              {assignments && <span className="ml-1.5 opacity-75">{withStatus.filter(({ status }) => matchesTab(status, key)).length}</span>}
            </button>
          ))}
        </div>
        <form
          className="flex gap-2"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            void load(search);
          }}
        >
          <input
            aria-label="Search assignments"
            placeholder="Search assignments..."
            value={search}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setSearch(event.target.value)}
            className="w-56 min-h-10 rounded-[var(--radius)] border bg-[hsl(var(--background))] px-3 text-sm"
          />
          <Button type="submit" variant="outline">Search</Button>
        </form>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : !assignments ? (
        <Skeleton className="h-48 w-full" />
      ) : visible.length === 0 ? (
        <EmptyState
          title={tab === 'ALL' ? 'No assignments yet' : 'No ' + tabLabel + ' assignments'}
          description={tab === 'ALL' ? 'Assignments from your subjects will appear here.' : 'Nothing in this list right now.'}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <thead>
                <tr>
                  <TableHead>Assignment</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </tr>
              </thead>
              <tbody>
                {visible.map(({ assignment, status }) => {
                  const marks = assignment.mySubmission?.marksAwarded;
                  const needsWork = status === 'PENDING' || status === 'OVERDUE' || status === 'RETURNED';
                  return (
                    <tr key={assignment.id}>
                      <TableCell>
                        <p className="font-semibold">{assignment.title}</p>
                        <p className="text-xs text-[hsl(var(--muted-foreground))]">Max {assignment.maxMarks} marks</p>
                      </TableCell>
                      <TableCell>{assignment.class.subject.name}</TableCell>
                      <TableCell className={'whitespace-nowrap ' + (status === 'OVERDUE' ? 'font-semibold text-red-600 dark:text-red-400' : '')}>
                        {formatDate(assignment.dueAt)}
                      </TableCell>
                      <TableCell>
                        <span className={'inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ' + STUDENT_STATUS[status].badge}>{STUDENT_STATUS[status].label}</span>
                        {status === 'EVALUATED' && marks !== null && marks !== undefined && (
                          <span className="ml-2 text-xs font-semibold">
                            {marks}/{assignment.maxMarks}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link className="font-semibold text-[hsl(var(--primary))] underline underline-offset-4" href={'/dashboard/assignments/' + assignment.id}>
                          {needsWork ? 'Open & submit' : 'View'}
                        </Link>
                      </TableCell>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function AssignmentsPage() {
  const { primaryRole } = useAuth();
  if (primaryRole === 'Student') return <StudentAssignments />;
  return <StaffAssignments primaryRole={primaryRole} />;
}

function StaffAssignments({ primaryRole }: { primaryRole: string }) {
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
