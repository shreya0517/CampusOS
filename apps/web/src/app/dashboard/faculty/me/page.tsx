'use client';

import { useEffect, useState } from 'react';
import { EmptyState, ErrorState, Skeleton } from '@/components/feedback/states';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getMyFaculty } from '@/lib/faculty-api';
import type { Faculty } from '@/lib/faculty-api';

export default function FacultyDashboardPage() {
  const [faculty, setFaculty] = useState<Faculty | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async (): Promise<void> => {
    try {
      setFaculty(await getMyFaculty());
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Your faculty dashboard could not be loaded.');
    }
  };

  useEffect(() => { void load(); }, []);

  if (error) return <ErrorState message={error} onRetry={() => void load()} />;

  if (!faculty) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-20 w-full" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
        <Skeleton className="h-36 w-full" />
      </div>
    );
  }

  const hasDepartment = Boolean(faculty.department);

  if (!hasDepartment && !faculty.employeeCode) {
    return (
      <EmptyState
        title="Faculty profile incomplete"
        description="Your faculty profile is active but does not have a department or employee code assigned yet. Contact your administrator."
      />
    );
  }

  return (
    <div className="grid gap-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[.16em] text-[hsl(var(--primary))]">Faculty dashboard</p>
        <h1 className="mt-2 text-3xl font-semibold">Welcome, {faculty.firstName}</h1>
        <p className="mt-2 text-[hsl(var(--muted-foreground))]">Your faculty profile and department details.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Employee code</CardDescription>
            <CardTitle>{faculty.employeeCode}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Department</CardDescription>
            <CardTitle>{faculty.department?.name ?? 'Unassigned'}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Department code</CardDescription>
            <CardTitle>{faculty.department?.code ?? '—'}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Profile summary</CardTitle>
            <CardDescription>Information from your faculty record.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <p><strong>Full name:</strong> {faculty.firstName} {faculty.lastName}</p>
            <p><strong>Employee code:</strong> {faculty.employeeCode}</p>
            <p><strong>Department:</strong> {faculty.department?.name ?? 'Not assigned'}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Department</CardTitle>
            <CardDescription>Your current department placement.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {faculty.department ? (
              <>
                <p><strong>Name:</strong> {faculty.department.name}</p>
                <p><strong>Code:</strong> {faculty.department.code}</p>
              </>
            ) : (
              <p className="text-[hsl(var(--muted-foreground))]">No department has been assigned to your profile.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
