'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { EmptyState, ErrorState, Skeleton } from '@/components/feedback/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableCell, TableHead } from '@/components/ui/table';
import { getMyStudent } from '@/lib/student-api';
import type { Student } from '@/lib/student-api';
import { getMyTimetable } from '@/lib/timetable-api';
import type { TimetableEntry } from '@/lib/timetable-api';
import { listAssignments } from '@/lib/assignments-api';
import type { Assignment } from '@/lib/assignments-api';
import { getMyResults, listExams } from '@/lib/exams-api';
import type { Exam, Mark, Result } from '@/lib/exams-api';
import { getMyInvoices } from '@/lib/fees-api';
import type { Invoice } from '@/lib/fees-api';

const INVOICE_STATUS_BADGE: Record<string, string> = {
  PAID: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  PARTIALLY_PAID: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
  ISSUED: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  OVERDUE: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
  DRAFT: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  VOID: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200',
};

const SUBMISSION_STATUS_BADGE: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  SUBMITTED: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200',
  LATE: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
  GRADED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  DRAFT: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  RETURNED: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200',
};

const EXAM_STATUS_BADGE: Record<string, string> = {
  SCHEDULED: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
  COMPLETED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  CANCELLED: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
  DRAFT: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
};

function formatTime(dateOrStr: string): string {
  if (!dateOrStr) return '';
  if (dateOrStr.includes('T')) {
    const d = new Date(dateOrStr);
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }
  return dateOrStr.slice(0, 5);
}

function StatCard({
  label,
  value,
  sub,
  href,
  valueColor,
}: {
  label: string;
  value: string | number;
  sub?: string;
  href?: string;
  valueColor?: string;
}) {
  const content = (
    <Card className="transition-colors hover:border-[hsl(var(--primary))]/50">
      <CardContent className="pt-5">
        <p className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">{label}</p>
        <p className={`mt-2 text-2xl font-bold tracking-tight ${valueColor ?? ''}`}>{value}</p>
        {sub && <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{sub}</p>}
      </CardContent>
    </Card>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {content}
      </Link>
    );
  }
  return content;
}

