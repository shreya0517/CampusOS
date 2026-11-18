'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { AttendanceBar } from '@/components/attendance/attendance-bar';
import { EmptyState, ErrorState, Skeleton } from '@/components/feedback/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/form-field';
import { Table, TableCell, TableHead } from '@/components/ui/table';
import { getAttendanceReport } from '@/lib/attendance-api';
import type { AttendanceReport } from '@/lib/attendance-api';
import { listDepartments } from '@/lib/faculty-api';
import type { Department } from '@/lib/faculty-api';

const monthLabel = (month: string): string => new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Quotes each cell and neutralises values a spreadsheet would run as formulas. */
const csvCell = (value: string | number | null): string => {
  const text = value === null ? '' : String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
};

function Figure({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: string }) {
  return (
    <Card className="h-full">
      <CardContent>
        <p className="text-sm font-medium text-[hsl(var(--muted-foreground))]">{label}</p>
        <p className={`mt-2 text-[1.75rem] font-bold leading-none tabular-nums ${tone ?? ''}`}>{value}</p>
        {sub && <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default function AttendanceReportPage() {
  const { primaryRole } = useAuth();
  const isAdmin = primaryRole === 'Admin';

  const [report, setReport] = useState<AttendanceReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [filters, setFilters] = useState({ from: '', to: '', departmentId: '' });

  const load = async (next = filters) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (next.from) params.set('from', next.from);
      if (next.to) params.set('to', next.to);
      if (next.departmentId) params.set('departmentId', next.departmentId);
      const result = await getAttendanceReport(params);
      setReport(result);
      // Show the range the server used, so the date fields always match the figures.
      setFilters({ ...next, from: result.range.from, to: result.range.to });
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The attendance report could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    if (isAdmin) listDepartments(new URLSearchParams({ page: '1', pageSize: '100' })).then((list) => setDepartments(list.items)).catch(() => undefined);
  }, [isAdmin]);

  const exportShortages = () => {
    if (!report) return;
    const rows = [
      ['Student code', 'Student', 'Section', 'Attended', 'Counted', 'Attendance %'],
      ...report.shortages.map((row) => [row.student.studentCode, row.student.name, row.section, row.attended, row.counted, row.percentage]),
    ];
    const blob = new Blob([rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `attendance-shortages-${report.range.from}-to-${report.range.to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const classesShort = report?.byClass.filter((row) => row.belowThreshold).length ?? 0;

  return (
    <div className="grid gap-6">
      <div>
        <Link className="text-sm font-semibold text-[hsl(var(--primary))] hover:underline" href="/dashboard/attendance">
          ← Attendance sessions
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Attendance Report</h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          {isAdmin ? 'Attendance across the college' : 'Attendance in your department'} from recorded sessions. Late counts as present, excused sessions are left out, and under{' '}
          {report?.threshold ?? 75}% is a shortage.
        </p>
      </div>

      <Card>
        <CardContent>
          <form
            className={`grid gap-3 sm:grid-cols-2 ${isAdmin ? 'lg:grid-cols-[12rem_12rem_minmax(0,16rem)_auto]' : 'lg:grid-cols-[12rem_12rem_auto]'}`}
            onSubmit={(event) => {
              event.preventDefault();
              void load(filters);
            }}
          >
            <Input label="From" type="date" value={filters.from} max={filters.to || undefined} onChange={(event) => setFilters({ ...filters, from: event.target.value })} />
            <Input label="To" type="date" value={filters.to} min={filters.from || undefined} onChange={(event) => setFilters({ ...filters, to: event.target.value })} />
            {isAdmin && (
              <Select label="Department" value={filters.departmentId} onChange={(event) => setFilters({ ...filters, departmentId: event.target.value })}>
                <option value="">All departments</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </Select>
            )}
            <Button type="submit" className="self-end" loading={loading}>
              Apply
            </Button>
          </form>
        </CardContent>
      </Card>

      {error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : !report ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-28 w-full" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Figure
              label="Overall attendance"
              value={report.overall.percentage === null ? '—' : `${report.overall.percentage}%`}
              sub={`${report.overall.attended} of ${report.overall.counted} attended`}
              tone={report.overall.belowThreshold ? 'text-rose-600 dark:text-rose-400' : ''}
            />
            <Figure label="Sessions recorded" value={report.sessions} sub={`${report.range.from} to ${report.range.to}`} />
            <Figure label="Students short" value={report.shortageTotal} sub={`Under ${report.threshold}% in this period`} tone={report.shortageTotal ? 'text-rose-600 dark:text-rose-400' : ''} />
            <Figure label="Classes short" value={classesShort} sub={`of ${report.byClass.length} classes`} tone={classesShort ? 'text-amber-600 dark:text-amber-400' : ''} />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            {isAdmin && (
              <Card>
                <CardHeader>
                  <CardTitle>By department</CardTitle>
                </CardHeader>
                <CardContent className={report.byDepartment.length ? 'p-0' : ''}>
                  {report.byDepartment.length === 0 ? (
                    <p className="text-sm text-[hsl(var(--muted-foreground))]">No classes yet.</p>
                  ) : (
                    <Table>
                      <thead>
                        <tr>
                          <TableHead>Department</TableHead>
                          <TableHead className="text-right">Attended</TableHead>
                          <TableHead>Attendance</TableHead>
                        </tr>
                      </thead>
                      <tbody>
                        {report.byDepartment.map((row) => (
                          <tr key={row.department.id}>
                            <TableCell>
                              {row.department.name} <span className="text-xs text-[hsl(var(--muted-foreground))]">{row.department.code}</span>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {row.attended}/{row.counted}
                            </TableCell>
                            <TableCell>
                              <AttendanceBar summary={row} />
                            </TableCell>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            )}

            <Card className={isAdmin ? '' : 'xl:col-span-2'}>
              <CardHeader>
                <CardTitle>By month</CardTitle>
              </CardHeader>
              <CardContent className={report.byMonth.length ? 'grid gap-3' : ''}>
                {report.byMonth.length === 0 ? (
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">No sessions in this period.</p>
                ) : (
                  report.byMonth.map((row) => (
                    <div key={row.month} className="grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-3 text-sm">
                      <span className="font-medium">{monthLabel(row.month)}</span>
                      <AttendanceBar summary={row} />
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>By class</CardTitle>
              <CardDescription>Each subject and section, with the faculty member who teaches it.</CardDescription>
            </CardHeader>
            <CardContent className={report.byClass.length ? 'p-0' : ''}>
              {report.byClass.length === 0 ? (
                <p className="text-sm text-[hsl(var(--muted-foreground))]">No classes yet.</p>
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <TableHead>Subject</TableHead>
                      <TableHead>Section</TableHead>
                      <TableHead>Faculty</TableHead>
                      <TableHead className="text-right">Sessions</TableHead>
                      <TableHead>Attendance</TableHead>
                    </tr>
                  </thead>
                  <tbody>
                    {report.byClass.map((row) => (
                      <tr key={row.classId}>
                        <TableCell>
                          {row.subject.name} <span className="text-xs text-[hsl(var(--muted-foreground))]">{row.subject.code}</span>
                        </TableCell>
                        <TableCell>
                          {row.section.department} · {row.section.course} · {row.section.semester} · {row.section.code}
                        </TableCell>
                        <TableCell>{row.faculty ? row.faculty.name : <span className="text-[hsl(var(--muted-foreground))]">Unassigned</span>}</TableCell>
                        <TableCell className={`text-right tabular-nums ${row.sessions === 0 ? 'text-amber-700 dark:text-amber-400' : ''}`}>{row.sessions}</TableCell>
                        <TableCell>
                          <AttendanceBar summary={row} />
                        </TableCell>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>Attendance shortages</CardTitle>
                <CardDescription>
                  Students under {report.threshold}% in this period, lowest first.
                  {report.shortagesTruncated && ` Showing the ${report.shortages.length} lowest of ${report.shortageTotal}; narrow the range or pick a department to see the rest. The export holds the listed students.`}
                </CardDescription>
              </div>
              {report.shortages.length > 0 && (
                <Button variant="outline" onClick={exportShortages}>
                  Export CSV
                </Button>
              )}
            </CardHeader>
            <CardContent className={report.shortages.length ? 'p-0' : ''}>
              {report.shortages.length === 0 ? (
                <EmptyState title="No shortages" description={`Every student with recorded sessions is at or above ${report.threshold}% for this period.`} />
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <TableHead>Student</TableHead>
                      <TableHead>Section</TableHead>
                      <TableHead className="text-right">Attended</TableHead>
                      <TableHead>Attendance</TableHead>
                    </tr>
                  </thead>
                  <tbody>
                    {report.shortages.map((row) => (
                      <tr key={row.student.id}>
                        <TableCell>
                          <Link href={`/dashboard/students/${row.student.id}`} className="font-semibold hover:underline">
                            {row.student.name}
                          </Link>
                          <span className="block text-xs text-[hsl(var(--muted-foreground))]">{row.student.studentCode}</span>
                        </TableCell>
                        <TableCell>{row.section ?? '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.attended}/{row.counted}
                        </TableCell>
                        <TableCell>
                          <AttendanceBar summary={row} />
                        </TableCell>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
