'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { EmptyState, ErrorState, Skeleton } from '@/components/feedback/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Pagination } from '@/components/ui/pagination';
import { Table, TableCell, TableHead } from '@/components/ui/table';
import { listAttendance } from '@/lib/attendance-api';
import type { AttendanceSession } from '@/lib/attendance-api';

const PAGE_SIZE = 20;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function AttendancePage() {
  const { primaryRole, user } = useAuth();
  // Admin decision 2: Admin monitors attendance (the report) but faculty and HODs record it.
  const canMarkAttendance = primaryRole === 'HOD' || primaryRole === 'Faculty';
  // The report API admits ADMIN and HOD only, so check the real roles (a super-admin also shows as "Admin").
  const canSeeReport = Boolean(user?.roles?.some((role) => role === 'ADMIN' || role === 'HOD'));

  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async (p = page): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
      const result = await listAttendance(params);
      setSessions(result.items);
      setTotal(result.total);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Attendance sessions could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [page]);

  return (
    <div className="grid gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Attendance</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            {primaryRole === 'Admin' ? 'Attendance sessions recorded across the college. Faculty mark attendance and HODs correct it.' : 'Mark and review attendance sessions for classes.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canSeeReport && (
            <Link
              href="/dashboard/attendance/report"
              className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-[var(--radius)] px-4 text-sm font-semibold transition ${
                canMarkAttendance ? 'border bg-[hsl(var(--card))] shadow-sm hover:bg-[hsl(var(--muted))]' : 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-sm hover:brightness-110'
              }`}
            >
              Attendance report
            </Link>
          )}
          {canMarkAttendance && (
            <Link
              href="/dashboard/attendance/new"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[var(--radius)] bg-[hsl(var(--primary))] px-4 text-sm font-semibold text-[hsl(var(--primary-foreground))] shadow-sm transition hover:brightness-110"
            >
              Mark attendance
            </Link>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sessions</CardTitle>
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
          ) : sessions.length ? (
            <>
              <Table>
                <thead>
                  <tr>
                    <TableHead>Class</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Students</TableHead>
                    <TableHead>View</TableHead>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => (
                    <tr key={s.id}>
                      <TableCell>
                        <strong>{s.class.subject.name}</strong>
                        <span className="block text-xs text-[hsl(var(--muted-foreground))]">
                          {s.class.section.semester.course.name} · {s.class.section.code}
                        </span>
                      </TableCell>
                      <TableCell>{formatDate(s.heldOn)}</TableCell>
                      <TableCell>{s.records.length}</TableCell>
                      <TableCell>
                        <Link
                          className="font-semibold text-[hsl(var(--primary))] underline"
                          href={`/dashboard/attendance/${s.id}`}
                        >
                          Open
                        </Link>
                      </TableCell>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <Pagination
                page={page}
                pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
                onPageChange={(p) => { setPage(p); }}
              />
            </>
          ) : (
            <EmptyState
              title="No attendance sessions"
              description="No sessions have been recorded yet. Use Mark attendance to create one."
              action={<Button variant="outline" onClick={() => void load()}>Refresh</Button>}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
