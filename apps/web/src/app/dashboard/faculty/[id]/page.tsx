'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { ErrorState, Skeleton } from '@/components/feedback/states';
import { TemporaryPasswordNotice } from '@/components/faculty/temporary-password-notice';
import { AccountBadge } from '@/components/students/account-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/form-field';
import { Dialog } from '@/components/ui/interactive';
import { Table, TableCell, TableHead } from '@/components/ui/table';
import { createFacultyAccount, getFaculty, listDepartments, setFacultyAccountStatus, updateFaculty } from '@/lib/faculty-api';
import type { Department, Faculty } from '@/lib/faculty-api';

export default function FacultyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { primaryRole } = useAuth();
  // Faculty records and accounts are managed by Admin.
  const canEdit = primaryRole === 'Admin';
  const seesWorkload = primaryRole === 'Admin' || primaryRole === 'HOD';

  const [faculty, setFaculty] = useState<Faculty | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [accountBusy, setAccountBusy] = useState(false);
  const [confirmingDeactivate, setConfirmingDeactivate] = useState(false);
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null);

  const load = async (): Promise<void> => {
    try {
      setFaculty(await getFaculty(id));
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Faculty could not be loaded.');
    }
  };

  useEffect(() => {
    void load();
  }, [id]);

  useEffect(() => {
    if (canEdit) listDepartments(new URLSearchParams({ page: '1', pageSize: '100' })).then((list) => setDepartments(list.items)).catch(() => undefined);
  }, [canEdit]);

  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!faculty) return <Skeleton className="h-48 w-full" />;

  const changeStatus = async (status: 'ACTIVE' | 'INACTIVE') => {
    setAccountBusy(true);
    setAccountError(null);
    try {
      setFaculty(await setFacultyAccountStatus(faculty.id, status));
      setConfirmingDeactivate(false);
    } catch (reason) {
      setAccountError(reason instanceof Error ? reason.message : 'The account could not be updated.');
    } finally {
      setAccountBusy(false);
    }
  };

  return (
    <div className="grid gap-6">
      <div>
        <Link className="text-sm font-semibold text-[hsl(var(--primary))] hover:underline" href="/dashboard/faculty">
          ← Faculty
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">
            {faculty.firstName} {faculty.lastName}
          </h1>
          {faculty.isHod && (
            <span className="rounded-full bg-[hsl(var(--sidebar-active))] px-2.5 py-0.5 text-xs font-semibold text-[hsl(var(--sidebar-active-foreground))]">Head of Department</span>
          )}
          {faculty.account !== undefined && <AccountBadge account={faculty.account} />}
        </div>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          {faculty.employeeCode}
          {faculty.designation ? ` · ${faculty.designation}` : ''}
          {faculty.department ? ` · ${faculty.department.name}` : ' · No department'}
          {faculty.account ? ` · ${faculty.account.email}` : ''}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{canEdit ? 'Professional details' : 'Profile'}</CardTitle>
          </CardHeader>
          <CardContent>
            {canEdit ? (
              <form
                className="grid gap-4 sm:grid-cols-2"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  const text = (key: string): string => String(data.get(key) ?? '').trim();
                  setSaving(true);
                  setFormError(null);
                  setSaved(false);
                  try {
                    setFaculty(
                      await updateFaculty(faculty.id, {
                        employeeCode: text('employeeCode'),
                        firstName: text('firstName'),
                        lastName: text('lastName'),
                        designation: text('designation') || null,
                        departmentId: text('departmentId') || null,
                      }),
                    );
                    setSaved(true);
                  } catch (reason) {
                    setFormError(reason instanceof Error ? reason.message : 'Profile could not be saved.');
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                <Input label="Employee ID" name="employeeCode" defaultValue={faculty.employeeCode} required />
                <Input label="Designation" name="designation" defaultValue={faculty.designation ?? ''} placeholder="e.g. Assistant Professor" maxLength={80} />
                <Input label="First name" name="firstName" defaultValue={faculty.firstName} required minLength={2} />
                <Input label="Last name" name="lastName" defaultValue={faculty.lastName} required minLength={2} />
                <div className="sm:col-span-2">
                  <Select label="Department" name="departmentId" defaultValue={faculty.departmentId ?? ''}>
                    <option value="">Not assigned</option>
                    {departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </Select>
                </div>
                {formError && (
                  <p role="alert" className="text-sm text-[hsl(var(--destructive))] sm:col-span-2">
                    {formError}
                  </p>
                )}
                <div className="flex items-center gap-3 sm:col-span-2">
                  <Button type="submit" loading={saving}>
                    Save details
                  </Button>
                  {saved && <span className="text-sm text-emerald-700 dark:text-emerald-400">Saved</span>}
                </div>
              </form>
            ) : (
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-[hsl(var(--muted-foreground))]">Employee ID</dt>
                  <dd className="font-medium">{faculty.employeeCode}</dd>
                </div>
                <div>
                  <dt className="text-[hsl(var(--muted-foreground))]">Designation</dt>
                  <dd className="font-medium">{faculty.designation ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-[hsl(var(--muted-foreground))]">Department</dt>
                  <dd className="font-medium">{faculty.department?.name ?? '—'}</dd>
                </div>
              </dl>
            )}
          </CardContent>
        </Card>

        {canEdit && (
          <Card>
            <CardHeader>
              <CardTitle>Sign-in account</CardTitle>
              <CardDescription>Deactivating signs the person out everywhere and blocks sign-in; their records stay.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              {issued && <TemporaryPasswordNotice email={issued.email} password={issued.password} />}
              {faculty.account ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm">
                    <p className="font-medium">{faculty.account.email}</p>
                    <p className="text-[hsl(var(--muted-foreground))]">{faculty.account.status === 'ACTIVE' ? 'Can sign in' : 'Sign-in blocked'}</p>
                  </div>
                  <Button
                    variant={faculty.account.status === 'ACTIVE' ? 'outline' : 'primary'}
                    loading={accountBusy && !confirmingDeactivate}
                    onClick={() => (faculty.account?.status === 'ACTIVE' ? setConfirmingDeactivate(true) : void changeStatus('ACTIVE'))}
                  >
                    {faculty.account.status === 'ACTIVE' ? 'Deactivate account' : 'Activate account'}
                  </Button>
                </div>
              ) : (
                <form
                  className="grid gap-3"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const email = String(new FormData(event.currentTarget).get('email') ?? '').trim();
                    setAccountBusy(true);
                    setAccountError(null);
                    try {
                      const result = await createFacultyAccount(faculty.id, email);
                      setFaculty(result);
                      setIssued({ email: result.account?.email ?? email, password: result.temporaryPassword });
                    } catch (reason) {
                      setAccountError(reason instanceof Error ? reason.message : 'The account could not be created.');
                    } finally {
                      setAccountBusy(false);
                    }
                  }}
                >
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">No sign-in account yet. Create one with their college email.</p>
                  <Input label="College email" name="email" type="email" required autoComplete="off" />
                  <Button type="submit" loading={accountBusy} className="justify-self-start">
                    Create account
                  </Button>
                </form>
              )}
              {accountError && !confirmingDeactivate && (
                <p role="alert" className="text-sm text-[hsl(var(--destructive))]">
                  {accountError}
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>Assigned classes</CardTitle>
            <CardDescription>Subjects and sections this faculty member teaches.</CardDescription>
          </div>
          {seesWorkload && (
            <Link href="/dashboard/faculty-performance" className="text-sm font-semibold text-[hsl(var(--primary))] hover:underline">
              Workload and performance →
            </Link>
          )}
        </CardHeader>
        <CardContent className={faculty.classes?.length ? 'p-0' : ''}>
          {!faculty.classes?.length ? (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">No classes are assigned yet.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <TableHead>Subject</TableHead>
                  <TableHead>Course</TableHead>
                  <TableHead>Semester · Section</TableHead>
                  <TableHead>Status</TableHead>
                </tr>
              </thead>
              <tbody>
                {faculty.classes.map((cls) => (
                  <tr key={cls.id}>
                    <TableCell>
                      {cls.subject.name} <span className="text-xs text-[hsl(var(--muted-foreground))]">{cls.subject.code}</span>
                    </TableCell>
                    <TableCell>{cls.section.semester.course.name}</TableCell>
                    <TableCell>
                      {cls.section.semester.name} · {cls.section.code}
                    </TableCell>
                    <TableCell className="capitalize">{cls.status.toLowerCase()}</TableCell>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={confirmingDeactivate}
        title="Deactivate this account?"
        description={`${faculty.firstName} ${faculty.lastName} will be signed out everywhere and won't be able to sign in until the account is activated again.`}
        onClose={() => setConfirmingDeactivate(false)}
      >
        {accountError && (
          <p role="alert" className="mb-3 text-sm text-[hsl(var(--destructive))]">
            {accountError}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirmingDeactivate(false)}>
            Cancel
          </Button>
          <Button variant="destructive" loading={accountBusy} onClick={() => void changeStatus('INACTIVE')}>
            Deactivate
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
