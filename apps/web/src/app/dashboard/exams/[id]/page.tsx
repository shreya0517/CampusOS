'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { EmptyState, ErrorState, Skeleton } from '@/components/feedback/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/form-field';
import { Dialog } from '@/components/ui/interactive';
import { Table, TableCell, TableHead } from '@/components/ui/table';
import {
  addExamSubject,
  calculateAndPublishResults,
  deleteExam,
  getExam,
  listExamResults,
  removeExamSubject,
  updateExam,
} from '@/lib/exams-api';
import type { Exam, ExamStatus, Result } from '@/lib/exams-api';

const STATUS_COLORS: Record<ExamStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200 border-gray-300',
  SCHEDULED: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200 border-blue-300',
  COMPLETED: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200 border-green-300',
  CANCELLED: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200 border-red-300',
};

const MARKS_BADGE: Record<'DRAFT' | 'SUBMITTED' | 'APPROVED', string> = {
  DRAFT: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  SUBMITTED: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  APPROVED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
};

type PendingAction = { kind: 'delete-exam' } | { kind: 'remove-paper'; examSubjectId: string } | { kind: 'publish' };

const PENDING_COPY: Record<PendingAction['kind'], { title: string; description: string; confirm: string }> = {
  'delete-exam': { title: 'Delete this exam?', description: 'The exam and its scheduled papers are removed. This cannot be undone.', confirm: 'Delete exam' },
  'remove-paper': { title: 'Remove this paper?', description: 'The paper is taken off this exam’s schedule.', confirm: 'Remove paper' },
  publish: { title: 'Calculate and publish results?', description: 'Totals and percentages are worked out from the approved marks, and students can see their results straight away.', confirm: 'Publish results' },
};

