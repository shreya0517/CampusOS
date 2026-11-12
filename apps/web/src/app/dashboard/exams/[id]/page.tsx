'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { EmptyState, ErrorState, Skeleton } from '@/components/feedback/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/form-field';
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

export default function ExamDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { primaryRole } = useAuth();
  const isStaff = primaryRole === 'Admin' || primaryRole === 'HOD' || primaryRole === 'Faculty';
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
    try {
      const updated = await updateExam(exam.id, { status: newStatus });
      setExam((prev) => (prev ? { ...prev, status: updated.status } : null));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update exam status.');
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleDeleteExam = async () => {
    if (!exam || !confirm(`Are you sure you want to delete "${exam.name}"?`)) return;
    try {
      await deleteExam(exam.id);
      router.push('/dashboard/exams');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete exam.');
    }
  };

  const handleAddSubjectSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setAddingSubject(true);
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
      alert(err instanceof Error ? err.message : 'Failed to schedule exam subject.');
    } finally {
      setAddingSubject(false);
    }
  };

  const handleRemoveSubject = async (examSubjectId: string) => {
    if (!confirm('Remove this scheduled subject paper?')) return;
    try {
      await removeExamSubject(id, examSubjectId);
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to remove scheduled subject.');
    }
  };

  const handlePublishResults = async () => {
    if (!confirm('Calculate total marks, percentages, and publish student results for this exam?')) return;
    setCalcLoading(true);
    try {
      const res = await calculateAndPublishResults(id);
      alert(`Results calculated successfully for ${res.processedStudents} students!`);
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to calculate results.');
    } finally {
      setCalcLoading(false);
    }
  };

  if (loading) return <Skeleton className="h-96 w-full" />;
  if (error || !exam) return <ErrorState message={error ?? 'Exam not found'} onRetry={() => void loadData()} />;

  return (
    <div className="grid gap-6">
      <div>
        <Link href="/dashboard/exams" className="text-sm font-semibold text-[hsl(var(--primary))] hover:underline">
          &larr; Back to Exams
        </Link>
        <div className="mt-2 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-semibold">{exam.name}</h1>
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

              <Button variant="primary" loading={calcLoading} onClick={() => void handlePublishResults()}>
                Calculate & Publish Results
              </Button>

              {isAdminOrHOD && (
                <Button variant="destructive" onClick={() => void handleDeleteExam()}>
                  Delete Exam
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

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
          {isStaff && (
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
                      <div className="flex items-center gap-2">
                        {isStaff && (
                          <Link href={`/dashboard/exams/${exam.id}/subjects/${sub.id}/marks`}>
                            <Button variant="outline" className="text-xs">
                              Enter / View Marks
                            </Button>
                          </Link>
                        )}
                        {isStaff && (
                          <Button variant="ghost" className="text-xs text-red-600" onClick={() => void handleRemoveSubject(sub.id)}>
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
    </div>
  );
}
