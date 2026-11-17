'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { ErrorState, Skeleton } from '@/components/feedback/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableCell, TableHead } from '@/components/ui/table';
import {
  deleteAssignment,
  getAssignment,
  gradeSubmission,
  listSubmissions,
  submitAssignment,
} from '@/lib/assignments-api';
import type { Assignment, Submission } from '@/lib/assignments-api';

function formatDate(iso: string | null): string {
  if (!iso) return 'No due date';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function AssignmentDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : Array.isArray(params?.id) ? params.id[0] : '';

  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [mySubmission, setMySubmission] = useState<Submission | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Student submission form state
  const [fileKey, setFileKey] = useState('');
  const [submittingWork, setSubmittingWork] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);

  // Grading state
  const [gradingSubmissionId, setGradingSubmissionId] = useState<string | null>(null);
  const [marksInput, setMarksInput] = useState('');
  const [feedbackInput, setFeedbackInput] = useState('');
  const [gradingError, setGradingError] = useState<string | null>(null);
  const [gradingSuccess, setGradingSuccess] = useState<string | null>(null);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getAssignment(id);
      setAssignment(data);
      if (data.mySubmission) {
        setMySubmission(data.mySubmission);
        setFileKey(data.mySubmission.fileKey ?? '');
      }

      // Try fetching faculty/admin submissions list (will throw 403 if user is a student)
      try {
        const subs = await listSubmissions(id);
        setSubmissions(subs);
      } catch {
        // Expected for students
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load assignment details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [id]);

  const handleSubmitWork = async (e: FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setSubmittingWork(true);
    setSubmitMessage(null);
    try {
      const sub = await submitAssignment(id, { fileKey: fileKey.trim() || undefined });
      setMySubmission(sub);
      setSubmitMessage('Assignment submitted successfully!');
    } catch (err) {
      setSubmitMessage(err instanceof Error ? err.message : 'Failed to submit assignment.');
    } finally {
      setSubmittingWork(false);
    }
  };

  const handleDeleteAssignment = async () => {
    if (!id || !confirm('Are you sure you want to delete this assignment?')) return;
    try {
      await deleteAssignment(id);
      router.push('/dashboard/assignments');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete assignment.');
    }
  };

  const handleGradeSubmit = async (submissionId: string) => {
    if (!id || !marksInput) return;
    setGradingError(null);
    setGradingSuccess(null);
    try {
      const updated = await gradeSubmission(id, submissionId, {
        marksAwarded: Number(marksInput),
        feedback: feedbackInput.trim() || undefined,
      });
      setSubmissions((prev) => prev.map((s) => (s.id === submissionId ? updated : s)));
      setGradingSubmissionId(null);
      setGradingSuccess('Grade saved successfully.');
    } catch (err) {
      setGradingError(err instanceof Error ? err.message : 'Failed to save grade.');
    }
  };

  if (loading) {
    return (
      <div className="grid gap-6">
        <Skeleton className="h-12 w-3/4" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error || !assignment) {
    return <ErrorState message={error || 'Assignment not found.'} onRetry={() => void load()} />;
  }

  return (
    <div className="grid gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[.16em] text-[hsl(var(--primary))]">
            {assignment.class.subject.name} ({assignment.class.section.code})
          </p>
          <h1 className="mt-2 text-3xl font-semibold">{assignment.title}</h1>
          <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
            {assignment.class.section.semester.course.name} · Department of {assignment.class.section.semester.course.department.name}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push('/dashboard/assignments')}>Back</Button>
          {submissions.length > 0 && (
            <Button variant="destructive" onClick={() => void handleDeleteAssignment()}>Delete</Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Assignment Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Instructions</h3>
              <p className="mt-1 whitespace-pre-wrap text-sm text-[hsl(var(--foreground))]">
                {assignment.description || 'No detailed instructions provided.'}
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-4 border-t border-[hsl(var(--border))]">
              <div>
                <span className="block text-xs text-[hsl(var(--muted-foreground))]">Due Date</span>
                <span className="font-semibold text-sm">{formatDate(assignment.dueAt)}</span>
              </div>
              <div>
                <span className="block text-xs text-[hsl(var(--muted-foreground))]">Max Marks</span>
                <span className="font-semibold text-sm">{assignment.maxMarks}</span>
              </div>
              <div>
                <span className="block text-xs text-[hsl(var(--muted-foreground))]">Created By</span>
                <span className="font-semibold text-sm">
                  {assignment.createdBy ? `${assignment.createdBy.firstName} ${assignment.createdBy.lastName}` : 'Faculty'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Student Submission Card */}
        <Card>
          <CardHeader>
            <CardTitle>Your Submission</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {mySubmission ? (
              <div className="rounded-lg border border-[hsl(var(--border))] p-4 bg-[hsl(var(--card))]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--primary))]">Status</span>
                  <span className="px-2 py-1 text-xs font-semibold rounded bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]">
                    {mySubmission.status}
                  </span>
                </div>
                {mySubmission.submittedAt && (
                  <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
                    Submitted on: {formatDate(mySubmission.submittedAt)}
                  </p>
                )}
                {mySubmission.fileKey && (
                  <p className="mt-2 text-sm font-medium truncate">
                    Submission Ref: <span className="font-mono">{mySubmission.fileKey}</span>
                  </p>
                )}
                {mySubmission.marksAwarded !== null && (
                  <div className="mt-4 pt-3 border-t border-[hsl(var(--border))]">
                    <span className="block text-xs font-semibold text-[hsl(var(--muted-foreground))]">Grade Received</span>
                    <span className="text-xl font-bold text-[hsl(var(--primary))]">
                      {mySubmission.marksAwarded} / {assignment.maxMarks}
                    </span>
                    {mySubmission.feedback && (
                      <p className="mt-2 text-xs italic text-[hsl(var(--foreground))]">
                        Feedback: &quot;{mySubmission.feedback}&quot;
                      </p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-[hsl(var(--muted-foreground))]">You have not submitted work for this assignment yet.</p>
            )}

            <form onSubmit={handleSubmitWork} className="grid gap-3 pt-2">
              <label className="block text-xs font-semibold uppercase text-[hsl(var(--muted-foreground))]">
                {mySubmission ? 'Resubmit / Update Work' : 'Submit Work'}
              </label>
              <input
                placeholder="Enter file link, key, or submission note..."
                value={fileKey}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setFileKey(e.target.value)}
                className="w-full min-h-10 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm"
                required
              />
              <Button type="submit" disabled={submittingWork || !fileKey.trim()}>
                {submittingWork ? 'Submitting...' : mySubmission ? 'Update Submission' : 'Submit Assignment'}
              </Button>
              {submitMessage && (
                <p className="text-xs font-medium text-[hsl(var(--primary))]">{submitMessage}</p>
              )}
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Submissions Section for Faculty / HOD / Admin */}
      {submissions.length > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Student Submissions ({submissions.length})</CardTitle>
              {gradingSuccess && <p className="text-xs font-semibold text-green-600">{gradingSuccess}</p>}
            </div>
          </CardHeader>
          <CardContent>
            {gradingError && <div className="mb-4"><ErrorState message={gradingError} /></div>}
            <Table>
              <thead>
                <tr>
                  <TableHead>Student</TableHead>
                  <TableHead>Submitted At</TableHead>
                  <TableHead>Submission Key / Link</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Marks</TableHead>
                  <TableHead>Action</TableHead>
                </tr>
              </thead>
              <tbody>
                {submissions.map((sub) => (
                  <tr key={sub.id}>
                    <TableCell>
                      <strong>{sub.student ? `${sub.student.firstName} ${sub.student.lastName}` : sub.studentId}</strong>
                      {sub.student && (
                        <span className="block text-xs text-[hsl(var(--muted-foreground))]">{sub.student.studentCode}</span>
                      )}
                    </TableCell>
                    <TableCell>{formatDate(sub.submittedAt)}</TableCell>
                    <TableCell className="font-mono text-xs max-w-xs truncate">{sub.fileKey || 'N/A'}</TableCell>
                    <TableCell>
                      <span className="px-2 py-1 text-xs font-semibold rounded bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]">
                        {sub.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      {sub.marksAwarded !== null ? `${sub.marksAwarded} / ${assignment.maxMarks}` : '-'}
                    </TableCell>
                    <TableCell>
                      {gradingSubmissionId === sub.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            placeholder="Marks"
                            className="w-20 h-8 px-2 text-xs rounded border border-[hsl(var(--border))]"
                            value={marksInput}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => setMarksInput(e.target.value)}
                          />
                          <input
                            placeholder="Feedback (optional)"
                            className="w-36 h-8 px-2 text-xs rounded border border-[hsl(var(--border))]"
                            value={feedbackInput}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => setFeedbackInput(e.target.value)}
                          />
                          <Button variant="secondary" onClick={() => void handleGradeSubmit(sub.id)}>Save</Button>
                          <Button variant="ghost" onClick={() => setGradingSubmissionId(null)}>Cancel</Button>
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          onClick={() => {
                            setGradingSubmissionId(sub.id);
                            setMarksInput(sub.marksAwarded !== null ? String(sub.marksAwarded) : '');
                            setFeedbackInput(sub.feedback || '');
                          }}
                        >
                          Grade
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
    </div>
  );
}
