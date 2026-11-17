'use client';

import { useCallback, useEffect, useState } from 'react';
import { EmptyState, ErrorState, Skeleton } from '@/components/feedback/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/form-field';
import { Pagination } from '@/components/ui/pagination';
import { Table, TableCell, TableHead } from '@/components/ui/table';
import { getMyAttendance } from '@/lib/attendance-api';
import type { AttendanceStatus, AttendanceSummary, MyAttendance, MyAttendanceDay } from '@/lib/attendance-api';

const PAGE_SIZE = 20;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const STATUS_BADGE: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  ABSENT: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
  LATE: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  EXCUSED: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
};

const currentMonth = (): string => new Date().toISOString().slice(0, 7);

function monthRange(month: string): { from: string; to: string } {
  const [year, monthIndex] = month.split('-').map(Number) as [number, number];
  const lastDay = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, '0')}` };
}

const formatDate = (isoDate: string): string =>
  new Date(isoDate).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

const formatPercentage = (summary: AttendanceSummary): string =>
  summary.percentage === null ? '—' : `${summary.percentage.toFixed(1)}%`;

/** Classes the student must attend in a row to get back to the threshold. */
function classesNeeded(summary: AttendanceSummary, threshold: number): number {
  const ratio = threshold / 100;
  if (summary.counted === 0 || summary.attended / summary.counted >= ratio) return 0;
  return Math.ceil((ratio * summary.counted - summary.attended) / (1 - ratio));
}

function percentageColor(summary: AttendanceSummary): string {
  if (summary.percentage === null) return '';
  return summary.belowThreshold ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400';
}

function MonthCalendar({ month, days }: { month: string; days: MyAttendanceDay[] }) {
  const [year, monthIndex] = month.split('-').map(Number) as [number, number];
  const firstWeekday = new Date(Date.UTC(year, monthIndex - 1, 1)).getUTCDay();
  const dayCount = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
  const byDate = new Map(days.map((day) => [day.date, day]));
  const cells: Array<number | null> = [...Array<null>(firstWeekday).fill(null), ...Array.from({ length: dayCount }, (_, i) => i + 1)];

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-[hsl(var(--muted-foreground))]">
        {WEEKDAYS.map((weekday) => (
          <div key={weekday} className="py-1">{weekday}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((dayNumber, index) => {
          if (dayNumber === null) return <div key={`blank-${index}`} />;
          const date = `${month}-${String(dayNumber).padStart(2, '0')}`;
          const day = byDate.get(date);
          const label = day
            ? `${formatDate(date)}: ${day.present} present, ${day.absent} absent, ${day.late} late, ${day.excused} excused`
            : `${formatDate(date)}: no classes recorded`;
          const tone = !day
            ? 'bg-[hsl(var(--background))]'
            : day.absent > 0
              ? 'border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40'
              : day.late > 0
                ? 'border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40'
                : 'border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40';
          return (
            <div key={date} aria-label={label} title={label} className={`min-h-14 rounded border p-1.5 text-xs ${tone}`}>
              <p className="font-semibold">{dayNumber}</p>
              {day && (
                <p className="mt-1 text-[10px] leading-tight text-[hsl(var(--muted-foreground))]">
                  {day.counted + day.excused} class{day.counted + day.excused > 1 ? 'es' : ''}
                  {day.absent > 0 ? ` · ${day.absent} missed` : ''}
                </p>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-[hsl(var(--muted-foreground))]">
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded border border-emerald-300 bg-emerald-50" /> All attended</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded border border-amber-300 bg-amber-50" /> Late</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded border border-red-300 bg-red-50" /> Missed a class</span>
      </div>
    </div>
  );
}

export default function MyAttendancePage() {
  const [data, setData] = useState<MyAttendance | null>(null);
  const [subjectId, setSubjectId] = useState('');
  const [month, setMonth] = useState(currentMonth);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (subjectId) query.set('subjectId', subjectId);
    if (month) {
      const { from, to } = monthRange(month);
      query.set('from', from);
      query.set('to', to);
    }
    try {
      setData(await getMyAttendance(query));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Your attendance could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [month, page, subjectId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!data) return <Skeleton className="h-96 w-full" />;

  const { overall, threshold, subjects, records } = data;
  const shortSubjects = subjects.filter((subject) => subject.belowThreshold);
  const pageCount = Math.max(1, Math.ceil(records.total / records.pageSize));

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-3xl font-semibold">My Attendance</h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          Attendance recorded by your faculty. Late counts as attended; excused classes are not counted against you. The minimum is {threshold}% in every subject.
        </p>
      </div>

      {overall.counted === 0 ? (
        <EmptyState title="No attendance recorded yet" description="Your attendance will appear here once your faculty start marking classes." />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <Card className="sm:col-span-3 lg:col-span-2">
              <CardContent className="pt-5">
                <p className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">Overall attendance</p>
                <p className={`mt-2 text-4xl font-bold tracking-tight ${percentageColor(overall)}`}>{formatPercentage(overall)}</p>
                <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                  {overall.attended} of {overall.counted} classes attended
                </p>
                <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-[hsl(var(--muted))]">
                  <div
                    className={`h-full rounded-full ${overall.belowThreshold ? 'bg-rose-500' : 'bg-emerald-500'}`}
                    style={{ width: `${overall.percentage ?? 0}%` }}
                    role="progressbar"
                    aria-label="Overall attendance"
                    aria-valuenow={overall.percentage ?? 0}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  />
                </div>
              </CardContent>
            </Card>
            {([
              ['Present', overall.present],
              ['Absent', overall.absent],
              ['Late', overall.late],
              ['Excused', overall.excused],
            ] as const).map(([label, value]) => (
              <Card key={label}>
                <CardContent className="pt-5">
                  <p className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">{label}</p>
                  <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {shortSubjects.length > 0 && (
            <div role="alert" className="rounded-[var(--radius)] border border-rose-300 bg-rose-50 p-4 text-sm dark:border-rose-900 dark:bg-rose-950/40">
              <p className="font-semibold text-rose-800 dark:text-rose-200">
                Attendance below {threshold}% in {shortSubjects.length} subject{shortSubjects.length > 1 ? 's' : ''}
              </p>
              <ul className="mt-2 grid gap-1 text-rose-800 dark:text-rose-200">
                {shortSubjects.map((subject) => (
                  <li key={subject.subject.id}>
                    {subject.subject.name}: {formatPercentage(subject)}. Attend the next {classesNeeded(subject, threshold)} class
                    {classesNeeded(subject, threshold) > 1 ? 'es' : ''} to get back to {threshold}%.
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Subject-wise attendance</CardTitle>
              <CardDescription>Every subject you have attendance records for.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <thead>
                  <tr>
                    <TableHead>Subject</TableHead>
                    <TableHead>Faculty</TableHead>
                    <TableHead>Present</TableHead>
                    <TableHead>Absent</TableHead>
                    <TableHead>Late</TableHead>
                    <TableHead>Excused</TableHead>
                    <TableHead>Attendance</TableHead>
                  </tr>
                </thead>
                <tbody>
                  {subjects.map((subject) => (
                    <tr key={subject.subject.id}>
                      <TableCell>
                        <p className="font-medium">{subject.subject.name}</p>
                        <p className="text-xs text-[hsl(var(--muted-foreground))]">{subject.subject.code}</p>
                      </TableCell>
                      <TableCell>{subject.faculty ? `${subject.faculty.firstName} ${subject.faculty.lastName}` : '—'}</TableCell>
                      <TableCell>{subject.present}</TableCell>
                      <TableCell>{subject.absent}</TableCell>
                      <TableCell>{subject.late}</TableCell>
                      <TableCell>{subject.excused}</TableCell>
                      <TableCell>
                        <span className={`font-semibold ${percentageColor(subject)}`}>{formatPercentage(subject)}</span>
                        {subject.belowThreshold && (
                          <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800 dark:bg-rose-950 dark:text-rose-200">
                            Short
                          </span>
                        )}
                      </TableCell>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Attendance history</CardTitle>
          <CardDescription>Filter by subject or month. Clear the month to see every date.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Select
              label="Subject"
              value={subjectId}
              onChange={(event) => {
                setSubjectId(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All subjects</option>
              {subjects.map((subject) => (
                <option key={subject.subject.id} value={subject.subject.id}>
                  {subject.subject.name} ({subject.subject.code})
                </option>
              ))}
            </Select>
            <Input
              label="Month"
              type="month"
              value={month}
              onChange={(event) => {
                setMonth(event.target.value);
                setPage(1);
              }}
            />
            <Button
              variant="outline"
              disabled={!month && !subjectId}
              onClick={() => {
                setMonth('');
                setSubjectId('');
                setPage(1);
              }}
            >
              Clear filters
            </Button>
          </div>

          {month && <MonthCalendar month={month} days={data.days} />}

          {loading ? (
            <Skeleton className="h-40 w-full" />
          ) : records.total === 0 ? (
            <EmptyState title="No records for this filter" description="Try another subject or month." />
          ) : (
            <>
              <Table>
                <thead>
                  <tr>
                    <TableHead>Date</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Note</TableHead>
                  </tr>
                </thead>
                <tbody>
                  {records.items.map((record) => (
                    <tr key={record.id}>
                      <TableCell className="whitespace-nowrap">{formatDate(record.heldOn)}</TableCell>
                      <TableCell>
                        {record.subject.name}
                        <span className="ml-1 text-xs text-[hsl(var(--muted-foreground))]">({record.subject.code})</span>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE[record.status]}`}>{record.status}</span>
                      </TableCell>
                      <TableCell className="text-[hsl(var(--muted-foreground))]">{record.note ?? '—'}</TableCell>
                    </tr>
                  ))}
                </tbody>
              </Table>
              {pageCount > 1 && <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
