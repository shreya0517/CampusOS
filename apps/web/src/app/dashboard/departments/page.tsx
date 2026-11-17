'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { ErrorState, Skeleton } from '@/components/feedback/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/form-field';
import { Table, TableCell, TableHead } from '@/components/ui/table';
import { createDepartment, listDepartments, updateDepartment } from '@/lib/faculty-api';
import type { Department } from '@/lib/faculty-api';

export default function DepartmentsPage() {
  const { primaryRole } = useAuth();
  const isAdmin = primaryRole === 'Admin';
  const canEdit = primaryRole === 'Admin' || primaryRole === 'HOD';

  const [items, setItems] = useState<Department[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Department | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      setItems((await listDepartments()).items);
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

  return (
    <div className="grid gap-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[.16em] text-[hsl(var(--primary))]">Departments</p>
        <h1 className="mt-2 text-3xl font-semibold">Department Management</h1>
      </div>

      {(isAdmin || (editing && canEdit)) && (
        <Card>
          <CardHeader>
            <CardTitle>{editing ? 'Edit Department' : 'Create Department'}</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-3 md:grid-cols-3"
              onSubmit={async (event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                try {
                  if (editing) {
                    await updateDepartment(editing.id, {
                      code: String(data.get('code')),
                      name: String(data.get('name')),
                    });
                  } else {
                    await createDepartment({
                      code: String(data.get('code')),
                      name: String(data.get('name')),
                    });
                  }
                  setEditing(null);
                  event.currentTarget.reset();
                  await load();
                } catch (reason) {
                  setError(reason instanceof Error ? reason.message : 'Save failed.');
                }
              }}
            >
              <Input label="Code" name="code" defaultValue={editing?.code} required />
              <Input label="Name" name="name" defaultValue={editing?.name} required />
              <div className="flex items-center gap-2 self-end">
                <Button type="submit">Save</Button>
                {editing && (
                  <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                    Cancel
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <Skeleton className="h-32 w-full" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : items.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Departments Directory</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <thead>
                <tr>
                  <TableHead>Department</TableHead>
                  <TableHead>Faculty Count</TableHead>
                  {canEdit && <TableHead>Action</TableHead>}
                </tr>
              </thead>
              <tbody>
                {items.map((department) => (
                  <tr key={department.id}>
                    <TableCell>
                      <strong>{department.name}</strong>
                      <span className="block text-xs text-[hsl(var(--muted-foreground))]">{department.code}</span>
                    </TableCell>
                    <TableCell>{department.faculty?.length ?? 0}</TableCell>
                    {canEdit && (
                      <TableCell>
                        <Button variant="ghost" onClick={() => setEditing(department)}>
                          Edit
                        </Button>
                      </TableCell>
                    )}
                  </tr>
                ))}
              </tbody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <Skeleton className="h-32 w-full" />
      )}
    </div>
  );
}