'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { TemporaryPasswordNotice } from '@/components/accounts/temporary-password-notice';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/form-field';
import { createFaculty, listDepartments } from '@/lib/faculty-api';
import type { Department, Faculty } from '@/lib/faculty-api';

export default function NewFacultyPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<(Faculty & { temporaryPassword?: string }) | null>(null);

  useEffect(() => {
    listDepartments(new URLSearchParams({ page: '1', pageSize: '100' }))
      .then((list) => setDepartments(list.items))
      .catch(() => undefined);
  }, []);

  if (created) {
    return (
      <div className="grid max-w-3xl gap-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Faculty member added</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            {created.firstName} {created.lastName} ({created.employeeCode}){created.department ? ` · ${created.department.name}` : ''}
          </p>
        </div>
        {created.temporaryPassword && created.account ? (
          <TemporaryPasswordNotice email={created.account.email} password={created.temporaryPassword} who="the faculty member" />
        ) : (
          <p className="text-sm text-[hsl(var(--muted-foreground))]">No sign-in account was created. You can add one later from their profile.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Link href={`/dashboard/faculty/${created.id}`}>
            <Button>Open profile</Button>
          </Link>
          <Button variant="outline" onClick={() => setCreated(null)}>
            Add another
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid max-w-3xl gap-6">
      <div>
        <Link className="text-sm font-semibold text-[hsl(var(--primary))] hover:underline" href="/dashboard/faculty">
          ← Faculty
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Add Faculty</h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">Creates the faculty record and, with an email, their sign-in account.</p>
      </div>

      <Card>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const text = (key: string): string => String(data.get(key) ?? '').trim();
            setSaving(true);
            setError(null);
            try {
              setCreated(
                await createFaculty({
                  employeeCode: text('employeeCode'),
                  firstName: text('firstName'),
                  lastName: text('lastName'),
                  departmentId: text('departmentId') || undefined,
                  designation: text('designation') || undefined,
                  email: text('email') || undefined,
                }),
              );
            } catch (reason) {
              setError(reason instanceof Error ? reason.message : 'The faculty member could not be added.');
            } finally {
              setSaving(false);
            }
          }}
        >
          <CardHeader>
            <CardTitle>Professional details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Input label="Employee ID" name="employeeCode" required placeholder="e.g. FAC-CSE-014" />
            <Input label="Designation" name="designation" placeholder="e.g. Assistant Professor" maxLength={80} />
            <Input label="First name" name="firstName" required minLength={2} />
            <Input label="Last name" name="lastName" required minLength={2} />
            <Select label="Department" name="departmentId" defaultValue="">
              <option value="">Not assigned yet</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </Select>
          </CardContent>
          <CardHeader className="border-t">
            <CardTitle>Sign-in account</CardTitle>
            <CardDescription>With an email, a faculty account is created and a temporary password is shown once on the next screen. Leave it empty to add the record only.</CardDescription>
          </CardHeader>
          <CardContent>
            <Input label="College email" name="email" type="email" placeholder="name@college.edu" autoComplete="off" />
          </CardContent>
          {error && (
            <p role="alert" className="mx-5 mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
              {error}
            </p>
          )}
          <CardFooter className="justify-end">
            <Link href="/dashboard/faculty">
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </Link>
            <Button type="submit" loading={saving}>
              Add faculty
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
