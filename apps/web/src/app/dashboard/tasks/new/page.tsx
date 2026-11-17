'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/form-field';
import { createTask, type TaskPriority } from '@/lib/tasks-api';
import { listDepartments } from '@/lib/faculty-api';
import { useEffect } from 'react';
import type { Department } from '@/lib/faculty-api';

export default function NewTaskPage() {
  const { primaryRole } = useAuth();
  const router = useRouter();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [form, setForm] = useState({
    title: '',
    description: '',
    priority: 'MEDIUM' as TaskPriority,
    deadline: '',
    departmentId: '',
  });
  const [errors, setErrors] = useState<Partial<typeof form>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const isAdmin = primaryRole === 'Admin';

  useEffect(() => {
    if (isAdmin) {
      listDepartments().then((r) => setDepartments(r.items)).catch(() => undefined);
    }
  }, [isAdmin]);

  const validate = () => {
    const e: Partial<typeof form> = {};
    if (!form.title.trim()) e.title = 'Title is required.';
    if (!form.deadline) e.deadline = 'Deadline is required.';
    return e;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSubmitting(true);
    setServerError(null);
    try {
      const task = await createTask({
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        priority: form.priority,
        deadline: new Date(form.deadline).toISOString(),
        departmentId: form.departmentId || undefined,
      });
      router.push(`/dashboard/tasks/${task.id}`);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Failed to create task.');
      setSubmitting(false);
    }
  };

  if (primaryRole !== 'Admin' && primaryRole !== 'HOD') {
    return (
      <div className="grid gap-4">
        <h1 className="text-2xl font-semibold">Access Denied</h1>
        <p className="text-[hsl(var(--muted-foreground))]">Only Admin and HOD can create tasks.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[.16em] text-[hsl(var(--primary))]">Tasks</p>
        <h1 className="mt-2 text-3xl font-semibold">Create Task</h1>
        <p className="mt-2 text-[hsl(var(--muted-foreground))]">Assign a new task to HOD or faculty.</p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Task Details</CardTitle>
          <CardDescription>Fill in the task information and set a deadline.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
            <Input
              label="Title"
              required
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              error={errors.title}
            />
            <div className="grid gap-1">
              <label className="text-sm font-medium">Description</label>
              <textarea
                className="min-h-24 w-full rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                placeholder="Optional task details…"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <Select
              label="Priority"
              value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as TaskPriority }))}
            >
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </Select>
            <Input
              label="Deadline"
              type="datetime-local"
              required
              value={form.deadline}
              onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))}
              error={errors.deadline}
            />
            {isAdmin && departments.length > 0 && (
              <Select
                label="Department (optional)"
                value={form.departmentId}
                onChange={(e) => setForm((f) => ({ ...f, departmentId: e.target.value }))}
              >
                <option value="">All departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </Select>
            )}
            {serverError && (
              <p className="rounded-[var(--radius)] bg-[hsl(var(--destructive))]/10 px-3 py-2 text-sm text-[hsl(var(--destructive))]">
                {serverError}
              </p>
            )}
            <div className="flex gap-3">
              <Button type="submit" loading={submitting}>Create Task</Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
