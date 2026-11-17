'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useDeferredValue, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { EmptyState, ErrorState, Skeleton } from '@/components/feedback/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/form-field';
import { Pagination } from '@/components/ui/pagination';
import { Table, TableCell, TableHead } from '@/components/ui/table';
import { listStudents } from '@/lib/student-api';
import type { Student } from '@/lib/student-api';

export default function StudentsPage() {
  const router = useRouter();
  const { primaryRole, loading: authLoading } = useAuth();

  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [departmentId, setDepartmentId] = useState('');
  const [page, setPage] = useState(1);
  const [students, setStudents] = useState<Student[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && primaryRole === 'Student') {
      router.replace('/dashboard/student');
    }
  }, [authLoading, primaryRole, router]);

  const load = async () => {
    if (primaryRole === 'Student') return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (deferredSearch) params.set('search', deferredSearch);
      if (departmentId) params.set('departmentId', departmentId);
      const result = await listStudents(params);
      setStudents(result.items);
      setTotal(result.total);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Student records could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && primaryRole !== 'Student') {
      void load();
    }
  }, [authLoading, primaryRole, deferredSearch, departmentId, page]);

  if (authLoading || primaryRole === 'Student') {
    return null;
  }

  return (
    <div className="grid gap-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[.16em] text-[hsl(var(--primary))]">Students</p>
        <h1 className="mt-2 text-3xl font-semibold">Student Management</h1>
        <p className="mt-2 text-[hsl(var(--muted-foreground))]">Live records are scoped by the authenticated CampusOS account.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Directory</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-[1fr_14rem_auto]">
            <Input
              label="Search students"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Name or student code"
            />
            <Input
              label="Department ID filter"
              value={departmentId}
              onChange={(event) => {
                setDepartmentId(event.target.value);
                setPage(1);
              }}
              placeholder="Optional department ID"
            />
            <Button className="self-end" variant="outline" onClick={() => void load()}>
              Refresh
            </Button>
          </div>
          {loading ? (
            <div className="grid gap-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : error ? (
            <ErrorState message={error} onRetry={() => void load()} />
          ) : students.length ? (
            <>
              <Table>
                <thead>
                  <tr>
                    <TableHead>Student</TableHead>
                    <TableHead>Enrollment</TableHead>
                    <TableHead>Profile</TableHead>
                  </tr>
                </thead>
                <tbody>
                  {students.map((student) => {
                    const enrollment = student.enrollments[0];
                    return (
                      <tr key={student.id}>
                        <TableCell>
                          <strong>
                            {student.firstName} {student.lastName}
                          </strong>
                          <span className="block text-xs text-[hsl(var(--muted-foreground))]">{student.studentCode}</span>
                        </TableCell>
                        <TableCell>
                          {enrollment
                            ? `${enrollment.section.semester.course.name} · ${enrollment.section.semester.name} · ${enrollment.section.code}`
                            : 'No enrollment'}
                        </TableCell>
                        <TableCell>
                          <Link className="font-semibold text-[hsl(var(--primary))] underline" href={`/dashboard/students/${student.id}`}>
                            View
                          </Link>
                        </TableCell>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
              <Pagination page={page} pageCount={Math.max(1, Math.ceil(total / 20))} onPageChange={setPage} />
            </>
          ) : (
            <EmptyState
              title="No students found"
              description="Try changing the search or department filter."
              action={
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearch('');
                    setDepartmentId('');
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}