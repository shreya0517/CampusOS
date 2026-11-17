'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { ErrorState, Skeleton } from '@/components/feedback/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/form-field';
import { getMyStudent, updateMyContact } from '@/lib/student-api';
import type { MyStudent } from '@/lib/student-api';

const formatDate = (value: string | null): string =>
  value ? new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '—';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{label}</dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  );
}

export default function MyProfilePage() {
  const [student, setStudent] = useState<MyStudent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = async (): Promise<void> => {
    setError(null);
    try {
      setStudent(await getMyStudent());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Your profile could not be loaded.');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const startEditing = (): void => {
    setPhone(student?.phone ?? '');
    setAddress(student?.address ?? '');
    setFormError(null);
    setSaved(false);
    setEditing(true);
  };

  const save = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const trimmedPhone = phone.trim();
    const digitCount = trimmedPhone.replace(/\D/g, '').length;
    if (trimmedPhone && (!/^\+?[0-9][0-9 -]*[0-9]$/.test(trimmedPhone) || digitCount < 8 || digitCount > 20)) {
      setFormError('Enter a phone number with 8 to 20 digits. Spaces, dashes and a leading + are fine.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      setStudent(await updateMyContact({ phone: trimmedPhone || null, address: address.trim() || null }));
      setEditing(false);
      setSaved(true);
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : 'Your contact details could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!student) return <Skeleton className="h-96 w-full" />;

  const enrollment = student.enrollments.find((item) => item.status === 'ACTIVE') ?? student.enrollments[0];
  const fullName = `${student.firstName} ${student.lastName}`;
  const initials = `${student.firstName[0] ?? ''}${student.lastName[0] ?? ''}`.toUpperCase();

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-3xl font-semibold">My Profile</h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">Your personal and academic details as recorded by the college.</p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-5 pt-5">
          <div
            aria-hidden="true"
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--primary))] text-xl font-bold text-[hsl(var(--primary-foreground))]"
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xl font-semibold">{fullName}</p>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              {student.studentCode}
              {enrollment ? ` · ${enrollment.section.semester.course.name} · ${enrollment.section.semester.name} · Section ${enrollment.section.code}` : ''}
            </p>
          </div>
          {enrollment && (
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                enrollment.status === 'ACTIVE'
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                  : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
              }`}
            >
              {enrollment.status}
            </span>
          )}
        </CardContent>
      </Card>

      {saved && (
        <p role="status" className="rounded-[var(--radius)] border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
          Your contact details were saved.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>Personal information</CardTitle>
                <CardDescription>You can update your phone number and address.</CardDescription>
              </div>
              {!editing && (
                <Button variant="outline" onClick={startEditing}>
                  Edit contact details
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {editing ? (
              <form className="grid gap-4" onSubmit={(event) => void save(event)} noValidate>
                <Input
                  label="Phone number"
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="+91 98765 43210"
                  description="Leave empty to remove it."
                />
                <label className="grid gap-1.5 text-sm font-semibold" htmlFor="profile-address">
                  Address
                  <textarea
                    id="profile-address"
                    autoComplete="street-address"
                    rows={3}
                    maxLength={300}
                    value={address}
                    onChange={(event) => setAddress(event.target.value)}
                    className="rounded-[var(--radius)] border bg-[hsl(var(--background))] px-3 py-2 font-normal"
                  />
                  <span className="font-normal text-[hsl(var(--muted-foreground))]">{address.length}/300</span>
                </label>
                {formError && (
                  <p role="alert" className="text-sm text-[hsl(var(--destructive))]">
                    {formError}
                  </p>
                )}
                <div className="flex gap-3">
                  <Button type="submit" loading={saving}>
                    Save
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <dl className="grid gap-4 sm:grid-cols-2">
                <Field label="Full name">{fullName}</Field>
                <Field label="Date of birth">{formatDate(student.dateOfBirth)}</Field>
                <Field label="Email">{student.user?.email ?? '—'}</Field>
                <Field label="Phone">{student.phone ?? 'Not added'}</Field>
                <div className="sm:col-span-2">
                  <Field label="Address">
                    <span className="whitespace-pre-line">{student.address ?? 'Not added'}</span>
                  </Field>
                </div>
              </dl>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Academic information</CardTitle>
            <CardDescription>Managed by the college office.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field label="Enrollment number">{student.studentCode}</Field>
              <Field label="College">{student.college.name}</Field>
              <Field label="Department">{enrollment?.section.semester.course.department.name ?? '—'}</Field>
              <Field label="Course">{enrollment ? `${enrollment.section.semester.course.name} (${enrollment.section.semester.course.code})` : '—'}</Field>
              <Field label="Semester">{enrollment?.section.semester.name ?? '—'}</Field>
              <Field label="Section">{enrollment?.section.code ?? '—'}</Field>
            </dl>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end justify-between gap-4">
            <dl className="grid flex-1 gap-4 sm:grid-cols-3">
              <Field label="Sign-in email">{student.user?.email ?? '—'}</Field>
              <Field label="Account status">{student.user?.status ?? '—'}</Field>
              <Field label="Email verified">{student.user?.emailVerifiedAt ? 'Yes' : 'No'}</Field>
            </dl>
            <Link href="/dashboard/settings">
              <Button variant="outline">Change password</Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-[hsl(var(--muted-foreground))]">
        Spotted a mistake in your name, date of birth or academic details? Contact the college office; these can&apos;t be changed here.
      </p>
    </div>
  );
}
