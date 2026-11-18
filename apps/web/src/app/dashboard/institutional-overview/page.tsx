'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '@/components/auth-provider';
import { AttendanceBar } from '@/components/attendance/attendance-bar';
import { BarList, STATUS_COLORS } from '@/components/charts/bar-list';
import { ColumnChart } from '@/components/charts/column-chart';
import { EmptyState, ErrorState, Skeleton } from '@/components/feedback/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/form-field';
import { Table, TableCell, TableHead } from '@/components/ui/table';
import { getInstitutionAnalytics } from '@/lib/analytics-api';
import type { InstitutionAnalytics } from '@/lib/analytics-api';
import { downloadCsv } from '@/lib/csv';

type Period = '30d' | '90d' | '6m' | '12m' | 'custom';
type Filters = { period: Period; from: string; to: string; departmentId: string; semester: string };

const PERIODS: Array<{ value: Period; label: string }> = [
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: '6m', label: 'Last 6 months' },
  { value: '12m', label: 'Last 12 months' },
  { value: 'custom', label: 'Custom range' },
];
const DEFAULT_FILTERS: Filters = { period: '6m', from: '', to: '', departmentId: '', semester: '' };

const DAY_MS = 86_400_000;
const isoDate = (date: Date): string => date.toISOString().slice(0, 10);
/** The dates a preset stands for. "Last 6 months" sends none: it is the server's default (this month and the five before). */
function presetRange(period: Period): { from?: string; to?: string } {
  if (period === '6m' || period === 'custom') return {};
  const today = new Date(`${new Date().toLocaleDateString('en-CA')}T00:00:00Z`);
  if (period === '12m') return { from: isoDate(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 11, 1))), to: isoDate(today) };
  return { from: isoDate(new Date(today.getTime() - (period === '30d' ? 29 : 89) * DAY_MS)), to: isoDate(today) };
}

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const inrCompact = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', notation: 'compact', maximumFractionDigits: 1 });
const countCompact = new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 });
const percent = (value: number | null): string => (value === null ? '—' : `${value}%`);
const plural = (count: number, one: string, many = `${one}s`): string => `${count.toLocaleString('en-IN')} ${count === 1 ? one : many}`;
const dateLabel = (value: string): string => new Date(`${value}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
/** Short month names; the first column and every January also carry the year. */
const monthLabel = (month: string, index: number): string =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', ...(index === 0 || month.endsWith('-01') ? { year: '2-digit' } : {}), timeZone: 'UTC' });

const INVOICE_STATUS: Record<string, { label: string; color: string }> = {
  PAID: { label: 'Paid', color: STATUS_COLORS.good },
  PARTIALLY_PAID: { label: 'Partially paid', color: STATUS_COLORS.warning },
  UNPAID: { label: 'Unpaid, not yet due', color: STATUS_COLORS.neutral },
  OVERDUE: { label: 'Overdue', color: STATUS_COLORS.critical },
  VOID: { label: 'Void', color: STATUS_COLORS.neutral },
};
const PAYMENT_STATUS: Record<string, { label: string; color: string }> = {
  COMPLETED: { label: 'Completed', color: STATUS_COLORS.good },
  PENDING: { label: 'Pending', color: STATUS_COLORS.warning },
  FAILED: { label: 'Failed', color: STATUS_COLORS.critical },
  REFUNDED: { label: 'Refunded', color: STATUS_COLORS.neutral },
};

function Tile({ label, value, sub, href }: { label: string; value: string; sub?: string; href?: string }) {
  const body = (
    <Card className={`h-full ${href ? 'transition hover:border-[hsl(var(--primary))]/40 hover:shadow-md' : ''}`}>
      <CardContent>
        <p className="text-sm font-medium text-[hsl(var(--muted-foreground))]">{label}</p>
        <p className="mt-2 text-[1.75rem] font-semibold leading-none tracking-tight">{value}</p>
        {sub && <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">{sub}</p>}
      </CardContent>
    </Card>
  );
  return href ? (
    <Link href={href} className="block h-full rounded-[var(--radius)]">
      {body}
    </Link>
  ) : (
    body
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius)] border bg-[hsl(var(--muted))]/40 px-3 py-2.5">
      <p className="text-xs text-[hsl(var(--muted-foreground))]">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function Panel({ title, description, action, children, className = '' }: { title: string; description?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 grow basis-[24rem]">
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {action}
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-6">{children}</CardContent>
    </Card>
  );
}

function Subheading({ children }: { children: ReactNode }) {
  return <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">{children}</h3>;
}

export default function InstitutionalOverviewPage() {
  const { user, loading: authLoading } = useAuth();
  // The analytics endpoint is for college Admin accounts (a SUPER_ADMIN-only account is not a college Admin).
  const isAdmin = Boolean(user?.roles?.includes('ADMIN'));

  const [data, setData] = useState<InstitutionAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [draft, setDraft] = useState({ from: '', to: '' });
  const latest = useRef(0);

  const load = async (next: Filters) => {
    const request = ++latest.current;
    setFilters(next);
    setRefreshing(true);
    const params = new URLSearchParams();
    const range = next.period === 'custom' ? { from: next.from, to: next.to } : presetRange(next.period);
    if (range.from) params.set('from', range.from);
    if (range.to) params.set('to', range.to);
    if (next.departmentId) params.set('departmentId', next.departmentId);
    if (next.semester) params.set('semester', next.semester);
    try {
      const result = await getInstitutionAnalytics(params);
      // A slower, older request must not overwrite the figures for the latest filters.
      if (request !== latest.current) return;
      setData(result);
      setDraft({ from: result.range.from, to: result.range.to });
      setError(null);
    } catch (reason) {
      if (request !== latest.current) return;
      setError(reason instanceof Error ? reason.message : 'The analytics could not be loaded.');
    } finally {
      if (request === latest.current) setRefreshing(false);
    }
  };

  useEffect(() => {
    // Load once the signed-in user is known to be an Admin.
    if (isAdmin) void load(DEFAULT_FILTERS);
  }, [isAdmin]);

  if (!authLoading && !isAdmin) {
    return <EmptyState title="Institutional analytics are for Admin" description="Ask your college Admin for these figures." />;
  }

  const departmentName = data?.options.departments.find((department) => department.id === filters.departmentId)?.name;
  const scopeText = [departmentName, filters.semester ? `semester ${filters.semester}` : null].filter(Boolean).join(', ');

  const exportComparison = () => {
    if (!data) return;
    downloadCsv(`department-comparison-${data.range.from}-to-${data.range.to}.csv`, [
      ['Department code', 'Department', 'Active students', 'Faculty', 'Students per faculty', 'Attendance %', `Students below ${data.threshold}%`, 'Assignment completion %', 'Pass % (papers)', 'Average score %', 'Collected (INR)', 'Outstanding (INR)'],
      ...data.departments.map((row) => [
        row.department.code,
        row.department.name,
        row.students,
        row.faculty,
        row.studentsPerFaculty,
        row.attendance,
        row.shortage,
        row.assignmentCompletion,
        row.passPercentage,
        row.averageScore,
        row.collected,
        row.outstanding,
      ]),
    ]);
  };

  // grid-cols-1 (minmax(0, 1fr)) keeps wide tables scrolling inside their card instead of widening the page.
  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 grow basis-[28rem]">
          <p className="text-sm font-semibold uppercase tracking-[.16em] text-[hsl(var(--primary))]">Admin</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Institutional Overview</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            {data ? (
              <>
                College analytics from {dateLabel(data.range.from)} to {dateLabel(data.range.to)}
                {scopeText ? ` for ${scopeText}` : ''}. Head counts and fee balances are as of today.
              </>
            ) : (
              'Students, faculty, attendance, academics and fees across the college.'
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/attendance/report">
            <Button variant="outline">Attendance report</Button>
          </Link>
          <Link href="/dashboard/exams">
            <Button variant="outline">Exams</Button>
          </Link>
          <Link href="/dashboard/fees">
            <Button variant="outline">Fees</Button>
          </Link>
        </div>
      </div>

      {/* Filters scope every figure below them. */}
      <div className="flex flex-wrap items-end gap-3 rounded-[var(--radius)] border bg-[hsl(var(--card))] p-4">
        <div className="w-44">
          <Select label="Period" value={filters.period} onChange={(event) => {
            const period = event.target.value as Period;
            if (period === 'custom') setFilters({ ...filters, period });
            else void load({ ...filters, period });
          }}>
            {PERIODS.map((period) => (
              <option key={period.value} value={period.value}>
                {period.label}
              </option>
            ))}
          </Select>
        </div>
        {filters.period === 'custom' && (
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void load({ ...filters, from: draft.from, to: draft.to });
            }}
          >
            <div className="w-40">
              <Input label="From" type="date" value={draft.from} max={draft.to || undefined} required onChange={(event) => setDraft({ ...draft, from: event.target.value })} />
            </div>
            <div className="w-40">
              <Input label="To" type="date" value={draft.to} min={draft.from || undefined} required onChange={(event) => setDraft({ ...draft, to: event.target.value })} />
            </div>
            <Button type="submit" loading={refreshing}>
              Apply
            </Button>
          </form>
        )}
        <div className="w-56">
          <Select label="Department" value={filters.departmentId} onChange={(event) => void load({ ...filters, departmentId: event.target.value })}>
            <option value="">All departments</option>
            {data?.options.departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-40">
          <Select label="Semester" value={filters.semester} onChange={(event) => void load({ ...filters, semester: event.target.value })}>
            <option value="">All semesters</option>
            {data?.options.semesters.map((semester) => (
              <option key={semester} value={String(semester)}>
                Semester {semester}
              </option>
            ))}
          </Select>
        </div>
        {(filters.period !== DEFAULT_FILTERS.period || filters.departmentId || filters.semester) && (
          <Button variant="ghost" onClick={() => void load(DEFAULT_FILTERS)}>
            Reset
          </Button>
        )}
      </div>

      {error && <ErrorState message={error} onRetry={() => void load(filters)} />}

      {!data && !error && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-28" />
          ))}
          <Skeleton className="h-72 sm:col-span-2 xl:col-span-6" />
        </div>
      )}

      {data && (
        // While new figures load, the current ones stay in place, dimmed.
        <div className={`grid grid-cols-1 gap-6 transition-opacity ${refreshing ? 'opacity-60' : ''}`} aria-busy={refreshing}>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
            <Tile label="Active students" value={data.students.active.toLocaleString('en-IN')} sub={`${plural(data.students.total, 'student')} on record · ${data.students.inactive.toLocaleString('en-IN')} inactive`} href="/dashboard/students" />
            <Tile
              label="Faculty"
              value={data.faculty.total.toLocaleString('en-IN')}
              sub={data.faculty.studentsPerFaculty === null ? 'No faculty yet' : `${data.faculty.studentsPerFaculty} students per faculty member`}
              href="/dashboard/faculty"
            />
            <Tile
              label="Attendance"
              value={percent(data.attendance.overall.percentage)}
              sub={data.attendance.overall.percentage === null ? 'No sessions in this period' : `${plural(data.attendance.shortage.students, 'student')} below ${data.threshold}%`}
              href="/dashboard/attendance/report"
            />
            <Tile
              label="Assignment completion"
              value={percent(data.academics.assignments.completion)}
              sub={data.academics.assignments.expected ? `${data.academics.assignments.submitted.toLocaleString('en-IN')} of ${plural(data.academics.assignments.expected, 'expected submission')}` : 'No assignments due in this period'}
              href="/dashboard/assignments"
            />
            <Tile
              label="Pass percentage"
              value={percent(data.academics.results.published ? data.academics.results.passPercentage : data.academics.papers.passPercentage)}
              sub={
                data.academics.results.published
                  ? `Of ${plural(data.academics.results.published, 'published result')}`
                  : data.academics.papers.entries
                    ? 'From approved marks; no results published yet'
                    : 'No approved marks in this period'
              }
              href="/dashboard/exams"
            />
            <Tile label="Fees collected" value={inrCompact.format(data.finance.collected)} sub={`${inrCompact.format(data.finance.outstanding)} outstanding · ${plural(data.finance.overdue.invoices, 'invoice')} overdue`} href="/dashboard/fees" />
          </div>

          <Panel
            title="Department comparison"
            description={`Attendance, assignments and marks for the period; students, faculty and outstanding fees as of today. Pass % and average score come from approved marks.`}
            action={
              <Button variant="outline" onClick={exportComparison} disabled={data.departments.length === 0}>
                Export CSV
              </Button>
            }
          >
            {data.departments.length === 0 ? (
              <EmptyState title="No departments yet" description="Departments appear here once they are set up." />
            ) : (
              <div className="-mx-5 -my-5">
                <Table>
                  <thead>
                    <tr>
                      <TableHead>Department</TableHead>
                      <TableHead className="text-right">Students</TableHead>
                      <TableHead className="text-right">Faculty</TableHead>
                      <TableHead className="text-right">Students / faculty</TableHead>
                      <TableHead>Attendance</TableHead>
                      <TableHead className="text-right">Below {data.threshold}%</TableHead>
                      <TableHead className="text-right">Assignments done</TableHead>
                      <TableHead className="text-right">Pass %</TableHead>
                      <TableHead className="text-right">Avg score</TableHead>
                      <TableHead className="text-right">Collected</TableHead>
                      <TableHead className="text-right">Outstanding</TableHead>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {data.departments.map((row) => (
                      <tr key={row.department.id}>
                        <TableCell className="min-w-[14rem]">
                          <Link href={`/dashboard/departments/${row.department.id}`} className="font-medium hover:text-[hsl(var(--primary))] hover:underline">
                            {row.department.name}
                          </Link>
                          <p className="text-xs text-[hsl(var(--muted-foreground))]">{row.department.code}</p>
                        </TableCell>
                        <TableCell className="text-right">{row.students.toLocaleString('en-IN')}</TableCell>
                        <TableCell className="text-right">{row.faculty.toLocaleString('en-IN')}</TableCell>
                        <TableCell className="text-right">{row.studentsPerFaculty ?? '—'}</TableCell>
                        <TableCell>
                          <AttendanceBar summary={{ percentage: row.attendance, belowThreshold: row.attendance !== null && row.attendance < data.threshold }} />
                        </TableCell>
                        <TableCell className="text-right">{row.shortage.toLocaleString('en-IN')}</TableCell>
                        <TableCell className="text-right">{percent(row.assignmentCompletion)}</TableCell>
                        <TableCell className="text-right">{percent(row.passPercentage)}</TableCell>
                        <TableCell className="text-right">{percent(row.averageScore)}</TableCell>
                        <TableCell className="text-right">{inr.format(row.collected)}</TableCell>
                        <TableCell className="text-right">{inr.format(row.outstanding)}</TableCell>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            )}
          </Panel>

          <div className="grid gap-6 xl:grid-cols-2">
            <Panel title="Students" description={`${plural(data.students.active, 'active student')} of ${data.students.total.toLocaleString('en-IN')} on record. Active means currently enrolled.`}>
              <div>
                <Subheading>New enrollments per month</Subheading>
                <ColumnChart
                  title="New enrollments per month"
                  data={data.students.enrollmentTrend.map((point, index) => ({ key: point.month, label: monthLabel(point.month, index), value: point.enrollments }))}
                  format={(value) => plural(value, 'enrollment')}
                  formatTick={(value) => countCompact.format(value)}
                  wholeNumbers
                />
              </div>
              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <Subheading>By semester</Subheading>
                  <BarList title="Active students by semester" rows={data.students.bySemester.map((row) => ({ key: String(row.semester), label: `Semester ${row.semester}`, value: row.students }))} />
                </div>
                <div>
                  <Subheading>By course</Subheading>
                  <BarList title="Active students by course" rows={data.students.byCourse.map((row) => ({ key: row.course.id, label: row.course.name, hint: row.course.code, value: row.students }))} />
                </div>
              </div>
            </Panel>

            <Panel title="Faculty" description="Faculty by designation and sign-in status. The semester filter doesn't apply to faculty.">
              <div className="grid gap-3 sm:grid-cols-4">
                <Figure label="Faculty" value={data.faculty.total.toLocaleString('en-IN')} />
                <Figure label="Signed in, active" value={data.faculty.active.toLocaleString('en-IN')} />
                <Figure label="Account disabled" value={data.faculty.inactive.toLocaleString('en-IN')} />
                <Figure label="No account" value={data.faculty.withoutAccount.toLocaleString('en-IN')} />
              </div>
              <div>
                <Subheading>By designation</Subheading>
                <BarList title="Faculty by designation" rows={data.faculty.byDesignation.map((row) => ({ key: row.designation, label: row.designation, value: row.faculty }))} />
              </div>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                Students per faculty member: <span className="font-semibold text-[hsl(var(--foreground))]">{data.faculty.studentsPerFaculty ?? '—'}</span>
                {data.faculty.studentsPerFaculty !== null && ' (active students ÷ faculty).'}
              </p>
            </Panel>

            <Panel
              title="Attendance"
              description={`${plural(data.attendance.sessions, 'session')} recorded in the period. Late counts as present; excused sessions are left out.`}
              action={
                <Link href="/dashboard/attendance/report" className="text-sm font-semibold text-[hsl(var(--primary))] hover:underline">
                  Full report →
                </Link>
              }
            >
              <div>
                <Subheading>Attendance by month</Subheading>
                <ColumnChart
                  title="Attendance by month"
                  max={100}
                  reference={{ value: data.threshold, label: `${data.threshold}% minimum attendance` }}
                  data={data.attendance.byMonth.map((point, index) => ({
                    key: point.month,
                    label: monthLabel(point.month, index),
                    value: point.percentage,
                    detail: point.counted ? `${point.attended} of ${point.counted} marked present` : undefined,
                  }))}
                  format={(value) => `${value}%`}
                />
              </div>
              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <Subheading>By semester</Subheading>
                  <BarList
                    title="Attendance by semester"
                    max={100}
                    rows={data.attendance.bySemester
                      .filter((row) => row.percentage !== null)
                      .map((row) => ({ key: String(row.semester), label: `Semester ${row.semester}`, value: row.percentage as number, display: `${row.percentage}%` }))}
                  />
                </div>
                <div>
                  <Subheading>Shortage</Subheading>
                  <p className="text-3xl font-semibold">{data.attendance.shortage.students.toLocaleString('en-IN')}</p>
                  <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                    {data.attendance.shortage.counted
                      ? `of ${plural(data.attendance.shortage.counted, 'student')} (${percent(data.attendance.shortage.percentage)}) are below ${data.threshold}% in this period.`
                      : 'No attendance recorded in this period.'}
                  </p>
                </div>
              </div>
            </Panel>

            <Panel title="Assignments" description="Assignments whose due date fell in the period and has passed. Submissions are counted against the students now enrolled in each class.">
              <div className="grid gap-3 sm:grid-cols-3">
                <Figure label="Assignments due" value={data.academics.assignments.due.toLocaleString('en-IN')} />
                <Figure label="Expected submissions" value={data.academics.assignments.expected.toLocaleString('en-IN')} />
                <Figure label="Completion" value={percent(data.academics.assignments.completion)} />
              </div>
              <BarList
                title="Assignment submissions"
                max={data.academics.assignments.expected}
                empty="No assignments were due in this period."
                rows={
                  data.academics.assignments.expected
                    ? [
                        { key: 'submitted', label: 'Submitted', value: data.academics.assignments.submitted },
                        { key: 'late', label: 'Submitted late', value: data.academics.assignments.late },
                        { key: 'graded', label: 'Graded', value: data.academics.assignments.graded },
                        { key: 'missing', label: 'Not submitted', value: data.academics.assignments.expected - data.academics.assignments.submitted },
                      ]
                    : []
                }
              />
            </Panel>
          </div>

          <Panel
            title="Examination performance"
            description="Exams that started in the period. Results: a student passes an exam by passing every paper. Papers: approved marks, paper by paper; absent counts as not passed."
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Figure label="Results published" value={data.academics.results.published.toLocaleString('en-IN')} />
              <Figure label="Pass percentage (results)" value={percent(data.academics.results.passPercentage)} />
              <Figure label="Average percentage (results)" value={percent(data.academics.results.averagePercentage)} />
              <Figure label="Papers with approved marks" value={`${data.academics.papers.approved} of ${data.academics.papers.total}`} />
            </div>
            {data.academics.exams.length === 0 ? (
              <EmptyState title="No exams in this period" description="Exams appear here once they are scheduled within the selected dates." />
            ) : (
              <div className="-mx-5 -mb-5">
                <Table>
                  <thead>
                    <tr>
                      <TableHead>Exam</TableHead>
                      <TableHead>Starts</TableHead>
                      <TableHead className="text-right">Papers approved</TableHead>
                      <TableHead className="text-right">Paper pass %</TableHead>
                      <TableHead className="text-right">Avg score</TableHead>
                      <TableHead className="text-right">Results</TableHead>
                      <TableHead className="text-right">Pass %</TableHead>
                      <TableHead className="text-right">Passed / failed</TableHead>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {data.academics.exams.map((exam) => (
                      <tr key={exam.id}>
                        <TableCell>
                          <Link href={`/dashboard/exams/${exam.id}`} className="font-medium hover:text-[hsl(var(--primary))] hover:underline">
                            {exam.name}
                          </Link>
                          <p className="text-xs capitalize text-[hsl(var(--muted-foreground))]">{exam.status.toLowerCase()}</p>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{dateLabel(exam.startsOn)}</TableCell>
                        <TableCell className="text-right">
                          {exam.approvedPapers} of {exam.papers}
                        </TableCell>
                        <TableCell className="text-right">{percent(exam.marks.passPercentage)}</TableCell>
                        <TableCell className="text-right">{percent(exam.marks.averageScore)}</TableCell>
                        <TableCell className="text-right">{exam.results.published ? exam.results.published.toLocaleString('en-IN') : 'Not published'}</TableCell>
                        <TableCell className="text-right">{percent(exam.results.passPercentage)}</TableCell>
                        <TableCell className="text-right">{exam.results.published ? `${exam.results.passed} / ${exam.results.failed}` : '—'}</TableCell>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            )}
          </Panel>

          <Panel
            title="Fees"
            description="Collections and payment attempts use the payment date. Billed, outstanding and invoice status are as of today. An invoice counts toward its fee structure's course, or else the student's current course."
            action={
              <Link href="/dashboard/fees" className="text-sm font-semibold text-[hsl(var(--primary))] hover:underline">
                Open fees →
              </Link>
            }
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <Figure label="Collected in period" value={inr.format(data.finance.collected)} />
              <Figure label="Billed (all invoices)" value={inr.format(data.finance.billed)} />
              <Figure label="Outstanding" value={inr.format(data.finance.outstanding)} />
              <Figure label="Overdue" value={`${inr.format(data.finance.overdue.amount)} · ${plural(data.finance.overdue.invoices, 'invoice')}`} />
              <Figure label="Collection rate" value={percent(data.finance.collectionRate)} />
            </div>
            <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <div>
                <Subheading>Collections by month</Subheading>
                <ColumnChart
                  title="Fees collected by month"
                  data={data.finance.trend.map((point, index) => ({ key: point.month, label: monthLabel(point.month, index), value: point.amount, detail: plural(point.payments, 'payment') }))}
                  format={(value) => inr.format(value)}
                  formatTick={(value) => inrCompact.format(value)}
                />
              </div>
              <div className="grid content-start gap-6">
                <div>
                  <Subheading>Invoice status (as of today)</Subheading>
                  <BarList
                    title="Invoices by status"
                    empty="No invoices issued yet."
                    rows={data.finance.invoiceStatus.map((row) => ({
                      key: row.status,
                      label: INVOICE_STATUS[row.status]?.label ?? row.status,
                      color: INVOICE_STATUS[row.status]?.color,
                      hint: `${plural(row.invoices, 'invoice')} · ${row.status === 'PAID' || row.status === 'VOID' ? 'invoiced' : 'still owed'}`,
                      value: row.amount,
                      display: inrCompact.format(row.amount),
                    }))}
                  />
                </div>
                <div>
                  <Subheading>Payment attempts in the period</Subheading>
                  <BarList
                    title="Payments by status"
                    empty="No payments in this period."
                    rows={data.finance.paymentStatus.map((row) => ({
                      key: row.status,
                      label: PAYMENT_STATUS[row.status]?.label ?? row.status,
                      color: PAYMENT_STATUS[row.status]?.color,
                      hint: inr.format(row.amount),
                      value: row.payments,
                    }))}
                  />
                </div>
              </div>
            </div>
            {data.finance.byCourse.length > 0 && (
              <div className="-mx-5 -mb-5">
                <Table>
                  <thead>
                    <tr>
                      <TableHead>Course</TableHead>
                      <TableHead className="text-right">Billed</TableHead>
                      <TableHead className="text-right">Collected in period</TableHead>
                      <TableHead className="text-right">Outstanding</TableHead>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {data.finance.byCourse.map((row) => (
                      <tr key={row.course.id}>
                        <TableCell>
                          <span className="font-medium">{row.course.name}</span>
                          <p className="text-xs text-[hsl(var(--muted-foreground))]">{row.course.code}</p>
                        </TableCell>
                        <TableCell className="text-right">{inr.format(row.billed)}</TableCell>
                        <TableCell className="text-right">{inr.format(row.collected)}</TableCell>
                        <TableCell className="text-right">{inr.format(row.outstanding)}</TableCell>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}