export function StudentDashboardView() {
  const { user } = useAuth();
  const [student, setStudent] = useState<Student | null>(null);
  const [timetable, setTimetable] = useState<TimetableEntry[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const [stuRes, ttRes, assignRes, examsRes, resRes, invRes] = await Promise.allSettled([
        getMyStudent(),
        getMyTimetable(),
        listAssignments(new URLSearchParams({ page: '1', pageSize: '10' })),
        listExams(new URLSearchParams({ page: '1', pageSize: '10' })),
        getMyResults(),
        getMyInvoices(),
      ]);

      if (stuRes.status === 'fulfilled') {
        setStudent(stuRes.value);
      } else {
        throw stuRes.reason;
      }

      if (ttRes.status === 'fulfilled') setTimetable(ttRes.value);
      if (assignRes.status === 'fulfilled') setAssignments(assignRes.value.items);
      if (examsRes.status === 'fulfilled') setExams(examsRes.value.items);
      if (resRes.status === 'fulfilled') {
        setResults(resRes.value.results);
        setMarks(resRes.value.marks);
      }
      if (invRes.status === 'fulfilled') setInvoices(invRes.value);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Your student dashboard could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  if (error) {
    return <ErrorState message={error} onRetry={() => void loadData()} />;
  }

  if (loading && !student) {
    return (
      <div className="grid gap-6">
        <Skeleton className="h-32 w-full" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  const enrollment = student?.enrollments?.[0];
  if (!enrollment) {
    return (
      <EmptyState
        title="No current enrollment"
        description="Your profile is active, but no course placement is currently recorded. Please consult your academic registrar."
      />
    );
  }

  const { section } = enrollment;
  const { semester } = section;
  const { course } = semester;
  const department = course.department;

  const today = new Date();
  const todayDayOfWeek = today.getDay();
  const todayClasses = timetable
    .filter((entry) => entry.dayOfWeek === todayDayOfWeek)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  // Extract unique subjects from timetable
  const uniqueSubjects = Array.from(
    new Map(
      timetable
        .filter((t) => t.class?.subject)
        .map((t) => [t.class.subject.id, t.class.subject])
    ).values()
  );

  const pendingAssignments = assignments.filter(
    (a) => !a.mySubmission || a.mySubmission.status === 'DRAFT'
  );

  const upcomingExams = exams.filter(
    (e) => e.status === 'SCHEDULED' && new Date(e.endsOn) >= today
  );

  const outstandingInvoices = invoices.filter(
    (i) => i.status !== 'PAID' && i.status !== 'VOID'
  );
  const totalBalanceDue = outstandingInvoices.reduce(
    (acc, inv) => acc + (Number(inv.amountDue) || 0),
    0
  );
  const totalPaid = invoices
    .flatMap((i) => i.payments || [])
    .filter((p) => p.status === 'SUCCESS' || p.status === 'PAID')
    .reduce((acc, p) => acc + (Number(p.amount) || 0), 0);

  const avgPercentage =
    results.length > 0
      ? results.reduce((acc, curr) => acc + (curr.percentage ? Number(curr.percentage) : 0), 0) /
        results.length
      : null;

  const greeting = (() => {
    const hour = today.getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  const todayDateString = today.toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const studentDisplayName = student.firstName
    ? `${student.firstName} ${student.lastName}`
    : (user?.displayName ?? 'Student');

  return (
    <div className="grid gap-8">
      {/* ─── A. Welcome Section ────────────────────────────────────────────── */}
      <Card className="border-[hsl(var(--primary))]/30 bg-[hsl(var(--primary))]/5">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-5">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-widest text-[hsl(var(--primary))]">
              {department?.name ?? 'Department'} · Student Portal
            </p>
            <p className="text-2xl font-semibold">
              {greeting}, {studentDisplayName}
            </p>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              {todayDateString} · Enrolled in{' '}
              <span className="font-semibold text-[hsl(var(--foreground))]">
                {course.name} ({course.code})
              </span>
            </p>

            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-[hsl(var(--background))] border px-3 py-1 font-medium">
                Student ID: <strong>{student.studentCode}</strong>
              </span>
              <span className="rounded-full bg-[hsl(var(--background))] border px-3 py-1 font-medium">
                {semester.name}
              </span>
              <span className="rounded-full bg-[hsl(var(--background))] border px-3 py-1 font-medium">
                Section {section.code}
              </span>
              <span className="rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200 px-3 py-1 font-semibold">
                Status: {enrollment.status}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/timetable">
              <Button>My Timetable</Button>
            </Link>
            <Link href="/dashboard/assignments">
              <Button variant="outline">Assignments</Button>
            </Link>
            <Link href="/dashboard/exams/me">
              <Button variant="outline">Exams &amp; Results</Button>
            </Link>
            <Link href="/dashboard/fees">
              <Button variant="outline">Fees &amp; Payments</Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* ─── B. Academic Overview Cards ────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Attendance Status"
          value="75% Min"
          sub="Policy Requirement"
          href="#attendance-overview"
          valueColor="text-blue-600 dark:text-blue-400"
        />
        <StatCard
          label="Enrolled Subjects"
          value={uniqueSubjects.length > 0 ? uniqueSubjects.length : '—'}
          sub={`${course.code} · ${semester.name}`}
          href="/dashboard/timetable"
        />
        <StatCard
          label="Pending Coursework"
          value={pendingAssignments.length}
          sub={pendingAssignments.length > 0 ? 'Due for submission' : 'All up to date'}
          href="/dashboard/assignments"
          valueColor={pendingAssignments.length > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600'}
        />
        <StatCard
          label="Upcoming Exams"
          value={upcomingExams.length}
          sub={upcomingExams.length > 0 ? 'Scheduled term papers' : 'No upcoming papers'}
          href="/dashboard/exams"
        />
        <StatCard
          label="Fee Balance"
          value={totalBalanceDue > 0 ? `₹${totalBalanceDue.toLocaleString('en-IN')}` : '₹0 (Paid)'}
          sub={totalBalanceDue > 0 ? `${outstandingInvoices.length} invoice(s) due` : 'Paid in full'}
          href="/dashboard/fees"
          valueColor={totalBalanceDue > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600'}
        />
        <StatCard
          label="Academic Average"
          value={avgPercentage !== null ? `${avgPercentage.toFixed(1)}%` : '—'}
          sub={results.length > 0 ? `${results.length} exam(s) evaluated` : 'Evaluation awaited'}
          href="/dashboard/exams/me"
          valueColor={avgPercentage !== null && avgPercentage >= 75 ? 'text-emerald-600' : 'text-blue-600'}
        />
      </div>

      {/* ─── Two-Column: Today's Timetable & Coursework ──────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* ─── D. Today's Timetable ────────────────────────────────────────── */}
        <Card className="flex flex-col">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Today&apos;s Classes ({todayClasses.length})</CardTitle>
                <CardDescription>Scheduled lectures and laboratory sessions for today.</CardDescription>
              </div>
              <Link
                href="/dashboard/timetable"
                className="text-xs font-semibold text-[hsl(var(--primary))] underline underline-offset-4"
              >
                Full Timetable →
              </Link>
            </div>
          </CardHeader>
          <CardContent className="flex-1 p-0">
            {todayClasses.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  title="No classes scheduled for today"
                  description="You have no scheduled lectures for today. Check your full weekly timetable for upcoming classes."
                  action={
                    <Link href="/dashboard/timetable">
                      <Button variant="outline" className="text-xs min-h-8 h-8 px-3">
                        View Weekly Timetable
                      </Button>
                    </Link>
                  }
                />
              </div>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <TableHead>Time</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Faculty</TableHead>
                    <TableHead>Room</TableHead>
                  </tr>
                </thead>
                <tbody>
                  {todayClasses.map((entry) => (
                    <tr key={entry.id}>
                      <TableCell className="whitespace-nowrap text-xs font-semibold">
                        {formatTime(entry.startsAt)} – {formatTime(entry.endsAt)}
                      </TableCell>
                      <TableCell>
                        <p className="text-xs font-medium">{entry.class.subject.name}</p>
                        <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
                          {entry.class.subject.code}
                        </p>
                      </TableCell>
                      <TableCell className="text-xs">
                        {entry.class.faculty
                          ? `${entry.class.faculty.firstName} ${entry.class.faculty.lastName}`
                          : 'Assigned Instructor'}
                      </TableCell>
                      <TableCell className="text-xs font-medium">
                        {entry.room.code} ({entry.room.name})
                      </TableCell>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* ─── E. Assignments and Coursework ─────────────────────────────────── */}
        <Card className="flex flex-col">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Assignments &amp; Coursework ({assignments.length})</CardTitle>
                <CardDescription>Active course assignments and submission deadlines.</CardDescription>
              </div>
              <Link
                href="/dashboard/assignments"
                className="text-xs font-semibold text-[hsl(var(--primary))] underline underline-offset-4"
              >
                View All →
              </Link>
            </div>
          </CardHeader>
          <CardContent className="flex-1 p-0">
            {assignments.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  title="No coursework assigned"
                  description="You are currently up to date on all assignments for your enrolled subjects."
                />
              </div>
            ) : (
              <div className="divide-y">
                {assignments.slice(0, 5).map((a) => {
                  const isSubmitted = Boolean(a.mySubmission);
                  const isOverdue = a.dueAt && new Date() > new Date(a.dueAt) && !isSubmitted;
                  const submissionStatus = a.mySubmission?.status ?? (isOverdue ? 'LATE' : 'PENDING');

                  return (
                    <div key={a.id} className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold">{a.title}</p>
                          <p className="text-xs text-[hsl(var(--muted-foreground))]">
                            {a.class.subject.name} ({a.class.subject.code}) · Max: {a.maxMarks} marks
                          </p>
                        </div>
                        <div className="shrink-0 flex items-center gap-1.5">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                              SUBMISSION_STATUS_BADGE[submissionStatus] ?? 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {submissionStatus}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1 text-xs">
                        <span className="text-[hsl(var(--muted-foreground))]">
                          Due:{' '}
                          <strong className={isOverdue ? 'text-rose-600 font-semibold' : ''}>
                            {a.dueAt ? new Date(a.dueAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'No deadline'}
                          </strong>
                        </span>

                        <Link
                          href={`/dashboard/assignments/${a.id}`}
                          className="font-semibold text-[hsl(var(--primary))] underline"
                        >
                          {isSubmitted ? 'View Submission →' : 'Submit Work →'}
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── C. Attendance Overview ────────────────────────────────────────── */}
      <Card id="attendance-overview">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Attendance &amp; Academic Engagement</CardTitle>
              <CardDescription>
                Subject-wise registration and institutional attendance policy compliance.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-blue-50 dark:bg-blue-950/40 px-3 py-1 text-xs font-semibold text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                Mandatory Threshold: 75%
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-[var(--radius)] border bg-[hsl(var(--muted))]/30 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">Institutional Attendance Threshold</p>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  Under college academic regulations, students must maintain a minimum of 75% attendance in each course to be eligible for term-end examinations.
                </p>
              </div>
              <span className="text-xs font-bold text-emerald-700 bg-emerald-100 dark:bg-emerald-950 px-2.5 py-1 rounded-full">
                Active Enrolled Status
              </span>
            </div>
            <div className="mt-3 h-2.5 w-full rounded-full bg-[hsl(var(--muted))] overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full"
                style={{ width: '100%' }}
                aria-label="Attendance standing"
              />
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))] mb-2">
              Registered Subjects ({uniqueSubjects.length})
            </p>
            {uniqueSubjects.length === 0 ? (
              <p className="text-xs text-[hsl(var(--muted-foreground))]">
                No active subjects associated with your section timetable yet.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {uniqueSubjects.map((sub) => (
                  <div
                    key={sub.id}
                    className="rounded-[var(--radius)] border p-3 bg-[hsl(var(--background))] space-y-1"
                  >
                    <p className="text-xs font-bold text-[hsl(var(--primary))] uppercase tracking-wider">
                      {sub.code}
                    </p>
                    <p className="text-sm font-medium leading-tight">{sub.name}</p>
                    <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
                      Lecture sessions tracked via faculty attendance logs.
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="text-xs text-[hsl(var(--muted-foreground))] bg-[hsl(var(--background))] border rounded p-3">
            <strong>Note on Session Records:</strong> Class attendance sessions are recorded directly by faculty instructors during lecture hours. If any session discrepancy is observed, contact your respective subject faculty or department HOD within 48 hours.
          </div>
        </CardContent>
      </Card>

      {/* ─── Two-Column: Examinations & Results and Fee Overview ─────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* ─── F. Examinations and Results ───────────────────────────────────── */}
        <Card className="flex flex-col">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Examinations &amp; Results</CardTitle>
                <CardDescription>Term evaluation schedules and published report cards.</CardDescription>
              </div>
              <Link
                href="/dashboard/exams/me"
                className="text-xs font-semibold text-[hsl(var(--primary))] underline underline-offset-4"
              >
                Official Results →
              </Link>
            </div>
          </CardHeader>
          <CardContent className="flex-1 space-y-6">
            {/* Upcoming examinations */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))] mb-2">
                Upcoming Examination Schedule
              </p>
              {upcomingExams.length === 0 ? (
                <div className="rounded-[var(--radius)] border border-dashed p-4 text-center text-xs text-[hsl(var(--muted-foreground))]">
                  No upcoming examination papers scheduled at this time.
                </div>
              ) : (
                <div className="divide-y rounded-[var(--radius)] border">
                  {upcomingExams.map((exam) => (
                    <div key={exam.id} className="p-3 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold">{exam.name}</p>
                        <p className="text-xs text-[hsl(var(--muted-foreground))]">
                          {new Date(exam.startsOn).toLocaleDateString('en-IN')} – {new Date(exam.endsOn).toLocaleDateString('en-IN')}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          EXAM_STATUS_BADGE[exam.status] ?? 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {exam.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Published Results & Marks */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))] mb-2">
                Published Results ({results.length})
              </p>
              {results.length === 0 ? (
                <div className="rounded-[var(--radius)] border border-dashed p-4 text-center text-xs text-[hsl(var(--muted-foreground))]">
                  No official term report cards published yet.
                </div>
              ) : (
                <div className="divide-y rounded-[var(--radius)] border">
                  {results.slice(0, 3).map((res) => (
                    <div key={res.id} className="p-3 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold">{res.exam?.name ?? 'Exam'}</p>
                        <p className="text-xs text-[hsl(var(--muted-foreground))]">
                          Score: {res.totalMarks ?? '—'} · Percentage:{' '}
                          <strong>{res.percentage !== null && res.percentage !== undefined ? `${Number(res.percentage).toFixed(1)}%` : '—'}</strong>
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          res.status === 'PASSED'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                            : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200'
                        }`}
                      >
                        {res.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Subject Paper Marks Preview */}
            {marks.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))] mb-2">
                  Recent Paper Marks
                </p>
                <div className="divide-y rounded-[var(--radius)] border text-xs">
                  {marks.slice(0, 3).map((m) => (
                    <div key={m.id} className="p-2.5 flex items-center justify-between">
                      <div>
                        <p className="font-semibold">{m.examSubject?.subject?.name ?? 'Subject'}</p>
                        <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
                          {m.examSubject?.exam?.name}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold">
                          {m.isAbsent ? (
                            <span className="text-rose-600">ABSENT</span>
                          ) : (
                            `${m.marksObtained ?? 0} / ${m.examSubject?.maxMarks ?? 100}`
                          )}
                        </p>
                        {m.examSubject?.passMarks && !m.isAbsent && (
                          <p className="text-[10px] text-[hsl(var(--muted-foreground))]">
                            Pass: {m.examSubject.passMarks}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ─── G. Fee Overview ───────────────────────────────────────────────── */}
        <Card className="flex flex-col">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Fees &amp; Invoices</CardTitle>
                <CardDescription>Academic tuition billing, dues, and payment transactions.</CardDescription>
              </div>
              <Link
                href="/dashboard/fees"
                className="text-xs font-semibold text-[hsl(var(--primary))] underline underline-offset-4"
              >
                Manage Fees →
              </Link>
            </div>
          </CardHeader>
          <CardContent className="flex-1 space-y-4">
            {/* Summary counters */}
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="rounded-[var(--radius)] border p-3 bg-[hsl(var(--muted))]/20">
                <p className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">Total Paid</p>
                <p className="mt-1 text-xl font-bold text-emerald-600">
                  ₹{totalPaid.toLocaleString('en-IN')}
                </p>
              </div>
              <div className="rounded-[var(--radius)] border p-3 bg-[hsl(var(--muted))]/20">
                <p className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">Outstanding Due</p>
                <p className={`mt-1 text-xl font-bold ${totalBalanceDue > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                  ₹{totalBalanceDue.toLocaleString('en-IN')}
                </p>
              </div>
            </div>

            {/* Invoices List */}
            {invoices.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  title="No fee records found"
                  description="All institutional invoices and tuition fees are currently clear."
                />
              </div>
            ) : (
              <div className="divide-y rounded-[var(--radius)] border">
                {invoices.slice(0, 4).map((inv) => (
                  <div key={inv.id} className="p-3 flex items-center justify-between gap-2 text-xs">
                    <div>
                      <p className="font-semibold text-sm">
                        {inv.feeStructure?.name ?? inv.invoiceNumber}
                      </p>
                      <p className="text-[11px] text-[hsl(var(--muted-foreground))]">
                        Invoice #{inv.invoiceNumber} · Due:{' '}
                        {inv.dueOn ? new Date(inv.dueOn).toLocaleDateString('en-IN') : 'Immediate'}
                      </p>
                    </div>
                    <div className="text-right space-y-1">
                      <p className="font-bold text-sm">₹{Number(inv.amountDue).toLocaleString('en-IN')}</p>
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          INVOICE_STATUS_BADGE[inv.status] ?? 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {inv.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Link href="/dashboard/fees">
                <Button className="text-xs min-h-8 h-8 px-3">
                  {totalBalanceDue > 0 ? 'Proceed to Payment' : 'View Fee Receipts'}
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── H. Announcements & Academic Policies ─────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Academic Notices &amp; Institutional Guidelines</CardTitle>
              <CardDescription>Official semester policies, compliance mandates, and academic deadlines.</CardDescription>
            </div>
            <Link
              href="/dashboard/files"
              className="text-xs font-semibold text-[hsl(var(--primary))] underline underline-offset-4"
            >
              Academic Documents →
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-[var(--radius)] border p-4 bg-[hsl(var(--background))] space-y-1.5">
              <p className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--primary))]">Attendance Rule</p>
              <p className="text-sm font-semibold">75% Minimum Threshold</p>
              <p className="text-xs text-[hsl(var(--muted-foreground))] leading-relaxed">
                Mandatory attendance across all enrolled theory and lab subjects. Students falling below 75% require formal academic debarment review.
              </p>
            </div>

            <div className="rounded-[var(--radius)] border p-4 bg-[hsl(var(--background))] space-y-1.5">
              <p className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--primary))]">Coursework</p>
              <p className="text-sm font-semibold">Continuous Evaluation</p>
              <p className="text-xs text-[hsl(var(--muted-foreground))] leading-relaxed">
                Assignments submitted after cutoff dates may incur progressive grade deductions. Submit all deliverables before scheduled deadlines.
              </p>
            </div>

            <div className="rounded-[var(--radius)] border p-4 bg-[hsl(var(--background))] space-y-1.5">
              <p className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--primary))]">Examinations</p>
              <p className="text-sm font-semibold">Admit Cards &amp; Seating</p>
              <p className="text-xs text-[hsl(var(--muted-foreground))] leading-relaxed">
                Semester examination schedules are finalized one week in advance. Present your verified physical or digital college ID for paper entry.
              </p>
            </div>

            <div className="rounded-[var(--radius)] border p-4 bg-[hsl(var(--background))] space-y-1.5">
              <p className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--primary))]">Fee Clearance</p>
              <p className="text-sm font-semibold">Online Gateway Settlement</p>
              <p className="text-xs text-[hsl(var(--muted-foreground))] leading-relaxed">
                Pay semester fees seamlessly through CampusOS Razorpay gateway. Immediate downloadable receipts are available under the Fees section.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
