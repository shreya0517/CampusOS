'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, Skeleton } from '@/components/feedback/states';
import { Table, TableCell, TableHead } from '@/components/ui/table';
import { listFaculty, type Faculty } from '@/lib/faculty-api';
import { listTasks, listMyAssignments, type Task, type TaskAssignment } from '@/lib/tasks-api';
import { listVisitors, reviewVisitor, type Visitor } from '@/lib/visitors-api';

// ─── Badge helpers ─────────────────────────────────────────────────────────────
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

// ─── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, href }: { label: string; value: string | number; sub?: string; href?: string }) {
  const inner = (
    <Card className={href ? 'transition-shadow hover:shadow-md cursor-pointer' : ''}>
      <CardContent className="pt-5">
        <p className="text-3xl font-bold">{value}</p>
        <p className="mt-1 text-sm font-semibold">{label}</p>
        {sub && <p className="text-xs text-[hsl(var(--muted-foreground))]">{sub}</p>}
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function HodOverviewPage() {
  const { primaryRole } = useAuth();

  const [faculty, setFaculty] = useState<Faculty[]>([]);
  const [deptName, setDeptName] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [myAssignments, setMyAssignments] = useState<TaskAssignment[]>([]);
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Action state
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const facultyParams = new URLSearchParams({ page: '1', pageSize: '100' });
      const taskParams = new URLSearchParams({ page: '1', pageSize: '50' });
      const visitorsParams = new URLSearchParams({ page: '1', pageSize: '20' });

      const [fRes, tRes, aRes, vRes] = await Promise.all([
        listFaculty(facultyParams),
        listTasks(taskParams),
        listMyAssignments(),
        listVisitors(visitorsParams),
      ]);

      setFaculty(fRes.items);
      const dept = fRes.items.find((f) => f.department)?.department;
      if (dept) setDeptName(dept.name);
      setTasks(tRes.items);
      setMyAssignments(aRes.items);
      setVisitors(vRes.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load department data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  // Guard: only HOD can access this page
  if (primaryRole !== 'HOD') {
    return (
      <div className="grid gap-4">
        <h1 className="text-2xl font-semibold">Access Denied</h1>
        <p className="text-[hsl(var(--muted-foreground))]">This page is only accessible to Heads of Department.</p>
      </div>
    );
  }

  // Computed views
  const submittedTasks = tasks.filter((t) => t.assignments.some((a) => a.status === 'SUBMITTED'));
  const pendingVisitors = visitors.filter((v) => v.status === 'PENDING');

  const tasksByStatus = {
    PENDING: tasks.filter((t) => t.status === 'PENDING').length,
    IN_PROGRESS: tasks.filter((t) => t.status === 'IN_PROGRESS').length,
    SUBMITTED: tasks.filter((t) => t.assignments.some((a) => a.status === 'SUBMITTED')).length,
    APPROVED: tasks.filter((t) => t.status === 'APPROVED').length,
    REWORK: tasks.filter((t) => t.status === 'REWORK').length,
  };

  const handleReviewVisitor = async (id: string, decision: 'APPROVED' | 'REJECTED') => {
    setReviewing(id);
    setActionError(null);
    try {
      await reviewVisitor(id, { decision });
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update visitor.');
    } finally {
      setReviewing(null);
    }
  };

  return (
    <div className="grid gap-8">
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[.16em] text-[hsl(var(--primary))]">
            {deptName ?? 'Department'} · HOD
          </p>
          <h1 className="mt-2 text-3xl font-semibold">Department Overview</h1>
          <p className="mt-2 text-[hsl(var(--muted-foreground))]">
            Manage faculty tasks, review submissions, and approve visitor requests.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/tasks/new">
            <Button>+ Create Task</Button>
          </Link>
          <Link href="/dashboard/tasks">
            <Button variant="outline">All Tasks</Button>
          </Link>
        </div>
      </div>

      {error && <ErrorState message={error} onRetry={load} />}
      {actionError && (
        <p className="rounded-[var(--radius)] bg-[hsl(var(--destructive))]/10 px-3 py-2 text-sm text-[hsl(var(--destructive))]">
          {actionError}
        </p>
      )}

      {/* Key stats */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Faculty Members" value={faculty.length} href="/dashboard/faculty" />
          <StatCard label="Dept Tasks" value={tasks.length} href="/dashboard/tasks" />
          <StatCard label="Submissions to Review" value={submittedTasks.length} sub="Requires your action" href="/dashboard/tasks" />
          <StatCard label="Pending Visitors" value={pendingVisitors.length} sub="Awaiting approval" href="/dashboard/visitors" />
        </div>
      )}

      {/* Task progress row */}
      {!loading && (
        <div className="grid gap-4 sm:grid-cols-5">
          <StatCard label="Pending" value={tasksByStatus.PENDING} />
          <StatCard label="In Progress" value={tasksByStatus.IN_PROGRESS} />
          <StatCard label="Submitted" value={tasksByStatus.SUBMITTED} />
          <StatCard label="Approved" value={tasksByStatus.APPROVED} />
          <StatCard label="Rework" value={tasksByStatus.REWORK} />
        </div>
      )}

      {/* Two-column layout: faculty list + pending submissions */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Faculty directory ── */}
        <Card>
          <CardHeader>
            <CardTitle>Faculty Directory</CardTitle>
            <CardDescription>
              {faculty.length} faculty member{faculty.length !== 1 ? 's' : ''} in {deptName ?? 'your department'}.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-5 grid gap-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : faculty.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  title="No faculty assigned"
                  description="No faculty members are currently assigned to your department."
                />
              </div>
            ) : (
              <>
                <Table>
                  <thead>
                    <tr>
                      <TableHead>Name</TableHead>
                      <TableHead>Employee Code</TableHead>
                      <TableHead>Profile</TableHead>
                    </tr>
                  </thead>
                  <tbody>
                    {faculty.map((f) => (
                      <tr key={f.id}>
                        <TableCell>
                          <strong className="font-medium">{f.firstName} {f.lastName}</strong>
                        </TableCell>
                        <TableCell className="text-[hsl(var(--muted-foreground))]">{f.employeeCode}</TableCell>
                        <TableCell>
                          <Link
                            href={`/dashboard/faculty/${f.id}`}
                            className="text-xs font-semibold text-[hsl(var(--primary))] underline underline-offset-4"
                          >
                            View
                          </Link>
                        </TableCell>
                      </tr>
                    ))}
                  </tbody>
                </Table>
                {faculty.length > 10 && (
                  <div className="px-5 py-3">
                    <Link href="/dashboard/faculty" className="text-sm font-semibold text-[hsl(var(--primary))] underline underline-offset-4">
                      View all in directory →
                    </Link>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* ── My assignments from Admin ── */}
        <Card>
          <CardHeader>
            <CardTitle>My Assignments from Admin</CardTitle>
            <CardDescription>Tasks assigned to you by the Admin.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-5 grid gap-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : myAssignments.length === 0 ? (
              <div className="p-6">
                <EmptyState title="No assignments" description="You have no tasks assigned to you yet." />
              </div>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <TableHead>Task</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Deadline</TableHead>
                    <TableHead>Action</TableHead>
                  </tr>
                </thead>
                <tbody>
                  {myAssignments.map((a) => (
                    <tr key={a.id}>
                      <TableCell className="font-medium">{a.task?.title ?? '—'}</TableCell>
                      <TableCell>
                        <Badge value={a.task?.priority ?? 'MEDIUM'} map={PRIORITY_BADGE} />
                      </TableCell>
                      <TableCell>
                        <Badge value={a.status} map={TASK_STATUS_BADGE} />
                      </TableCell>
                      <TableCell>
                        {a.task?.deadline ? new Date(a.task.deadline).toLocaleDateString('en-IN') : '—'}
                      </TableCell>
                      <TableCell>
                        <Link href={`/dashboard/tasks/${a.taskId}`}>
                          <Button variant="outline" className="text-xs">View</Button>
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

      {/* ── Pending submissions requiring review ── */}
      <Card>
        <CardHeader>
          <CardTitle>
            Faculty Submissions to Review
            {submittedTasks.length > 0 && (
              <span className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-purple-500 text-xs font-bold text-white">
                {submittedTasks.length}
              </span>
            )}
          </CardTitle>
          <CardDescription>Tasks with submissions awaiting your approval or rework decision.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-5 grid gap-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : submittedTasks.length === 0 ? (
            <div className="p-6">
              <EmptyState title="No pending submissions" description="All submissions have been reviewed." />
            </div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <TableHead>Task</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Deadline</TableHead>
                  <TableHead>Submissions</TableHead>
                  <TableHead>Action</TableHead>
                </tr>
              </thead>
              <tbody>
                {submittedTasks.map((t) => {
                  const submittedAssignments = t.assignments.filter((a) => a.status === 'SUBMITTED');
                  return (
                    <tr key={t.id}>
                      <TableCell className="font-medium">{t.title}</TableCell>
                      <TableCell>
                        <Badge value={t.priority} map={PRIORITY_BADGE} />
                      </TableCell>
                      <TableCell>{new Date(t.deadline).toLocaleDateString('en-IN')}</TableCell>
                      <TableCell>
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-purple-100 text-xs font-bold text-purple-700">
                          {submittedAssignments.length}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Link href={`/dashboard/tasks/${t.id}`}>
                          <Button variant="outline" className="text-xs">Review</Button>
                        </Link>
                      </TableCell>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Departmental tasks list ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Department Tasks ({tasks.length})</CardTitle>
              <CardDescription>All tasks in your department.</CardDescription>
            </div>
            <Link href="/dashboard/tasks/new">
              <Button className="text-sm">+ New Task</Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-5 grid gap-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : tasks.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="No tasks yet"
                description="Create a task to assign to faculty in your department."
                action={
                  <Link href="/dashboard/tasks/new">
                    <Button>Create Task</Button>
                  </Link>
                }
              />
            </div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <TableHead>Title</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Deadline</TableHead>
                  <TableHead>Assigned</TableHead>
                  <TableHead>Action</TableHead>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => (
                  <tr key={t.id}>
                    <TableCell className="font-medium">{t.title}</TableCell>
                    <TableCell>
                      <Badge value={t.priority} map={PRIORITY_BADGE} />
                    </TableCell>
                    <TableCell>
                      <Badge value={t.status} map={TASK_STATUS_BADGE} />
                    </TableCell>
                    <TableCell>{new Date(t.deadline).toLocaleDateString('en-IN')}</TableCell>
                    <TableCell>{t.assignments.length}</TableCell>
                    <TableCell>
                      <Link href={`/dashboard/tasks/${t.id}`}>
                        <Button variant="outline" className="text-xs">View</Button>
                      </Link>
                    </TableCell>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Pending visitor approvals ── */}
      {!loading && pendingVisitors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              Pending Visitor Requests
              <span className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-white">
                {pendingVisitors.length}
              </span>
            </CardTitle>
            <CardDescription>Visitor requests awaiting your approval.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <thead>
                <tr>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Purpose</TableHead>
                  <TableHead>Visit Date</TableHead>
                  <TableHead>Registered By</TableHead>
                  <TableHead>Actions</TableHead>
                </tr>
              </thead>
              <tbody>
                {pendingVisitors.map((v) => (
                  <tr key={v.id}>
                    <TableCell className="font-medium">{v.name}</TableCell>
                    <TableCell>{v.phone}</TableCell>
                    <TableCell>{v.purpose}</TableCell>
                    <TableCell>{new Date(v.visitDate).toLocaleDateString('en-IN')}</TableCell>
                    <TableCell>{v.registeredBy.displayName}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          className="text-xs"
                          loading={reviewing === v.id}
                          onClick={() => void handleReviewVisitor(v.id, 'APPROVED')}
                        >
                          Approve
                        </Button>
                        <Button
                          variant="destructive"
                          className="text-xs"
                          loading={reviewing === v.id}
                          onClick={() => void handleReviewVisitor(v.id, 'REJECTED')}
                        >
                          Reject
                        </Button>
                      </div>
                    </TableCell>
                  </tr>
                ))}
              </tbody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ── Academic quick links ── */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Attendance</CardTitle>
            <CardDescription>Mark and review attendance for department classes.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard/attendance" className="text-sm font-semibold text-[hsl(var(--primary))] underline underline-offset-4">
              Open Attendance →
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Exams &amp; Results</CardTitle>
            <CardDescription>Schedule exams and manage marks for your department.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard/exams" className="text-sm font-semibold text-[hsl(var(--primary))] underline underline-offset-4">
              Open Exams →
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Assignments</CardTitle>
            <CardDescription>Publish coursework and grade student submissions.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard/assignments" className="text-sm font-semibold text-[hsl(var(--primary))] underline underline-offset-4">
              Open Assignments →
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
