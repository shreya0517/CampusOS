'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useDeferredValue, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { EmptyState, ErrorState, Skeleton } from '@/components/feedback/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/form-field';
import { Pagination } from '@/components/ui/pagination';
import { Table, TableCell, TableHead } from '@/components/ui/table';
import { listDepartments } from '@/lib/faculty-api';
import type { Department } from '@/lib/faculty-api';
import { exportStudentsCsv, listStudents } from '@/lib/student-api';
import type { Student } from '@/lib/student-api';
import { AccountBadge } from '@/components/students/account-badge';

const PAGE_SIZE = 20;

export default function StudentsPage() {
  const router = useRouter();
  const { primaryRole, loading: authLoading } = useAuth();
  const isAdmin = primaryRole === 'Admin';
  const showAccounts = isAdmin || primaryRole === 'HOD';

  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [departmentId, setDepartmentId] = useState('');
  const [accountStatus, setAccountStatus] = useState('');
  const [departments, setDepartments] = useState<Department[]>([]);
  const [page, setPage] = useState(1);
  const [students, setStudents] = useState<Student[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!authLoading && primaryRole === 'Student') router.replace('/dashboard/student');
  }, [authLoading, primaryRole, router]);

  useEffect(() => {
    if (isAdmin) listDepartments(new URLSearchParams({ page: '1', pageSize: '100' })).then((list) => setDepartments(list.items)).catch(() => undefined);
  }, [isAdmin]);

  const filters = (): URLSearchParams => {
    const params = new URLSearchParams();
    if (deferredSearch.trim()) params.set('search', deferredSearch.trim());
    if (departmentId) params.set('departmentId', departmentId);
    if (accountStatus) params.set('accountStatus', accountStatus);
    return params;
  };

  const load = async () => {
    if (primaryRole === 'Student') return;
    setLoading(true);
    setError(null);
    try {
      const params = filters();
      params.set('page', String(page));
      params.set('pageSize', String(PAGE_SIZE));
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
    if (!authLoading && primaryRole !== 'Student') void load();
  }, [authLoading, primaryRole, deferredSearch, departmentId, accountStatus, page]);

  const downloadCsv = async () => {
    setExporting(true);
    setError(null);
    try {
      const blob = await exportStudentsCsv(filters());
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `students-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The export could not be downloaded.');
    } finally {
      setExporting(false);
    }
  };

  if (authLoading || primaryRole === 'Student') return null;

  const filtered = Boolean(search || departmentId || accountStatus);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Students</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            {primaryRole === 'HOD'
              ? 'Students enrolled in your department.'
              : primaryRole === 'Faculty'
                ? 'Students in the sections you teach.'
                : 'Every student enrolled in the college.'}
          </p>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" loading={exporting} onClick={() => void downloadCsv()}>
              Export CSV
            </Button>
            <Link href="/dashboard/students/new">
              <Button>+ Add Student</Button>
            </Link>
          </div>
        )}
      </div>

      <Card>
        <CardContent className="grid gap-4">
          <div className={`grid gap-3 ${isAdmin ? 'md:grid-cols-[minmax(0,1fr)_16rem_12rem]' : showAccounts ? 'md:grid-cols-[minmax(0,1fr)_12rem]' : ''}`}>
            <Input
              label="Search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Name or student code"
            />
            {isAdmin && (
              <Select
                label="Department"
                value={departmentId}
                onChange={(event) => {
                  setDepartmentId(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">All departments</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </Select>
            )}
            {showAccounts && (
              <Select
                label="Account"
                value={accountStatus}
                onChange={(event) => {
                  setAccountStatus(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">Any status</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
                <option value="NO_ACCOUNT">No account</option>
              </Select>
            )}
          </div>

          {loading ? (
            <div className="grid gap-2">
              {[0, 1, 2].map((index) => (
                <Skeleton key={index} className="h-12 w-full" />
              ))}
            </div>
          ) : error ? (
            <ErrorState message={error} onRetry={() => void load()} />
          ) : students.length ? (
            <>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                {total} student{total === 1 ? '' : 's'}
                {filtered ? ' match these filters' : ''}
              </p>
              <Table>
                <thead>
                  <tr>
                    <TableHead>Student</TableHead>
                    {showAccounts && <TableHead>Email</TableHead>}
                    <TableHead>Department</TableHead>
                    <TableHead>Course</TableHead>
                    <TableHead>Semester · Section</TableHead>
                    {showAccounts && <TableHead>Account</TableHead>}
                    <TableHead className="text-right">Record</TableHead>
                  </tr>
                </thead>
                <tbody>
                  {students.map((student) => {
                    const enrollment = student.enrollments.find((item) => item.status === 'ACTIVE') ?? student.enrollments[0];
                    const section = enrollment?.section;
                    return (
                      <tr key={student.id}>
                        <TableCell>
                          <Link href={`/dashboard/students/${student.id}`} className="font-semibold hover:underline">
                            {student.firstName} {student.lastName}
                          </Link>
                          <span className="block text-xs text-[hsl(var(--muted-foreground))]">{student.studentCode}</span>
                        </TableCell>
                        {showAccounts && <TableCell className="text-[hsl(var(--muted-foreground))]">{student.account?.email ?? '—'}</TableCell>}
                        <TableCell>{section ? section.semester.course.department.code : '—'}</TableCell>
                        <TableCell>{section ? section.semester.course.name : <span className="text-[hsl(var(--muted-foreground))]">Not enrolled</span>}</TableCell>
                        <TableCell>
                          {section ? `${section.semester.name} · ${section.code}` : '—'}
                          {enrollment && enrollment.status !== 'ACTIVE' && (
                            <span className="ml-2 text-xs font-semibold text-amber-700 dark:text-amber-400">{enrollment.status === 'COMPLETED' ? 'Completed' : 'Withdrawn'}</span>
                          )}
                        </TableCell>
                        {showAccounts && (
                          <TableCell>
                            <AccountBadge account={student.account ?? null} />
                          </TableCell>
                        )}
                        <TableCell className="text-right">
                          <Link className="font-semibold text-[hsl(var(--primary))] hover:underline" href={`/dashboard/students/${student.id}`}>
                            View
                          </Link>
                        </TableCell>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
              <Pagination page={page} pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))} onPageChange={setPage} />
            </>
          ) : (
            <EmptyState
              title="No students found"
              description={filtered ? 'Try changing the search or filters.' : 'Students appear here once they are added and enrolled.'}
              action={
                filtered ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearch('');
                      setDepartmentId('');
                      setAccountStatus('');
                    }}
                  >
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