export default function ExamDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { primaryRole } = useAuth();
  const isStaff = primaryRole === 'Admin' || primaryRole === 'HOD' || primaryRole === 'Faculty';
  // Admins and HODs (for their department) schedule and remove papers; faculty enter marks. Only an Admin deletes an exam.
  const isAdminOrHOD = primaryRole === 'Admin' || primaryRole === 'HOD';

  const [exam, setExam] = useState<Exam | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Scheduling state
  const [showAddSubject, setShowAddSubject] = useState(false);
  const [addingSubject, setAddingSubject] = useState(false);
  const [calcLoading, setCalcLoading] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  // Destructive or final actions wait for a yes in the app's own dialog; outcomes show on the page, not in browser pop-ups.
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getExam(id);
      setExam(data);

      if (isStaff) {
        const resData = await listExamResults(id).catch(() => ({ results: [] }));
        setResults(resData.results ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Exam details could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [id]);

  const handleStatusChange = async (newStatus: ExamStatus) => {
    if (!exam) return;
    setStatusUpdating(true);
    setActionError(null);
    try {
      const updated = await updateExam(exam.id, { status: newStatus });
      setExam((prev) => (prev ? { ...prev, status: updated.status } : null));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update exam status.');
    } finally {
      setStatusUpdating(false);
    }
  };


  const handleAddSubjectSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setAddingSubject(true);
    setActionError(null);
    const formData = new FormData(e.currentTarget);
    const subjectId = String(formData.get('subjectId') ?? '').trim();
    const semesterId = String(formData.get('semesterId') ?? '').trim();
    const sectionId = String(formData.get('sectionId') ?? '').trim() || undefined;
    const examAt = String(formData.get('examAt') ?? '');
    const maxMarks = Number(formData.get('maxMarks'));
    const passMarks = Number(formData.get('passMarks'));

    try {
      await addExamSubject(id, { subjectId, semesterId, sectionId, examAt, maxMarks, passMarks });
      setShowAddSubject(false);
      await loadData();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to schedule exam subject.');
    } finally {
      setAddingSubject(false);
    }
  };

  const ask = (action: PendingAction) => {
    setPendingError(null);
    setNotice(null);
    setActionError(null);
    setPending(action);
  };

  /** Runs the action the user just confirmed. A failure stays in the dialog so they can read it and try again. */
  const runPending = async () => {
    if (!pending || !exam) return;
    setCalcLoading(true);
    setPendingError(null);
    try {
      if (pending.kind === 'delete-exam') {
        await deleteExam(exam.id);
        router.push('/dashboard/exams');
        return;
      }
      if (pending.kind === 'remove-paper') {
        await removeExamSubject(id, pending.examSubjectId);
        setNotice('The paper was removed.');
      } else {
        const res = await calculateAndPublishResults(id);
        setNotice(`Results were calculated and published for ${res.processedStudents} students.`);
      }
      setPending(null);
      await loadData();
    } catch (err) {
      setPendingError(err instanceof Error ? err.message : 'That did not work. Please try again.');
    } finally {
      setCalcLoading(false);
    }
  };

  if (loading) return <Skeleton className="h-96 w-full" />;
  if (error || !exam) return <ErrorState message={error ?? 'Exam not found'} onRetry={() => void loadData()} />;

  const allPapersApproved = Boolean(exam.examSubjects?.length) && (exam.examSubjects ?? []).every((paper) => paper.marksStatus === 'APPROVED');

  return (
    <div className="grid gap-6">
      <div>
        <Link href="/dashboard/exams" className="text-sm font-semibold text-[hsl(var(--primary))] hover:underline">
          &larr; Back to Exams
        </Link>
        <div className="mt-2 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">{exam.name}</h1>
              <span className={`rounded-full border px-3 py-0.5 text-xs font-bold ${STATUS_COLORS[exam.status]}`}>
                {exam.status}
              </span>
            </div>
            <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
              Period: {new Date(exam.startsOn).toLocaleDateString()} &mdash; {new Date(exam.endsOn).toLocaleDateString()}
            </p>
          </div>

          {isStaff && (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={exam.status}
                disabled={statusUpdating}
                onChange={(e) => void handleStatusChange(e.target.value as ExamStatus)}
                className="rounded-[var(--radius)] border bg-[hsl(var(--card))] px-3 py-2 text-xs font-semibold text-[hsl(var(--foreground))]"
              >
                <option value="DRAFT">Status: Draft</option>
                <option value="SCHEDULED">Status: Scheduled</option>
                <option value="COMPLETED">Status: Completed</option>
                <option value="CANCELLED">Status: Cancelled</option>
              </select>

              {/* Admin publishes results once every paper's marks are approved (HOD decision 4). */}
              {primaryRole === 'Admin' && (
                <Button
                  variant="primary"
                  loading={calcLoading}
                  disabled={!allPapersApproved}
                  title={allPapersApproved ? undefined : 'Every paper’s marks must be approved first'}
                  onClick={() => ask({ kind: 'publish' })}
                >
                  Calculate & Publish Results
                </Button>
              )}

              {primaryRole === 'Admin' && (
                <Button variant="destructive" onClick={() => ask({ kind: 'delete-exam' })}>
                  Delete Exam
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {notice && (
        <p role="status" className="rounded-[var(--radius)] border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100">
          {notice}
        </p>
      )}
      {actionError && <ErrorState message={actionError} />}

      {/* Student View Card if logged-in as Student */}
      {exam.studentResult && (
        <Card className="border-blue-500/40 bg-blue-50/40 dark:bg-blue-950/20">
          <CardHeader>
            <CardTitle className="text-lg">Your Official Result</CardTitle>
            <CardDescription>Published performance record for {exam.name}.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border bg-[hsl(var(--card))] p-4 text-center">
              <p className="text-xs text-[hsl(var(--muted-foreground))]">Total Marks</p>
              <p className="mt-1 text-2xl font-bold">{exam.studentResult.totalMarks ?? 'N/A'}</p>
            </div>
            <div className="rounded-lg border bg-[hsl(var(--card))] p-4 text-center">
              <p className="text-xs text-[hsl(var(--muted-foreground))]">Percentage</p>
              <p className="mt-1 text-2xl font-bold">{exam.studentResult.percentage !== null && exam.studentResult.percentage !== undefined ? `${Number(exam.studentResult.percentage).toFixed(1)}%` : 'N/A'}</p>
            </div>
            <div className="rounded-lg border bg-[hsl(var(--card))] p-4 text-center">
              <p className="text-xs text-[hsl(var(--muted-foreground))]">Status</p>
              <span className={`mt-1 inline-block rounded-full px-3 py-1 text-xs font-bold ${
                exam.studentResult.status === 'PASSED'
                  ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200'
                  : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200'
              }`}>
                {exam.studentResult.status}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Scheduled Subjects */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Scheduled Subject Papers</CardTitle>
            <CardDescription>Subject exam timetable, maximum marks, pass criteria, and student mark entry.</CardDescription>
          </div>
          {isAdminOrHOD && (
            <Button variant="outline" onClick={() => setShowAddSubject(!showAddSubject)}>
              {showAddSubject ? 'Cancel' : '+ Schedule Subject'}
            </Button>
          )}
        </CardHeader>
        <CardContent className="grid gap-4">
          {showAddSubject && (
            <form onSubmit={handleAddSubjectSubmit} className="grid gap-4 rounded-lg border bg-[hsl(var(--muted))] p-4">
              <h3 className="font-semibold">Schedule Subject Paper</h3>
              <div className="grid gap-4 sm:grid-cols-3">
                <Input label="Subject ID" name="subjectId" placeholder="e.g. subject-id or code" required />
                <Input label="Semester ID" name="semesterId" placeholder="e.g. semester-id" required />
                <Input label="Section ID (Optional)" name="sectionId" placeholder="e.g. section-id" />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <Input label="Date & Time" name="examAt" type="datetime-local" required />
                <Input label="Max Marks" name="maxMarks" type="number" defaultValue="100" min="1" required />
                <Input label="Pass Marks" name="passMarks" type="number" defaultValue="40" min="0" required />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="submit" loading={addingSubject}>
                  Save Schedule
                </Button>
              </div>
            </form>
          )}

          {exam.examSubjects && exam.examSubjects.length ? (
            <Table>
              <thead>
                <tr>
                  <TableHead>Subject Code / Name</TableHead>
                  <TableHead>Semester / Section</TableHead>
                  <TableHead>Exam Date</TableHead>
                  <TableHead>Max / Pass Marks</TableHead>
                  <TableHead>Marks</TableHead>
                  <TableHead>Actions</TableHead>
                </tr>
              </thead>
              <tbody>
                {exam.examSubjects.map((sub) => (
                  <tr key={sub.id}>
                    <TableCell>
                      <strong>{sub.subject?.name ?? sub.subjectId}</strong>
                      <span className="block text-xs text-[hsl(var(--muted-foreground))]">{sub.subject?.code ?? ''}</span>
                    </TableCell>
                    <TableCell>
                      {sub.semester?.name ?? sub.semesterId} {sub.section ? `· Section ${sub.section.code}` : ''}
                    </TableCell>
                    <TableCell>{new Date(sub.examAt).toLocaleString()}</TableCell>
                    <TableCell>
                      {sub.maxMarks} Max / {sub.passMarks} Pass
                    </TableCell>
                    <TableCell>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${MARKS_BADGE[sub.marksStatus ?? 'DRAFT']}`}>
                        {sub.marksStatus === 'SUBMITTED' ? 'Awaiting review' : sub.marksStatus === 'APPROVED' ? 'Approved' : 'Draft'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {isStaff && (
                          <Link href={`/dashboard/exams/${exam.id}/subjects/${sub.id}/marks`}>
                            <Button variant="outline" className="text-xs">
                              Enter / View Marks
                            </Button>
                          </Link>
                        )}
                        {isAdminOrHOD && sub.marksStatus === 'DRAFT' && (
                          <Button variant="ghost" className="text-xs text-red-600" onClick={() => ask({ kind: 'remove-paper', examSubjectId: sub.id })}>
                            Remove
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState
              title="No subjects scheduled yet"
              description="Add subject papers to set exam schedules and enable student mark entries."
            />
          )}
        </CardContent>
      </Card>

      {/* Calculated Results Table for Staff */}
      {isStaff && (
        <Card>
          <CardHeader>
            <CardTitle>Published Student Results ({results.length})</CardTitle>
            <CardDescription>Calculated student totals, percentages, and term pass/fail standing.</CardDescription>
          </CardHeader>
          <CardContent>
            {results.length ? (
              <Table>
                <thead>
                  <tr>
                    <TableHead>Student Code / Name</TableHead>
                    <TableHead>Total Marks</TableHead>
                    <TableHead>Percentage</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Published Date</TableHead>
                  </tr>
                </thead>
                <tbody>
                  {results.map((res) => (
                    <tr key={res.id}>
                      <TableCell>
                        <strong>{res.student?.firstName} {res.student?.lastName}</strong>
                        <span className="block text-xs text-[hsl(var(--muted-foreground))]">{res.student?.studentCode}</span>
                      </TableCell>
                      <TableCell>{res.totalMarks ?? 'N/A'}</TableCell>
                      <TableCell>{res.percentage !== null && res.percentage !== undefined ? `${Number(res.percentage).toFixed(1)}%` : 'N/A'}</TableCell>
                      <TableCell>
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          res.status === 'PASSED'
                            ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200'
                            : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200'
                        }`}>
                          {res.status}
                        </span>
                      </TableCell>
                      <TableCell>{res.publishedAt ? new Date(res.publishedAt).toLocaleDateString() : 'N/A'}</TableCell>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <EmptyState
                title="No results calculated yet"
                description="Click 'Calculate & Publish Results' above after entering student marks."
              />
            )}
          </CardContent>
        </Card>
      )}

      <Dialog
        open={pending !== null}
        title={pending ? PENDING_COPY[pending.kind].title : ''}
        description={pending ? PENDING_COPY[pending.kind].description : undefined}
        onClose={() => setPending(null)}
      >
        {pendingError && (
          <p role="alert" className="mb-3 text-sm text-[hsl(var(--destructive))]">
            {pendingError}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setPending(null)}>
            Cancel
          </Button>
          <Button variant={pending?.kind === 'publish' ? 'primary' : 'destructive'} loading={calcLoading} onClick={() => void runPending()}>
            {pending ? PENDING_COPY[pending.kind].confirm : ''}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
