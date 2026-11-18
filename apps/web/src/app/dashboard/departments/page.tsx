'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { EmptyState, ErrorState, Skeleton } from '@/components/feedback/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/form-field';
import { Dialog } from '@/components/ui/interactive';
import { Table, TableCell, TableHead } from '@/components/ui/table';
import { createDepartment, listDepartments, updateDepartment } from '@/lib/faculty-api';
import type { Department } from '@/lib/faculty-api';

export default function DepartmentsPage() {
  const { primaryRole } = useAuth();
  // Departments are created and edited by Admin.
  const isAdmin = primaryRole === 'Admin';

  const [items, setItems] = useState<Department[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // `null` closes the dialog; an empty object opens it to create; a department opens it to edit.
  const [editing, setEditing] = useState<Department | Record<string, never> | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setItems((await listDepartments(new URLSearchParams({ page: '1', pageSize: '100' }))).items);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Departments could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const current = editing && 'id' in editing ? editing : null;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Departments</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            {isAdmin ? "The college's departments with their heads, people and programmes." : 'Your department at a glance.'}
          </p>
        </div>
        {isAdmin && (
          <Button
            onClick={() => {
              setFormError(null);
              setEditing({});
            }}
          >
            + New Department
          </Button>
        )}
      </div>

      {loading ? (
        <Skeleton className="h-48 w-full" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : items.length === 0 ? (
        <EmptyState title="No departments yet" description={isAdmin ? 'Create the first department to start adding courses, faculty and students.' : 'No department is linked to your profile.'} />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <thead>
                <tr>
                  <TableHead>Department</TableHead>
                  <TableHead>Head of Department</TableHead>
                  <TableHead className="text-right">Faculty</TableHead>
                  <TableHead className="text-right">Students</TableHead>
                  <TableHead className="text-right">Courses</TableHead>
                  <TableHead className="text-right">Subjects</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </tr>
              </thead>
              <tbody>
                {items.map((department) => (
                  <tr key={department.id}>
                    <TableCell>
                      <Link href={`/dashboard/departments/${department.id}`} className="font-semibold hover:underline">
                        {department.name}
                      </Link>
                      <span className="block text-xs text-[hsl(var(--muted-foreground))]">{department.code}</span>
                    </TableCell>
                    <TableCell>
                      {department.hod ? (
                        <>
                          <Link href={`/dashboard/faculty/${department.hod.facultyId}`} className="hover:underline">
                            {department.hod.name}
                          </Link>
                          {department.hod.designation && <span className="block text-xs text-[hsl(var(--muted-foreground))]">{department.hod.designation}</span>}
                        </>
                      ) : (
                        <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">Not assigned</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{department.counts?.faculty ?? 0}</TableCell>
                    <TableCell className="text-right tabular-nums">{department.counts?.students ?? 0}</TableCell>
                    <TableCell className="text-right tabular-nums">{department.counts?.courses ?? 0}</TableCell>
                    <TableCell className="text-right tabular-nums">{department.counts?.subjects ?? 0}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-3">
                        {isAdmin && (
                          <button
                            type="button"
                            className="text-sm font-semibold text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                            onClick={() => {
                              setFormError(null);
                              setEditing(department);
                            }}
                          >
                            Edit
                          </button>
                        )}
                        <Link href={`/dashboard/departments/${department.id}`} className="text-sm font-semibold text-[hsl(var(--primary))] hover:underline">
                          {isAdmin ? 'Manage' : 'View'}
                        </Link>
                      </div>
                    </TableCell>
                  </tr>
                ))}
              </tbody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={editing !== null} title={current ? `Edit ${current.name}` : 'New department'} onClose={() => setEditing(null)}>
        <form
          className="grid gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const input = { code: String(data.get('code')).trim(), name: String(data.get('name')).trim() };
            setSaving(true);
            setFormError(null);
            try {
              if (current) await updateDepartment(current.id, input);
              else await createDepartment(input);
              setEditing(null);
              await load();
            } catch (reason) {
              setFormError(reason instanceof Error ? reason.message : 'The department could not be saved.');
            } finally {
              setSaving(false);
            }
          }}
        >
          <Input label="Code" name="code" defaultValue={current?.code} required minLength={2} placeholder="e.g. MECH" />
          <Input label="Name" name="name" defaultValue={current?.name} required minLength={2} placeholder="e.g. Mechanical Engineering" />
          {formError && (
            <p role="alert" className="text-sm text-[hsl(var(--destructive))]">
              {formError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {current ? 'Save changes' : 'Create department'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
