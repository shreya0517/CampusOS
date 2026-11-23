'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { ErrorState, Skeleton } from '@/components/feedback/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/form-field';
import { Dialog } from '@/components/ui/interactive';
import { AccountBadge } from '@/components/students/account-badge';
import { TemporaryPasswordNotice } from '@/components/accounts/temporary-password-notice';
import { StudentRecordSections } from '@/components/students/student-record-sections';
import { createStudentAccount, getStudent, getStudentRecord, resetStudentPassword, setStudentAccountStatus, updateEnrollment, updateStudent } from '@/lib/student-api';
import type { Student, StudentRecord } from '@/lib/student-api';

export default function StudentDetailsPage() {
  const params = useParams<{ id: string }>();
  const { primaryRole } = useAuth();
  const canEdit = primaryRole === 'Admin' || primaryRole === 'HOD';
  // Enrollment changes are Admin only; HODs can still correct a student's details.
  const canManageEnrollment = primaryRole === 'Admin';

  const isAdmin = primaryRole === 'Admin';
  const [student, setStudent] = useState<Student | null>(null);
  const [record, setRecord] = useState<StudentRecord | null>(null);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingAccount, setConfirmingAccount] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [issued, setIssued] = useState<{ email: string; password: string; title?: string } | null>(null);

  const load = async () => {
    try {
      setError(null);
      setStudent(await getStudent(params.id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Student could not be loaded.');
    }
    // Admin and HOD also get the full record: attendance, coursework, results and (Admin only) fees.
    if (canEdit) {
      getStudentRecord(params.id)
        .then((result) => {
          setRecord(result);
          setRecordError(null);
        })
        .catch((reason: unknown) => setRecordError(reason instanceof Error ? reason.message : 'The academic record could not be loaded.'));
    }
  };

  const changeAccountStatus = async (status: 'ACTIVE' | 'INACTIVE') => {
    setSaving(true);
    setAccountError(null);
    try {
      setStudent(await setStudentAccountStatus(params.id, status));
      setConfirmingAccount(false);
    } catch (reason) {
      setAccountError(reason instanceof Error ? reason.message : 'The account could not be updated.');
    } finally {
      setSaving(false);
    }
  };

  // For a student who forgot their password while the college has no email set up: a new temporary one, shown once.
  const resetPassword = async () => {
    setSaving(true);
    setAccountError(null);
    try {
      const result = await resetStudentPassword(params.id);
      setStudent(result);
      setIssued({ email: result.account?.email ?? '', password: result.temporaryPassword, title: 'Password reset' });
      setConfirmingReset(false);
    } catch (reason) {
      setAccountError(reason instanceof Error ? reason.message : 'The password could not be reset.');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    void load();
  }, [params.id, canEdit]);

  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!student) return <div className="grid gap-2"><Skeleton className="h-8 w-56" /><Skeleton className="h-48 w-full" /></div>;

  const enrollment = student.enrollments[0];

  return (
    <div className="grid gap-6">
      <div>
        <Link className="text-sm font-semibold text-[hsl(var(--primary))] underline" href="/dashboard/students">
          &larr; Students Directory
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">{student.firstName} {student.lastName}</h1>
              {student.account !== undefined && <AccountBadge account={student.account} />}
            </div>
            <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
              {student.studentCode}
              {enrollment ? ` · ${enrollment.section.semester.course.department.name} · ${enrollment.section.semester.course.name} · ${enrollment.section.semester.name} · Section ${enrollment.section.code}` : ''}
              {student.account ? ` · ${student.account.email}` : ''}
            </p>
          </div>
          {isAdmin && student.account && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => { setAccountError(null); setConfirmingReset(true); }}>
                Reset password
              </Button>
              <Button variant={student.account.status === 'ACTIVE' ? 'outline' : 'primary'} onClick={() => (student.account?.status === 'ACTIVE' ? setConfirmingAccount(true) : void changeAccountStatus('ACTIVE'))} loading={saving && !confirmingAccount && !confirmingReset}>
                {student.account.status === 'ACTIVE' ? 'Deactivate account' : 'Activate account'}
              </Button>
            </div>
          )}
        </div>
        {accountError && !confirmingAccount && !confirmingReset && (
          <p role="alert" className="mt-3 text-sm text-[hsl(var(--destructive))]">
            {accountError}
          </p>
        )}
        {issued && (
          <div className="mt-4">
            <TemporaryPasswordNotice email={issued.email} password={issued.password} who="the student" title={issued.title} />
          </div>
        )}
        {isAdmin && student.account === null && !issued && (
          <form
            className="mt-4 flex flex-wrap items-end gap-3 rounded-[var(--radius)] border bg-[hsl(var(--card))] p-4"
            onSubmit={async (event) => {
              event.preventDefault();
              const email = String(new FormData(event.currentTarget).get('email') ?? '').trim();
              setSaving(true);
              setAccountError(null);
              try {
                const result = await createStudentAccount(student.id, email);
                setStudent(result);
                setIssued({ email: result.account?.email ?? email, password: result.temporaryPassword });
              } catch (reason) {
                setAccountError(reason instanceof Error ? reason.message : 'The account could not be created.');
              } finally {
                setSaving(false);
              }
            }}
          >
            <div className="min-w-[16rem] flex-1">
              <Input label="This student has no sign-in account. College email" name="email" type="email" required autoComplete="off" />
            </div>
            <Button type="submit" loading={saving}>
              Create account
            </Button>
          </form>
        )}
      </div>

      <Dialog
        open={confirmingAccount}
        title="Deactivate this account?"
        description={`${student.firstName} ${student.lastName} will be signed out everywhere and won't be able to sign in until the account is activated again. Their records stay as they are.`}
        onClose={() => setConfirmingAccount(false)}
      >
        {accountError && (
          <p role="alert" className="mb-3 text-sm text-[hsl(var(--destructive))]">
            {accountError}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirmingAccount(false)}>
            Cancel
          </Button>
          <Button variant="destructive" loading={saving} onClick={() => void changeAccountStatus('INACTIVE')}>
            Deactivate
          </Button>
        </div>
      </Dialog>
      <Dialog
        open={confirmingReset}
        title="Reset this password?"
        description={`${student.firstName} ${student.lastName} gets a new temporary password and is signed out everywhere. You'll see it once, to hand over; they can then choose their own under Settings.`}
        onClose={() => setConfirmingReset(false)}
      >
        {accountError && (
          <p role="alert" className="mb-3 text-sm text-[hsl(var(--destructive))]">
            {accountError}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirmingReset(false)}>
            Cancel
          </Button>
          <Button loading={saving} onClick={() => void resetPassword()}>
            Reset password
          </Button>
        </div>
      </Dialog>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{canEdit ? 'Profile Editing' : 'Student Profile'}</CardTitle>
          </CardHeader>
          <CardContent>
            {canEdit ? (
              <form
                className="grid gap-4"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  setSaving(true);
                  try {
                    setStudent(
                      await updateStudent(student.id, {
                        firstName: String(data.get('firstName')),
                        lastName: String(data.get('lastName')),
                        dateOfBirth: String(data.get('dateOfBirth') || '') || undefined,
                      }),
                    );
                  } catch (reason) {
                    setError(reason instanceof Error ? reason.message : 'Profile could not be saved.');
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                <Input label="First name" name="firstName" defaultValue={student.firstName} required />
                <Input label="Last name" name="lastName" defaultValue={student.lastName} required />
                <Input label="Date of birth" name="dateOfBirth" type="date" defaultValue={student.dateOfBirth?.slice(0, 10) ?? ''} />
                <Button type="submit" loading={saving}>Save profile</Button>
              </form>
            ) : (
              <div className="grid gap-2.5 text-sm">
                <div><strong>Student Code:</strong> {student.studentCode}</div>
                <div><strong>First Name:</strong> {student.firstName}</div>
                <div><strong>Last Name:</strong> {student.lastName}</div>
                {student.dateOfBirth && <div><strong>Date of Birth:</strong> {student.dateOfBirth.slice(0, 10)}</div>}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Enrollment Information</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {enrollment ? (
              <>
                <p className="text-sm text-[hsl(var(--muted-foreground))]">
                  {enrollment.section.semester.course.name} · {enrollment.section.semester.name} · Section {enrollment.section.code}
                </p>
                {canManageEnrollment ? (
                  <Select
                    label="Enrollment status"
                    value={enrollment.status}
                    onChange={async (event) => {
                      setSaving(true);
                      try {
                        await updateEnrollment(student.id, {
                          sectionId: enrollment.section.id,
                          status: event.target.value as typeof enrollment.status,
                        });
                        await load();
                      } catch (reason) {
                        setError(reason instanceof Error ? reason.message : 'Enrollment could not be saved.');
                      } finally {
                        setSaving(false);
                      }
                    }}
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="WITHDRAWN">Withdrawn</option>
                  </Select>
                ) : (
                  <div className="text-sm">
                    <strong>Status:</strong>{' '}
                    <span className="inline-block rounded bg-[hsl(var(--muted))] px-2.5 py-0.5 text-xs font-semibold">
                      {enrollment.status}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-[hsl(var(--muted-foreground))]">No current enrollment is recorded.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {canEdit &&
        (recordError ? (
          <ErrorState message={recordError} onRetry={() => void load()} />
        ) : record ? (
          <StudentRecordSections record={record} />
        ) : (
          <Skeleton className="h-64 w-full" />
        ))}
    </div>
  );
}
