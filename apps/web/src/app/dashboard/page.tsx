'use client';

import { useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { listStudents } from '@/lib/student-api';
import { listFaculty, listDepartments, getMyFaculty, type Faculty } from '@/lib/faculty-api';
import {
  getMyAssignmentStats,
  listTasks,
  listMyAssignments,
  updateMyAssignmentStatus,
  submitTask,
  type Task,
  type TaskAssignment,
  type TaskStats,
} from '@/lib/tasks-api';
import { getMyTimetable, type TimetableEntry } from '@/lib/timetable-api';
import { listClasses, listAttendance, listMyClasses, type ClassRecord, type AttendanceSession, type MyClass } from '@/lib/attendance-api';
import { AUDIENCE_LABEL, listAnnouncements, type Announcement } from '@/lib/announcements-api';
import { listAssignments, type Assignment } from '@/lib/assignments-api';
import { listExams, type Exam } from '@/lib/exams-api';
import { Dialog } from '@/components/ui/interactive';
import { Table, TableCell, TableHead } from '@/components/ui/table';
import { EmptyState, Skeleton } from '@/components/feedback/states';
import { StudentDashboardView } from '@/components/dashboard/student-dashboard-view';
import { MarksReviewQueue } from '@/components/dashboard/marks-review-queue';
import { useTaskEvents, TASK_EVENTS } from '@/lib/use-socket';
import { NavIcon } from '@/lib/navigation';

type Tone = 'blue' | 'emerald' | 'violet' | 'amber' | 'rose' | 'sky';
type QuickStat = { label: string; value: string | number; sub?: string; href?: string; icon?: string; tone?: Tone };

const TONE_CLASSES: Record<Tone, string> = {
  blue: 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
  emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
  violet: 'bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300',
  amber: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
  rose: 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300',
  sky: 'bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300',
};

function StatCard({ label, value, sub, href, icon, tone = 'blue' }: QuickStat) {
  const inner = (
    <Card className={`h-full ${href ? 'transition hover:border-[hsl(var(--primary))]/40 hover:shadow-md' : ''}`}>
      <CardContent className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[hsl(var(--muted-foreground))]">{label}</p>
          <p className="mt-2 text-[1.75rem] font-bold leading-none tracking-tight tabular-nums">{value}</p>
          {sub && <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">{sub}</p>}
        </div>
        {icon && (
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${TONE_CLASSES[tone]}`} aria-hidden="true">
            <NavIcon name={icon} className="h-5 w-5" />
          </span>
        )}
      </CardContent>
    </Card>
  );
  return href ? (
    <Link href={href} className="block h-full rounded-[var(--radius)]">
      {inner}
    </Link>
  ) : (
    inner
  );
}

function NavCard({ title, description, href, label, icon }: { title: string; description: string; href: string; label: string; icon?: string }) {
  return (
    <Link href={href} className="group block h-full rounded-[var(--radius)]">
      <Card className="flex h-full flex-col transition group-hover:border-[hsl(var(--primary))]/40 group-hover:shadow-md">
        <CardContent className="flex flex-1 gap-4">
          {icon && (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--sidebar-active))] text-[hsl(var(--sidebar-active-foreground))]" aria-hidden="true">
              <NavIcon name={icon} className="h-5 w-5" />
            </span>
          )}
          <div className="min-w-0">
            <h3 className="font-semibold">{title}</h3>
            <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{description}</p>
            <p className="mt-3 text-sm font-semibold text-[hsl(var(--primary))]">
              {label} <span className="inline-block transition-transform group-hover:translate-x-0.5">→</span>
            </p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function SectionHeading({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {description && <p className="text-sm text-[hsl(var(--muted-foreground))]">{description}</p>}
      </div>
      {action}
    </div>
  );
}

function WelcomeBanner({ eyebrow, title, subtitle, actions }: { eyebrow: string; title: string; subtitle: ReactNode; actions?: ReactNode }) {
  return (
    <Card className="relative overflow-hidden border-[hsl(var(--primary))]/20">
      <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-[hsl(var(--sidebar-active))] to-transparent" aria-hidden="true" />
      <CardContent className="relative flex flex-wrap items-center justify-between gap-4 py-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.12em] text-[hsl(var(--primary))]">{eyebrow}</p>
          <h1 className="mt-1.5 text-2xl font-bold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{subtitle}</p>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </CardContent>
    </Card>
  );
}

const PRIORITY_BADGE: Record<string, string> = {
  LOW: 'bg-gray-100 text-gray-700',
  MEDIUM: 'bg-blue-100 text-blue-700',
  HIGH: 'bg-amber-100 text-amber-700',
  URGENT: 'bg-red-100 text-red-700',
};

const TASK_STATUS_BADGE: Record<string, string> = {
  PENDING: 'bg-gray-100 text-gray-700',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  SUBMITTED: 'bg-purple-100 text-purple-700',
  APPROVED: 'bg-green-100 text-green-700',
  REWORK: 'bg-red-100 text-red-700',
};

function Badge({ value, map }: { value: string; map: Record<string, string> }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${map[value] ?? 'bg-gray-100 text-gray-700'}`}>
      {value.replace(/_/g, ' ')}
    </span>
  );
}

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


// ─── Admin Dashboard ──────────────────────────────────────────────────────────
function AdminDashboard() {
  const [stats, setStats] = useState<{ students: number; faculty: number; departments: number } | null>(null);
  const [taskStats, setTaskStats] = useState<TaskStats | null>(null);
  const [pendingVisitors, setPendingVisitors] = useState(0);

  const loadTaskStats = useCallback(() => {
    getMyAssignmentStats().then(setTaskStats).catch(() => undefined);
  }, []);

  useEffect(() => {
    const p = new URLSearchParams({ page: '1', pageSize: '1' });
    Promise.all([
      listStudents(p),
      listFaculty(p),
      listDepartments(p),
      getMyAssignmentStats(),
    ]).then(([s, f, d, ts]) => {
      setStats({ students: s.total, faculty: f.total, departments: d.total });
      setTaskStats(ts);
    }).catch(() => undefined);

    // Visitor pending count
    import('@/lib/visitors-api').then(({ listVisitors }) => {
      listVisitors(new URLSearchParams({ status: 'PENDING', page: '1', pageSize: '1' }))
        .then((r) => setPendingVisitors(r.total))
        .catch(() => undefined);
    });
  }, []);

  useTaskEvents(
    [
      TASK_EVENTS.CREATED,
      TASK_EVENTS.ASSIGNED,
      TASK_EVENTS.STARTED,
      TASK_EVENTS.SUBMITTED,
      TASK_EVENTS.REVIEWED,
      TASK_EVENTS.UPDATED,
    ],
    () => {
      loadTaskStats();
    },
  );

  return (
    <div className="grid gap-8">
      {/* Stat row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Students" value={stats?.students ?? '…'} href="/dashboard/students" icon="students" tone="blue" />
        <StatCard label="Total Faculty" value={stats?.faculty ?? '…'} href="/dashboard/faculty" icon="faculty" tone="violet" />
        <StatCard label="Departments" value={stats?.departments ?? '…'} href="/dashboard/departments" icon="department" tone="emerald" />
        <StatCard
          label="Pending Visitors"
          value={pendingVisitors}
          sub="Awaiting approval"
          href="/dashboard/visitors"
          icon="visitors"
          tone="amber"
        />
      </div>

      <MarksReviewQueue />

      {/* Visitor notification banner */}
      {pendingVisitors > 0 && (
        <Link href="/dashboard/visitors">
          <div className="flex items-center gap-3 rounded-[var(--radius)] border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-700 dark:bg-amber-950">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-white">
              {pendingVisitors}
            </span>
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              {pendingVisitors} visitor request{pendingVisitors !== 1 ? 's' : ''} pending your approval
            </p>
            <span className="ml-auto text-sm font-semibold text-amber-700 dark:text-amber-300">Review →</span>
          </div>
        </Link>
      )}

      {/* Three admin sections */}
      <div className="grid gap-3">
        <SectionHeading title="Administration" description="Where the college's day-to-day management happens." />
        <div className="grid gap-4 md:grid-cols-3">
          <NavCard
            title="Institutional Overview"
            description="Students, faculty, departments, attendance summary and exam performance across the college."
            href="/dashboard/institutional-overview"
            label="Open overview"
            icon="analytics"
          />
          <NavCard
            title="Task Management"
            description="Create tasks, assign them to HODs or faculty, track progress and review completed work."
            href="/dashboard/tasks"
            label="Open tasks"
            icon="tasks"
          />
          <NavCard
            title="Faculty Performance"
            description="Classes, attendance marked, work waiting for evaluation and overdue tasks for each faculty member."
            href="/dashboard/faculty-performance"
            label="Open report"
            icon="performance"
          />
        </div>
      </div>

      {/* Task summary */}
      {taskStats && (
        <div className="grid gap-3">
          <SectionHeading title="Task progress" description="Tasks you have assigned, by status." />
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard label="Pending Tasks" value={taskStats.pending} href="/dashboard/tasks" />
            <StatCard label="In Progress" value={taskStats.inProgress} href="/dashboard/tasks" />
            <StatCard label="Submitted" value={taskStats.submitted} sub="Awaiting review" href="/dashboard/tasks" />
            <StatCard label="Approved" value={taskStats.approved} href="/dashboard/tasks" />
            <StatCard label="Needs Rework" value={taskStats.rework} href="/dashboard/tasks" />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── HOD Dashboard ────────────────────────────────────────────────────────────
function HodDashboard() {
  const { user } = useAuth();
  const [faculty, setFaculty] = useState<Faculty[]>([]);
  const [deptName, setDeptName] = useState<string | null>(null);
  const [taskStats, setTaskStats] = useState<TaskStats | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [pendingVisitors, setPendingVisitors] = useState(0);
  const [loading, setLoading] = useState(true);

  const refreshTasks = useCallback(() => {
    const taskParams = new URLSearchParams({ page: '1', pageSize: '50' });
    Promise.all([
      getMyAssignmentStats(),
      listTasks(taskParams),
    ]).then(([ts, tRes]) => {
      setTaskStats(ts);
      setTasks(tRes.items);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    const facultyParams = new URLSearchParams({ page: '1', pageSize: '50' });
    const taskParams = new URLSearchParams({ page: '1', pageSize: '50' });

    Promise.all([
      listFaculty(facultyParams),
      getMyAssignmentStats(),
      listTasks(taskParams),
    ]).then(([fRes, ts, tRes]) => {
      setFaculty(fRes.items);
      const dept = fRes.items.find((f) => f.department)?.department;
      if (dept) setDeptName(dept.name);
      setTaskStats(ts);
      setTasks(tRes.items);
      setLoading(false);
    }).catch(() => setLoading(false));

    // Pending visitor count — dynamic import to match admin pattern
    import('@/lib/visitors-api').then(({ listVisitors }) => {
      listVisitors(new URLSearchParams({ status: 'PENDING', page: '1', pageSize: '1' }))
        .then((r) => setPendingVisitors(r.total))
        .catch(() => undefined);
    });
  }, []);

  useTaskEvents(
    [
      TASK_EVENTS.CREATED,
      TASK_EVENTS.ASSIGNED,
      TASK_EVENTS.STARTED,
      TASK_EVENTS.SUBMITTED,
      TASK_EVENTS.REVIEWED,
      TASK_EVENTS.UPDATED,
    ],
    () => {
      refreshTasks();
    },
  );

  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  const submittedTasks = tasks.filter((t) => (t.assignments ?? []).some((a) => a.status === 'SUBMITTED'));

  return (
    <div className="grid gap-8">
      {/* Welcome banner */}
      <WelcomeBanner
        eyebrow={`${deptName ?? 'Department'} · HOD Portal`}
        title={`${greeting}, ${user?.displayName ?? 'HOD'}`}
        subtitle={today}
        actions={
          <>
            <Link href="/dashboard/tasks/new">
              <Button>+ Create Task</Button>
            </Link>
            <Link href="/dashboard/hod-overview">
              <Button variant="outline">Department Overview</Button>
            </Link>
          </>
        }
      />

      <MarksReviewQueue />

      {/* Visitor pending notification */}
      {pendingVisitors > 0 && (
        <Link href="/dashboard/visitors">
          <div className="flex items-center gap-3 rounded-[var(--radius)] border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-700 dark:bg-amber-950">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-white">
              {pendingVisitors}
            </span>
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              {pendingVisitors} visitor request{pendingVisitors !== 1 ? 's' : ''} pending your approval
            </p>
            <span className="ml-auto text-sm font-semibold text-amber-700 dark:text-amber-300">Review →</span>
          </div>
        </Link>
      )}

      {/* Key stats */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i}><CardContent className="pt-5"><div className="h-8 w-16 animate-pulse rounded bg-[hsl(var(--muted))]" /><div className="mt-2 h-4 w-24 animate-pulse rounded bg-[hsl(var(--muted))]" /></CardContent></Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Faculty in Department" value={faculty.length} href="/dashboard/faculty" icon="faculty" tone="violet" />
          <StatCard label="Pending Tasks" value={taskStats?.pending ?? 0} href="/dashboard/tasks" icon="tasks" tone="blue" />
          <StatCard label="Submissions to Review" value={submittedTasks.length} sub="Awaiting your review" href="/dashboard/tasks" icon="assignments" tone="emerald" />
          <StatCard label="Pending Visitors" value={pendingVisitors} sub="Awaiting approval" href="/dashboard/visitors" icon="visitors" tone="amber" />
        </div>
      )}

      {/* Task progress summary */}
      {taskStats && (
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Pending" value={taskStats.pending} href="/dashboard/tasks" />
          <StatCard label="In Progress" value={taskStats.inProgress} href="/dashboard/tasks" />
          <StatCard label="Submitted" value={taskStats.submitted} sub="Awaiting review" href="/dashboard/tasks" />
          <StatCard label="Approved" value={taskStats.approved} />
          <StatCard label="Needs Rework" value={taskStats.rework} />
        </div>
      )}

      {/* Faculty & navigation grid */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Faculty quick list */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Department Faculty</CardTitle>
            <CardDescription>
              {faculty.length} faculty member{faculty.length !== 1 ? 's' : ''} in {deptName ?? 'your department'}.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {faculty.length === 0 ? (
              <div className="p-6">
                <p className="text-sm text-[hsl(var(--muted-foreground))]">No faculty assigned to your department yet.</p>
              </div>
            ) : (
              <div className="divide-y">
                {faculty.slice(0, 6).map((f) => (
                  <div key={f.id} className="flex items-center justify-between px-5 py-3">
                    <div>
                      <p className="text-sm font-medium">{f.firstName} {f.lastName}</p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">{f.employeeCode}</p>
                    </div>
                    <Link href={`/dashboard/faculty/${f.id}`} className="text-xs font-semibold text-[hsl(var(--primary))] underline underline-offset-4">
                      View
                    </Link>
                  </div>
                ))}
                {faculty.length > 6 && (
                  <div className="px-5 py-3">
                    <Link href="/dashboard/faculty" className="text-sm font-semibold text-[hsl(var(--primary))] underline underline-offset-4">
                      View all {faculty.length} faculty →
                    </Link>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick navigation */}
        <div className="grid gap-4 content-start">
          <NavCard title="Task Management" description="Create, assign, and review departmental tasks." href="/dashboard/tasks" label="Open Tasks" icon="tasks" />
          <NavCard title="Visitor Approvals" description="Review and approve campus visitor requests." href="/dashboard/visitors" label="Open Visitors" icon="visitors" />
          <NavCard title="Attendance" description="Mark and review attendance for department classes." href="/dashboard/attendance" label="Open Attendance" icon="attendance" />
        </div>
      </div>

      {/* Submissions needing review */}
      {submittedTasks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending Submissions ({submittedTasks.length})</CardTitle>
            <CardDescription>Faculty submissions awaiting your review.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {submittedTasks.map((t) => (
                <div key={t.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm font-medium">{t.title}</p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      Deadline: {new Date(t.deadline).toLocaleDateString('en-IN')}
                    </p>
                  </div>
                  <Link href={`/dashboard/tasks/${t.id}`}>
                    <Button variant="outline" className="text-xs">Review</Button>
                  </Link>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Academic modules */}
      <div className="grid gap-4 md:grid-cols-3">
        <NavCard title="Exams & Results" description="Schedule exams and review marks for your department." href="/dashboard/exams" label="Open Exams" icon="exams" />
        <NavCard title="Assignments" description="Coursework published in your department and its submissions." href="/dashboard/assignments" label="Open Assignments" icon="assignments" />
        <NavCard title="Timetable" description="Class timetables for your department." href="/dashboard/timetable" label="Open Timetable" icon="timetable" />
      </div>
    </div>
  );
}

// ─── Faculty Dashboard ────────────────────────────────────────────────────────
function FacultyDashboard() {
  const { user } = useAuth();
  const [faculty, setFaculty] = useState<Faculty | null>(null);
  const [taskStats, setTaskStats] = useState<TaskStats | null>(null);
  const [assignments, setAssignments] = useState<TaskAssignment[]>([]);
  const [timetable, setTimetable] = useState<TimetableEntry[]>([]);
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [attendance, setAttendance] = useState<AttendanceSession[]>([]);
  const [coursework, setCoursework] = useState<Assignment[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [myClasses, setMyClasses] = useState<MyClass[] | null>(null);
  const [todaysSessions, setTodaysSessions] = useState<AttendanceSession[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[] | null>(null);
  const [loading, setLoading] = useState(true);

  // Work submission dialog
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [activeAssignmentId, setActiveAssignmentId] = useState<string | null>(null);
  const [submissionContent, setSubmissionContent] = useState('');
  const [submittingWork, setSubmittingWork] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const loadData = async () => {
    try {
      // Today in the user's time zone, to find classes on today's timetable that still need attendance.
      const today = new Date().toLocaleDateString('en-CA');
      const [facRes, statsRes, myAssignRes, ttRes, classRes, attRes, assignRes, examRes, myClassesRes, todayRes, annRes] = await Promise.all([
        getMyFaculty().catch(() => null),
        getMyAssignmentStats().catch(() => null),
        listMyAssignments(new URLSearchParams({ page: '1', pageSize: '10' })).catch(() => ({ items: [] as TaskAssignment[], total: 0, page: 1, pageSize: 10 })),
        getMyTimetable().catch(() => [] as TimetableEntry[]),
        listClasses(new URLSearchParams({ page: '1', pageSize: '10' })).catch(() => ({ items: [] as ClassRecord[], total: 0, page: 1, pageSize: 10 })),
        listAttendance(new URLSearchParams({ page: '1', pageSize: '5' })).catch(() => ({ items: [] as AttendanceSession[], total: 0, page: 1, pageSize: 5 })),
        listAssignments(new URLSearchParams({ page: '1', pageSize: '5' })).catch(() => ({ items: [] as Assignment[], total: 0, page: 1, pageSize: 5 })),
        listExams(new URLSearchParams({ page: '1', pageSize: '5' })).catch(() => ({ items: [] as Exam[], total: 0, page: 1, pageSize: 5 })),
        listMyClasses().catch(() => null),
        listAttendance(new URLSearchParams({ from: today, to: today, page: '1', pageSize: '100' })).catch(() => ({ items: [] as AttendanceSession[], total: 0, page: 1, pageSize: 100 })),
        listAnnouncements(new URLSearchParams({ pageSize: '3' })).catch(() => null),
      ]);

      setFaculty(facRes);
      setTaskStats(statsRes);
      setAssignments(myAssignRes.items);
      setTimetable(ttRes);
      setClasses(classRes.items);
      setAttendance(attRes.items);
      setCoursework(assignRes.items);
      setExams(examRes.items);
      setMyClasses(myClassesRes);
      setTodaysSessions(todayRes.items);
      setAnnouncements(annRes ? annRes.items : null);
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const refreshFacultyTasks = useCallback(() => {
    Promise.all([
      getMyAssignmentStats().catch(() => null),
      listMyAssignments(new URLSearchParams({ page: '1', pageSize: '10' })).catch(() => ({ items: [] as TaskAssignment[], total: 0, page: 1, pageSize: 10 })),
    ]).then(([statsRes, myAssignRes]) => {
      if (statsRes) setTaskStats(statsRes);
      if (myAssignRes) setAssignments(myAssignRes.items);
    }).catch(() => undefined);
  }, []);

  useTaskEvents(
    [
      TASK_EVENTS.CREATED,
      TASK_EVENTS.ASSIGNED,
      TASK_EVENTS.STARTED,
      TASK_EVENTS.SUBMITTED,
      TASK_EVENTS.REVIEWED,
      TASK_EVENTS.UPDATED,
    ],
    () => {
      refreshFacultyTasks();
    },
  );

  const handleStartTask = async (assignmentId: string) => {
    setActionError(null);
    setActionSuccess(null);
    try {
      await updateMyAssignmentStatus(assignmentId, { status: 'IN_PROGRESS' });
      setActionSuccess('Task status updated to In Progress.');
      await loadData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update task status.');
    }
  };

  const openSubmitDialog = (assignmentId: string) => {
    setActiveAssignmentId(assignmentId);
    setSubmissionContent('');
    setActionError(null);
    setActionSuccess(null);
    setSubmitDialogOpen(true);
  };

  const handleConfirmSubmit = async () => {
    if (!activeAssignmentId || !submissionContent.trim()) return;
    setSubmittingWork(true);
    setActionError(null);
    try {
      await submitTask(activeAssignmentId, { content: submissionContent.trim() });
      setSubmitDialogOpen(false);
      setActionSuccess('Task work submitted successfully for review.');
      await loadData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to submit task work.');
    } finally {
      setSubmittingWork(false);
    }
  };

  const todayDay = new Date().getDay();
  const todayClasses = timetable.filter((t) => t.dayOfWeek === todayDay);
  // A class on today's timetable is pending until a session exists for it today.
  const markedToday = new Set(todaysSessions.map((session) => session.classId));
  const attendancePending = new Set(todayClasses.map((entry) => entry.classId).filter((classId) => !markedToday.has(classId))).size;
  // Two subjects taught to the same section share its students, so each section is counted once.
  const studentsTaught = myClasses ? [...new Map(myClasses.map((cls) => [cls.sectionId, cls.studentCount])).values()].reduce((sum, n) => sum + n, 0) : null;
  const toEvaluate = myClasses ? myClasses.reduce((sum, cls) => sum + cls.pendingEvaluations, 0) : null;
  const activeAssignments = myClasses ? myClasses.reduce((sum, cls) => sum + cls.assignmentCount, 0) : coursework.length;
  const todayDateString = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  const facultyDisplayName = faculty
    ? `${faculty.firstName} ${faculty.lastName}`
    : user?.displayName ?? 'Faculty Member';

  return (
    <div className="grid gap-8">
      {/* A. Welcome Banner */}
      <WelcomeBanner
        eyebrow={`${faculty?.department?.name ?? 'Department'} · Faculty Portal`}
        title={`${greeting}, ${facultyDisplayName}`}
        subtitle={
          <>
            {todayDateString} · Employee Code: <span className="font-medium text-[hsl(var(--foreground))]">{faculty?.employeeCode ?? '—'}</span>
          </>
        }
        actions={
          <>
            <Link href="/dashboard/attendance/new">
              <Button>+ Mark Attendance</Button>
            </Link>
            <Link href="/dashboard/assignments/new">
              <Button variant="outline">+ New Coursework</Button>
            </Link>
            <Link href="/dashboard/tasks">
              <Button variant="outline">My Tasks</Button>
            </Link>
          </>
        }
      />

      {/* Notifications */}
      {actionError && (
        <div className="rounded-[var(--radius)] bg-[hsl(var(--destructive))]/10 p-3 text-sm text-[hsl(var(--destructive))]">
          {actionError}
        </div>
      )}
      {actionSuccess && (
        <div className="rounded-[var(--radius)] bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
          {actionSuccess}
        </div>
      )}

      {/* B. Overview Statistics Cards */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <StatCard label="Today's Classes" value={todayClasses.length} href="/dashboard/timetable" icon="timetable" tone="blue" />
          <StatCard label="Attendance Pending" value={attendancePending} sub={attendancePending > 0 ? 'Not marked today' : 'All marked'} href="/dashboard/attendance/new" icon="attendance" tone={attendancePending > 0 ? 'amber' : 'emerald'} />
          <StatCard label="Teaching Classes" value={myClasses?.length ?? classes.length} href="/dashboard/classes" icon="classes" tone="violet" />
          <StatCard label="Students" value={studentsTaught ?? '—'} sub="In your classes" href="/dashboard/classes" icon="students" tone="sky" />
          <StatCard label="Active Assignments" value={activeAssignments} href="/dashboard/assignments" icon="assignments" tone="blue" />
          <StatCard label="To Evaluate" value={toEvaluate ?? '—'} sub="Submissions awaiting marks" href="/dashboard/classes" icon="exams" tone="amber" />
          <StatCard label="Pending Tasks" value={taskStats?.pending ?? 0} href="/dashboard/tasks" icon="tasks" tone="rose" />
        </div>
      )}

      {/* Personal Overview: Task Workflow Summary */}
      {taskStats && (
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Pending Tasks" value={taskStats.pending} href="/dashboard/tasks" />
          <StatCard label="In Progress" value={taskStats.inProgress} href="/dashboard/tasks" />
          <StatCard label="Submitted" value={taskStats.submitted} sub="Awaiting review" href="/dashboard/tasks" />
          <StatCard label="Approved" value={taskStats.approved} />
          <StatCard label="Needs Rework" value={taskStats.rework} sub="Action required" href="/dashboard/tasks" />
        </div>
      )}

      {/* Two-Column Grid: My Tasks & Today's Schedule */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* C. My Tasks */}
        <Card className="flex flex-col">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>My Tasks ({assignments.length})</CardTitle>
                <CardDescription>Tasks assigned by your HOD or College Admin.</CardDescription>
              </div>
              <Link href="/dashboard/tasks" className="text-xs font-semibold text-[hsl(var(--primary))] underline underline-offset-4">
                View All →
              </Link>
            </div>
          </CardHeader>
          <CardContent className="flex-1 p-0">
            {loading ? (
              <div className="p-5 grid gap-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : assignments.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  title="No assigned tasks"
                  description="You have no tasks assigned to you currently. Check back later or review your previous submissions."
                />
              </div>
            ) : (
              <div className="divide-y">
                {assignments.map((a) => (
                  <div key={a.id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-sm">{a.task?.title ?? 'Untitled Task'}</p>
                        <p className="text-xs text-[hsl(var(--muted-foreground))]">
                          Deadline: {a.task?.deadline ? new Date(a.task.deadline).toLocaleDateString('en-IN') : '—'}
                        </p>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <Badge value={a.task?.priority ?? 'MEDIUM'} map={PRIORITY_BADGE} />
                        <Badge value={a.status} map={TASK_STATUS_BADGE} />
                      </div>
                    </div>

                    {a.notes && (
                      <p className="text-xs text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted))]/50 rounded p-2">
                        <strong>Reviewer note:</strong> {a.notes}
                      </p>
                    )}

                    <div className="flex items-center justify-between pt-1">
                      <Link href={`/dashboard/tasks/${a.taskId}`} className="text-xs font-semibold text-[hsl(var(--primary))] underline">
                        Task Details →
                      </Link>

                      <div className="flex gap-2">
                        {a.status === 'PENDING' && (
                          <Button className="text-xs min-h-8 h-8 px-2.5" onClick={() => void handleStartTask(a.id)}>
                            Start Task
                          </Button>
                        )}
                        {(a.status === 'IN_PROGRESS' || a.status === 'REWORK') && (
                          <Button className="text-xs min-h-8 h-8 px-2.5" onClick={() => openSubmitDialog(a.id)}>
                            {a.status === 'REWORK' ? 'Resubmit Work' : 'Submit Work'}
                          </Button>
                        )}
                        {a.status === 'SUBMITTED' && (
                          <span className="text-xs font-medium text-purple-700 bg-purple-50 dark:bg-purple-950/40 px-2.5 py-1 rounded">
                            Submitted · Pending Review
                          </span>
                        )}
                        {a.status === 'APPROVED' && (
                          <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-1 rounded">
                            Approved
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* D. Today's Timetable */}
        <Card className="flex flex-col">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Today&apos;s Classes ({todayClasses.length})</CardTitle>
                <CardDescription>Your scheduled lecture sessions for today.</CardDescription>
              </div>
              <Link href="/dashboard/timetable" className="text-xs font-semibold text-[hsl(var(--primary))] underline underline-offset-4">
                Full Timetable →
              </Link>
            </div>
          </CardHeader>
          <CardContent className="flex-1 p-0">
            {loading ? (
              <div className="p-5 grid gap-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : todayClasses.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  title="No classes scheduled for today"
                  description="You have no teaching lectures on the timetable for today. Check your full weekly schedule."
                  action={
                    <Link href="/dashboard/timetable">
                      <Button variant="outline" className="text-xs min-h-8 h-8 px-3">View Timetable</Button>
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
                    <TableHead>Section</TableHead>
                    <TableHead>Room</TableHead>
                    <TableHead>Action</TableHead>
                  </tr>
                </thead>
                <tbody>
                  {todayClasses.map((entry) => (
                    <tr key={entry.id}>
                      <TableCell className="font-semibold text-xs whitespace-nowrap">
                        {formatTime(entry.startsAt)} – {formatTime(entry.endsAt)}
                      </TableCell>
                      <TableCell>
                        <p className="font-medium text-xs">{entry.class.subject.name}</p>
                        <p className="text-[11px] text-[hsl(var(--muted-foreground))]">{entry.class.subject.code}</p>
                      </TableCell>
                      <TableCell className="text-xs">
                        Section {entry.class.section.code}
                      </TableCell>
                      <TableCell className="text-xs">
                        {entry.room.code}
                      </TableCell>
                      <TableCell>
                        <Link href="/dashboard/attendance/new">
                          <Button variant="outline" className="text-xs h-7 px-2">
                            Attendance
                          </Button>
                        </Link>
                      </TableCell>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* E. Attendance Management & Assigned Classes */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>My Teaching Classes ({classes.length})</CardTitle>
                <CardDescription>Classes and sections assigned to you for instruction.</CardDescription>
              </div>
              <Link href="/dashboard/attendance/new">
                <Button className="text-xs min-h-8 h-8 px-3">+ Take Attendance</Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-5 grid gap-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : classes.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  title="No assigned classes"
                  description="No teaching classes are currently assigned to your faculty profile."
                />
              </div>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <TableHead>Subject</TableHead>
                    <TableHead>Course & Section</TableHead>
                    <TableHead>Action</TableHead>
                  </tr>
                </thead>
                <tbody>
                  {classes.map((cls) => (
                    <tr key={cls.id}>
                      <TableCell>
                        <strong className="text-sm font-medium">{cls.subject.name}</strong>
                        <span className="block text-xs text-[hsl(var(--muted-foreground))]">{cls.subject.code}</span>
                      </TableCell>
                      <TableCell className="text-xs text-[hsl(var(--muted-foreground))]">
                        {cls.section.semester.course.name} · Section {cls.section.code}
                      </TableCell>
                      <TableCell>
                        <Link href="/dashboard/attendance/new">
                          <Button variant="outline" className="text-xs h-7 px-2">
                            Mark Attendance
                          </Button>
                        </Link>
                      </TableCell>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Recent Attendance Sessions */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Recent Attendance Sessions ({attendance.length})</CardTitle>
                <CardDescription>Attendance sessions recorded for your classes.</CardDescription>
              </div>
              <Link href="/dashboard/attendance" className="text-xs font-semibold text-[hsl(var(--primary))] underline underline-offset-4">
                View All →
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-5 grid gap-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : attendance.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  title="No attendance sessions"
                  description="No attendance sessions have been logged yet. Mark your first class attendance."
                  action={
                    <Link href="/dashboard/attendance/new">
                      <Button variant="outline" className="text-xs min-h-8 h-8 px-3">Record Attendance</Button>
                    </Link>
                  }
                />
              </div>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <TableHead>Date</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Records</TableHead>
                    <TableHead>Action</TableHead>
                  </tr>
                </thead>
                <tbody>
                  {attendance.map((session) => (
                    <tr key={session.id}>
                      <TableCell className="text-xs font-medium whitespace-nowrap">
                        {new Date(session.heldOn).toLocaleDateString('en-IN')}
                      </TableCell>
                      <TableCell className="text-xs">
                        {session.class.subject.name}
                        <span className="block text-[11px] text-[hsl(var(--muted-foreground))]">Sec {session.class.section.code}</span>
                      </TableCell>
                      <TableCell className="text-xs">
                        {session.records.length} students
                      </TableCell>
                      <TableCell>
                        <Link href={`/dashboard/attendance/${session.id}`}>
                          <Button variant="outline" className="text-xs h-7 px-2">
                            View
                          </Button>
                        </Link>
                      </TableCell>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* F. Assignments & Coursework / Examinations */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Coursework Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Coursework Assignments ({coursework.length})</CardTitle>
                <CardDescription>Active coursework assignments for your students.</CardDescription>
              </div>
              <Link href="/dashboard/assignments/new">
                <Button className="text-xs min-h-8 h-8 px-3">+ New Assignment</Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-5 grid gap-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : coursework.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  title="No active assignments"
                  description="Create coursework assignments for students enrolled in your classes."
                  action={
                    <Link href="/dashboard/assignments/new">
                      <Button variant="outline" className="text-xs min-h-8 h-8 px-3">Create Coursework</Button>
                    </Link>
                  }
                />
              </div>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <TableHead>Title</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Max Marks</TableHead>
                    <TableHead>Action</TableHead>
                  </tr>
                </thead>
                <tbody>
                  {coursework.map((assign) => (
                    <tr key={assign.id}>
                      <TableCell>
                        <strong className="text-xs font-medium">{assign.title}</strong>
                        <span className="block text-[11px] text-[hsl(var(--muted-foreground))]">{assign.class.subject.name}</span>
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {assign.dueAt ? new Date(assign.dueAt).toLocaleDateString('en-IN') : 'No deadline'}
                      </TableCell>
                      <TableCell className="text-xs font-medium">
                        {assign.maxMarks} pts
                      </TableCell>
                      <TableCell>
                        <Link href={`/dashboard/assignments/${assign.id}`}>
                          <Button variant="outline" className="text-xs h-7 px-2">
                            Submissions
                          </Button>
                        </Link>
                      </TableCell>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Examinations Schedule Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Examinations Schedule ({exams.length})</CardTitle>
                <CardDescription>Institutional examination cycles and marks entry.</CardDescription>
              </div>
              <Link href="/dashboard/exams" className="text-xs font-semibold text-[hsl(var(--primary))] underline underline-offset-4">
                View All →
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-5 grid gap-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : exams.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  title="No exams scheduled"
                  description="There are currently no active or upcoming examination sessions."
                />
              </div>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <TableHead>Exam Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Action</TableHead>
                  </tr>
                </thead>
                <tbody>
                  {exams.map((exam) => (
                    <tr key={exam.id}>
                      <TableCell className="text-xs font-medium">{exam.name}</TableCell>
                      <TableCell>
                        <span className="inline-flex rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 px-2 py-0.5 text-[11px] font-semibold">
                          {exam.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap text-[hsl(var(--muted-foreground))]">
                        {new Date(exam.startsOn).toLocaleDateString('en-IN')} – {new Date(exam.endsOn).toLocaleDateString('en-IN')}
                      </TableCell>
                      <TableCell>
                        <Link href={`/dashboard/exams/${exam.id}`}>
                          <Button variant="outline" className="text-xs h-7 px-2">
                            Details
                          </Button>
                        </Link>
                      </TableCell>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* G. Announcements */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Announcements</CardTitle>
              <CardDescription>Latest notices from your college.</CardDescription>
            </div>
            <Link href="/dashboard/announcements" className="text-xs font-semibold text-[hsl(var(--primary))] underline underline-offset-4">
              All Announcements →
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {announcements === null ? (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">Announcements could not be loaded right now.</p>
          ) : announcements.length === 0 ? (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">No announcements yet.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              {announcements.map((item) => (
                <Link
                  key={item.id}
                  href="/dashboard/announcements"
                  className="rounded-[var(--radius)] border p-4 bg-[hsl(var(--background))] space-y-1 transition-colors hover:border-[hsl(var(--primary))]/50"
                >
                  <p className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--primary))]">
                    {AUDIENCE_LABEL[item.audience]} · {new Date(item.publishedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </p>
                  <p className="text-sm font-semibold">{item.title}</p>
                  <p className="line-clamp-3 text-xs text-[hsl(var(--muted-foreground))]">{item.body}</p>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Work Submission Modal */}
      <Dialog
        open={submitDialogOpen}
        title="Submit Completed Work"
        description="Describe the work completed or deliverables produced for this task assignment."
        onClose={() => setSubmitDialogOpen(false)}
      >
        <div className="grid gap-4">
          <div className="grid gap-1">
            <label className="text-sm font-medium">Work Summary &amp; Notes</label>
            <textarea
              className="min-h-28 w-full rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
              placeholder="Detail your work, findings, or completed deliverables for review..."
              value={submissionContent}
              onChange={(e) => setSubmissionContent(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setSubmitDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={submittingWork}
              disabled={!submissionContent.trim()}
              onClick={() => void handleConfirmSubmit()}
            >
              Submit Work
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}


// ─── Student Dashboard ────────────────────────────────────────────────────────
function StudentDashboard() {
  return <StudentDashboardView />;
}

// ─── Root page ────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user, primaryRole } = useAuth();

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  // HOD, Faculty and Student dashboards open with their own welcome banner; Admin gets the same banner here.
  return (
    <div className="grid gap-6">
      {primaryRole === 'Admin' && (
        <WelcomeBanner
          eyebrow="Administration · Admin Portal"
          title={`${greeting}, ${user?.displayName ?? 'Admin'}`}
          subtitle={`${today} · College administration and institutional operations`}
          actions={
            <>
              <Link href="/dashboard/tasks/new">
                <Button>+ Create Task</Button>
              </Link>
              <Link href="/dashboard/institutional-overview">
                <Button variant="outline">Institutional Overview</Button>
              </Link>
            </>
          }
        />
      )}

      {primaryRole === 'Admin' && <AdminDashboard />}
      {primaryRole === 'HOD' && <HodDashboard />}
      {primaryRole === 'Faculty' && <FacultyDashboard />}
      {primaryRole === 'Student' && <StudentDashboard />}
    </div>
  );
}