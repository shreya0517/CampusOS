'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { EmptyState, ErrorState, Skeleton } from '@/components/feedback/states';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/form-field';
import { Table, TableCell, TableHead } from '@/components/ui/table';
import { getFacultyPerformance, listDepartments } from '@/lib/faculty-api';
import type { Department, FacultyPerformanceRow } from '@/lib/faculty-api';

export default function FacultyPerformancePage() {
  const { primaryRole } = useAuth();
  const isAdmin = primaryRole === 'Admin';
  const [rows, setRows] = useState<FacultyPerformanceRow[] | null>(null);
  const [windowDays, setWindowDays] = useState(30);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentId, setDepartmentId] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isAdmin) listDepartments(new URLSearchParams({ page: '1', pageSize: '100' })).then((list) => setDepartments(list.items)).catch(() => undefined);
  }, [isAdmin]);

  const load = async (): Promise<void> => {
    setError(null);
    setRows(null);
    try {
      const report = await getFacultyPerformance(departmentId || undefined);
      setRows(report.faculty);
      setWindowDays(report.windowDays);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Faculty performance could not be loaded.');
    }
  };

  useEffect(() => {
    void load();
  }, [departmentId]);

  const totals = (rows ?? []).reduce(
    (sum, row) => ({
      sessions: sum.sessions + row.sessionsMarked,
      toEvaluate: sum.toEvaluate + row.pendingEvaluations,
      openTasks: sum.openTasks + row.tasks.pending + row.tasks.inProgress + row.tasks.rework,
      overdue: sum.overdue + row.tasks.overdue,
    }),
    { sessions: 0, toEvaluate: 0, openTasks: 0, overdue: 0 },
  );

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Faculty Performance</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            Workload and activity from system records{isAdmin ? '' : ' for your department'}. Sessions and assignments cover the last {windowDays} days.
          </p>
        </div>
        {isAdmin && (
          <div className="w-64">
            <Select label="Department" value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
              <option value="">All departments</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>

      {error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : !rows ? (
        <Skeleton className="h-72 w-full" />
      ) : rows.length === 0 ? (
        <EmptyState title="No faculty here yet" description="Faculty records in this department will appear here." />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'Faculty', value: rows.length },
              { label: `Sessions marked (${windowDays} days)`, value: totals.sessions },
              { label: 'Submissions to evaluate', value: totals.toEvaluate, tone: totals.toEvaluate > 0 ? 'text-amber-600 dark:text-amber-400' : '' },
              { label: 'Overdue tasks', value: totals.overdue, tone: totals.overdue > 0 ? 'text-rose-600 dark:text-rose-400' : '' },
            ].map((stat) => (
              <Card key={stat.label}>
                <CardContent className="pt-5">
                  <p className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">{stat.label}</p>
                  <p className={`mt-1 text-2xl font-bold tabular-nums ${stat.tone ?? ''}`}>{stat.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>By faculty member</CardTitle>
              <CardDescription>{totals.openTasks} task{totals.openTasks === 1 ? '' : 's'} still open across the list.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <thead>
                  <tr>
                    <TableHead>Faculty</TableHead>
                    <TableHead>Classes</TableHead>
                    <TableHead>Sessions marked</TableHead>
                    <TableHead>Assignments set</TableHead>
                    <TableHead>To evaluate</TableHead>
                    <TableHead>Tasks open / done</TableHead>
                    <TableHead>Overdue</TableHead>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const open = row.tasks.pending + row.tasks.inProgress + row.tasks.rework;
                    return (
                      <tr key={row.faculty.id}>
                        <TableCell>
                          <Link href={`/dashboard/faculty/${row.faculty.id}`} className="font-semibold hover:underline">
                            {row.faculty.firstName} {row.faculty.lastName}
                          </Link>
                          <p className="text-xs text-[hsl(var(--muted-foreground))]">
                            {row.faculty.employeeCode}
                            {isAdmin && row.faculty.department ? ` · ${row.faculty.department.code}` : ''}
                          </p>
                        </TableCell>
                        <TableCell>{row.classes}</TableCell>
                        <TableCell>{row.sessionsMarked}</TableCell>
                        <TableCell>{row.assignmentsCreated}</TableCell>
                        <TableCell className={row.pendingEvaluations > 0 ? 'font-semibold text-amber-600 dark:text-amber-400' : ''}>{row.pendingEvaluations}</TableCell>
                        <TableCell>
                          {open} open · {row.tasks.submitted} awaiting review · {row.tasks.approved} approved
                        </TableCell>
                        <TableCell className={row.tasks.overdue > 0 ? 'font-semibold text-rose-600 dark:text-rose-400' : ''}>{row.tasks.overdue}</TableCell>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
