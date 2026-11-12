'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { ErrorState, Skeleton } from '@/components/feedback/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { createAssignment } from '@/lib/assignments-api';
import { listClasses } from '@/lib/attendance-api';
import type { ClassRecord } from '@/lib/attendance-api';

export default function NewAssignmentPage() {
  const router = useRouter();
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [classId, setClassId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [maxMarks, setMaxMarks] = useState('100');

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadClasses = async () => {
      try {
        const res = await listClasses(new URLSearchParams({ page: '1', pageSize: '100' }));
        setClasses(res.items);
        if (res.items.length > 0) {
          setClassId(res.items[0]!.id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load classes.');
      } finally {
        setLoading(false);
      }
    };
    void loadClasses();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!classId || !title.trim() || !maxMarks) return;

    setSubmitting(true);
    setError(null);
    try {
      const assignment = await createAssignment({
        classId,
        title: title.trim(),
        description: description.trim() || undefined,
        dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
        maxMarks: Number(maxMarks),
      });
      router.push(`/dashboard/assignments/${assignment.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create assignment.');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="grid gap-6">
        <Skeleton className="h-10 w-64" />
        <Card><CardContent className="p-6"><Skeleton className="h-40 w-full" /></CardContent></Card>
      </div>
    );
  }

  return (
    <div className="grid gap-6 max-w-3xl">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[.16em] text-[hsl(var(--primary))]">New Assignment</p>
        <h1 className="mt-2 text-3xl font-semibold">Create Assignment</h1>
        <p className="mt-2 text-[hsl(var(--muted-foreground))]">Publish a new assignment for a class section.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Assignment Details</CardTitle>
        </CardHeader>
        <CardContent>
          {error && <div className="mb-4"><ErrorState message={error} /></div>}
          <form onSubmit={handleSubmit} className="grid gap-4">
            <div>
              <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1">Class Section</label>
              {classes.length === 0 ? (
                <p className="text-sm text-[hsl(var(--muted-foreground))]">No classes available.</p>
              ) : (
                <select
                  value={classId}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) => setClassId(e.target.value)}
                  className="w-full rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                  required
                >
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.subject.name} — {c.section.semester.course.name} ({c.section.code})
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1">Title</label>
              <input
                value={title}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
                placeholder="e.g. Midterm Project - Algorithm Analysis"
                className="w-full min-h-10 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1">Description / Instructions</label>
              <textarea
                value={description}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setDescription(e.target.value)}
                placeholder="Detailed instructions or requirements..."
                rows={4}
                className="w-full rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1">Due Date & Time (Optional)</label>
                <input
                  type="datetime-local"
                  value={dueAt}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setDueAt(e.target.value)}
                  className="w-full min-h-10 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[hsl(var(--foreground))] mb-1">Max Marks</label>
                <input
                  type="number"
                  min="1"
                  value={maxMarks}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setMaxMarks(e.target.value)}
                  className="w-full min-h-10 rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 text-sm"
                  required
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-4">
              <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
              <Button type="submit" disabled={submitting || !classId || !title.trim()}>
                {submitting ? 'Publishing...' : 'Publish Assignment'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
