'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/form-field';
import { Dialog } from '@/components/ui/interactive';
import { ErrorState, Skeleton } from '@/components/feedback/states';
import { Table, TableCell, TableHead } from '@/components/ui/table';
import {
  getTask, assignTask, submitTask, reviewTask, updateMyAssignmentStatus,
  type Task, type TaskStatus,
} from '@/lib/tasks-api';
import { listFaculty, type Faculty } from '@/lib/faculty-api';
import { useTaskEvents, TASK_EVENTS } from '@/lib/use-socket';

const PRIORITY_BADGE: Record<string, string> = {
  LOW: 'bg-gray-100 text-gray-700',
  MEDIUM: 'bg-blue-100 text-blue-700',
  HIGH: 'bg-amber-100 text-amber-700',
  URGENT: 'bg-red-100 text-red-700',
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

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, primaryRole } = useAuth();

  const isManager = primaryRole === 'Admin' || primaryRole === 'HOD';

  const [task, setTask] = useState<Task | null>(null);
  const [faculty, setFaculty] = useState<Faculty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Assign dialog
  const [assignOpen, setAssignOpen] = useState(false);
  const [assigneeId, setAssigneeId] = useState('');
  const [assignNotes, setAssignNotes] = useState('');
  const [assigning, setAssigning] = useState(false);

  // Submit dialog (for assignee)
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitContent, setSubmitContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Review dialog (for manager)
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewAssignmentId, setReviewAssignmentId] = useState('');
  const [reviewDecision, setReviewDecision] = useState<'APPROVED' | 'REWORK'>('APPROVED');
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewing, setReviewing] = useState(false);

  const [actionError, setActionError] = useState<string | null>(null);

  const myAssignment = task?.assignments.find((a) => a.assigneeUserId === user?.id) ?? null;

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const t = await getTask(id);
      setTask(t);
      if (isManager) {
        const fRes = await listFaculty(new URLSearchParams({ page: '1', pageSize: '100' }));
        setFaculty(fRes.items);
      }
    } catch {
      if (!silent) setError('Task not found or you do not have access.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [id, isManager]);

  useEffect(() => { void load(); }, [load]);

  // Real-time update when this task is updated, assigned, started, submitted, or reviewed
  useTaskEvents(
    [
      TASK_EVENTS.CREATED,
      TASK_EVENTS.ASSIGNED,
      TASK_EVENTS.STARTED,
      TASK_EVENTS.SUBMITTED,
      TASK_EVENTS.REVIEWED,
      TASK_EVENTS.UPDATED,
    ],
    (_event, payload) => {
      if (payload.taskId === id) {
        void load(true);
      }
    },
  );

  const handleAssign = async () => {
    if (!assigneeId) return;
    setAssigning(true);
    setActionError(null);
    try {
      await assignTask(id, { assigneeUserId: assigneeId, notes: assignNotes || undefined });
      setAssignOpen(false);
      setAssigneeId('');
      setAssignNotes('');
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to assign task.');
    } finally {
      setAssigning(false);
    }
  };

  const handleUpdateStatus = async (assignmentId: string, status: TaskStatus) => {
    setActionError(null);
    try {
      await updateMyAssignmentStatus(assignmentId, { status });
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update status.');
    }
  };

  const handleSubmit = async () => {
    if (!myAssignment) return;
    setSubmitting(true);
    setActionError(null);
    try {
      await submitTask(myAssignment.id, { content: submitContent });
      setSubmitOpen(false);
      setSubmitContent('');
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to submit task.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReview = async () => {
    setReviewing(true);
    setActionError(null);
    try {
      await reviewTask(reviewAssignmentId, { decision: reviewDecision, notes: reviewNotes || undefined });
      setReviewOpen(false);
      setReviewNotes('');
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to review submission.');
    } finally {
      setReviewing(false);
    }
  };

  if (loading) return (
    <div className="grid gap-4">
      <Skeleton className="h-10 w-72" />
      <Skeleton className="h-48 w-full" />
    </div>
  );

  if (error || !task) return <ErrorState message={error ?? 'Task not found.'} onRetry={load} />;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <button onClick={() => router.back()} className="mb-2 text-sm text-[hsl(var(--muted-foreground))] hover:underline">
            ← Back to Tasks
          </button>
          <h1 className="text-3xl font-semibold">{task.title}</h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge value={task.priority} map={PRIORITY_BADGE} />
            <Badge value={task.status} map={STATUS_BADGE} />
          </div>
        </div>
        {isManager && (
          <Button onClick={() => setAssignOpen(true)}>Assign to User</Button>
        )}
      </div>

      {actionError && (
        <p className="rounded-[var(--radius)] bg-[hsl(var(--destructive))]/10 px-3 py-2 text-sm text-[hsl(var(--destructive))]">
          {actionError}
        </p>
      )}

      {/* Task info */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {task.description && <p className="text-[hsl(var(--muted-foreground))]">{task.description}</p>}
            <div className="grid grid-cols-2 gap-1">
              <span className="font-medium">Deadline</span>
              <span>{new Date(task.deadline).toLocaleString('en-IN')}</span>
              <span className="font-medium">Department</span>
              <span>{task.department?.name ?? 'All'}</span>
              <span className="font-medium">Created by</span>
              <span>{task.createdBy.displayName}</span>
            </div>
          </CardContent>
        </Card>

        {/* My assignment card */}
        {myAssignment && (
          <Card>
            <CardHeader><CardTitle>My Assignment</CardTitle></CardHeader>
            <CardContent className="grid gap-3">
              <div className="grid grid-cols-2 gap-1 text-sm">
                <span className="font-medium">Status</span>
                <Badge value={myAssignment.status} map={STATUS_BADGE} />
                {myAssignment.submittedAt && <>
                  <span className="font-medium">Submitted</span>
                  <span>{new Date(myAssignment.submittedAt).toLocaleString('en-IN')}</span>
                </>}
                {myAssignment.submissionContent && <>
                  <span className="font-medium">Submission</span>
                  <span className="break-words">{myAssignment.submissionContent}</span>
                </>}
                {myAssignment.notes && <>
                  <span className="font-medium">Notes</span>
                  <span>{myAssignment.notes}</span>
                </>}
              </div>
              <div className="flex flex-wrap gap-2">
                {myAssignment.status === 'PENDING' && (
                  <Button className="text-xs" onClick={() => void handleUpdateStatus(myAssignment.id, 'IN_PROGRESS')}>
                    Mark In Progress
                  </Button>
                )}
                {(myAssignment.status === 'IN_PROGRESS' || myAssignment.status === 'REWORK') && (
                  <Button className="text-xs" onClick={() => setSubmitOpen(true)}>Submit Work</Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Assignments table (managers) */}
      {isManager && task.assignments.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Assignments ({task.assignments.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <thead>
                <tr>
                  <TableHead>Assignee</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Submission</TableHead>
                  <TableHead>Action</TableHead>
                </tr>
              </thead>
              <tbody>
                {task.assignments.map((a) => (
                  <tr key={a.id}>
                    <TableCell>{a.assignee.displayName}</TableCell>
                    <TableCell><Badge value={a.status} map={STATUS_BADGE} /></TableCell>
                    <TableCell>
                      {a.submittedAt ? new Date(a.submittedAt).toLocaleDateString('en-IN') : '—'}
                    </TableCell>
                    <TableCell>
                      <span className="max-w-xs truncate block">{a.submissionContent ?? '—'}</span>
                    </TableCell>
                    <TableCell>
                      {a.status === 'SUBMITTED' && (
                        <Button
                          variant="outline"
                          className="text-xs"
                          onClick={() => {
                            setReviewAssignmentId(a.id);
                            setReviewOpen(true);
                          }}
                        >
                          Review
                        </Button>
                      )}
                    </TableCell>
                  </tr>
                ))}
              </tbody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Assign dialog */}
      <Dialog
        open={assignOpen}
        title="Assign Task"
        description="Select a faculty member or HOD to assign this task to."
        onClose={() => setAssignOpen(false)}
      >
        <div className="grid gap-4">
          <Select
            label="Assignee"
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
          >
            <option value="" disabled>Select a person</option>
            {faculty.map((f) => (
              <option key={f.id} value={f.id}>
                {f.firstName} {f.lastName} ({f.employeeCode})
              </option>
            ))}
          </Select>
          <div className="grid gap-1">
            <label className="text-sm font-medium">Notes (optional)</label>
            <textarea
              className="min-h-16 w-full rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
              value={assignNotes}
              onChange={(e) => setAssignNotes(e.target.value)}
              placeholder="Any specific instructions…"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAssignOpen(false)}>Cancel</Button>
            <Button loading={assigning} disabled={!assigneeId} onClick={() => void handleAssign()}>Assign</Button>
          </div>
        </div>
      </Dialog>

      {/* Submit dialog */}
      <Dialog
        open={submitOpen}
        title="Submit Work"
        description="Describe the work you've completed for this task."
        onClose={() => setSubmitOpen(false)}
      >
        <div className="grid gap-4">
          <div className="grid gap-1">
            <label className="text-sm font-medium">Work summary / notes</label>
            <textarea
              className="min-h-24 w-full rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
              value={submitContent}
              onChange={(e) => setSubmitContent(e.target.value)}
              placeholder="Describe what you completed…"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setSubmitOpen(false)}>Cancel</Button>
            <Button loading={submitting} disabled={!submitContent.trim()} onClick={() => void handleSubmit()}>Submit</Button>
          </div>
        </div>
      </Dialog>

      {/* Review dialog */}
      <Dialog
        open={reviewOpen}
        title="Review Submission"
        description="Approve the submission or send it back for rework."
        onClose={() => setReviewOpen(false)}
      >
        <div className="grid gap-4">
          <Select
            label="Decision"
            value={reviewDecision}
            onChange={(e) => setReviewDecision(e.target.value as 'APPROVED' | 'REWORK')}
          >
            <option value="APPROVED">Approved</option>
            <option value="REWORK">Needs Rework</option>
          </Select>
          <div className="grid gap-1">
            <label className="text-sm font-medium">Reviewer notes (optional)</label>
            <textarea
              className="min-h-16 w-full rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              placeholder="Feedback for the assignee…"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setReviewOpen(false)}>Cancel</Button>
            <Button
              loading={reviewing}
              variant={reviewDecision === 'REWORK' ? 'destructive' : 'primary'}
              onClick={() => void handleReview()}
            >
              {reviewDecision === 'APPROVED' ? 'Approve' : 'Send for Rework'}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
