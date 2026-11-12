'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, Skeleton } from '@/components/feedback/states';
import { Table, TableCell, TableHead } from '@/components/ui/table';
import { listTasks, listMyAssignments, type Task, type TaskAssignment } from '@/lib/tasks-api';
import { useTaskEvents, TASK_EVENTS } from '@/lib/use-socket';

const PRIORITY_BADGE: Record<string, string> = {
  LOW: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  MEDIUM: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  HIGH: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  URGENT: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
};

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'bg-gray-100 text-gray-700',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  SUBMITTED: 'bg-purple-100 text-purple-700',
  APPROVED: 'bg-green-100 text-green-700',
  REWORK: 'bg-red-100 text-red-700',
};

function Badge({ value, map }: { value: string; map: Record<string, string> }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${map[value] ?? 'bg-gray-100 text-gray-700'}`}>
      {value.replace('_', ' ')}
    </span>
  );
}

export default function TasksPage() {
  const { primaryRole } = useAuth();
  const isManager = primaryRole === 'Admin' || primaryRole === 'HOD';
  const [tasks, setTasks] = useState<Task[]>([]);
  const [myAssignments, setMyAssignments] = useState<TaskAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: '1', pageSize: '50' });
      const [tasksRes, assignRes] = await Promise.all([
        isManager ? listTasks(params) : Promise.resolve({ items: [] as Task[], total: 0, page: 1, pageSize: 50 }),
        listMyAssignments(params),
      ]);
      setTasks(tasksRes.items);
      setMyAssignments(assignRes.items);
    } catch {
      if (!silent) setError('Failed to load tasks. Please try again.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [isManager]);

  useEffect(() => { void load(); }, [load]);

  // Subscribe to real-time task events to refresh lists without full-page reloads
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
      void load(true);
    },
  );

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[.16em] text-[hsl(var(--primary))]">Work</p>
          <h1 className="mt-2 text-3xl font-semibold">Task Management</h1>
          <p className="mt-2 text-[hsl(var(--muted-foreground))]">
            {isManager ? 'Create and manage tasks across your team.' : 'View and update your assigned tasks.'}
          </p>
        </div>
        {isManager && (
          <Link href="/dashboard/tasks/new">
            <Button>+ Create Task</Button>
          </Link>
        )}
      </div>

      {error && <ErrorState message={error} onRetry={load} />}

      {loading ? (
        <div className="grid gap-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <div className="grid gap-6">
          {/* My Assignments */}
          <Card>
            <CardHeader>
              <CardTitle>My Assignments ({myAssignments.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {myAssignments.length === 0 ? (
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
                        <TableCell>{a.task?.title ?? '—'}</TableCell>
                        <TableCell><Badge value={a.task?.priority ?? 'MEDIUM'} map={PRIORITY_BADGE} /></TableCell>
                        <TableCell><Badge value={a.status} map={STATUS_BADGE} /></TableCell>
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

          {/* All Tasks (managers only) */}
          {isManager && (
            <Card>
              <CardHeader>
                <CardTitle>All Tasks ({tasks.length})</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {tasks.length === 0 ? (
                  <div className="p-6">
                    <EmptyState
                      title="No tasks yet"
                      description="Create your first task to assign to HOD or faculty."
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
                        <TableHead>Department</TableHead>
                        <TableHead>Deadline</TableHead>
                        <TableHead>Assigned</TableHead>
                        <TableHead>Action</TableHead>
                      </tr>
                    </thead>
                    <tbody>
                      {tasks.map((task) => (
                        <tr key={task.id}>
                          <TableCell className="font-medium">{task.title}</TableCell>
                          <TableCell><Badge value={task.priority} map={PRIORITY_BADGE} /></TableCell>
                          <TableCell><Badge value={task.status} map={STATUS_BADGE} /></TableCell>
                          <TableCell>{task.department?.name ?? '—'}</TableCell>
                          <TableCell>{new Date(task.deadline).toLocaleDateString('en-IN')}</TableCell>
                          <TableCell>{task.assignments.length}</TableCell>
                          <TableCell>
                            <Link href={`/dashboard/tasks/${task.id}`}>
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
          )}
        </div>
      )}
    </div>
  );
}
