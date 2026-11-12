'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { ErrorState, Skeleton } from '@/components/feedback/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/form-field';
import { getStudent, updateEnrollment, updateStudent } from '@/lib/student-api';
import type { Student } from '@/lib/student-api';

export default function StudentDetailsPage() {
  const params = useParams<{ id: string }>();
  const { primaryRole } = useAuth();
  const canEdit = primaryRole === 'Admin' || primaryRole === 'HOD';

  const [student, setStudent] = useState<Student | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      setError(null);
      setStudent(await getStudent(params.id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Student could not be loaded.');
    }
  };

  useEffect(() => {
    void load();
  }, [params.id]);

  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!student) return <div className="grid gap-2"><Skeleton className="h-8 w-56" /><Skeleton className="h-48 w-full" /></div>;

  const enrollment = student.enrollments[0];

  return (
    <div className="grid gap-6">
      <div>
        <Link className="text-sm font-semibold text-[hsl(var(--primary))] underline" href="/dashboard/students">
          &larr; Students Directory
        </Link>
        <h1 className="mt-3 text-3xl font-semibold">{student.firstName} {student.lastName}</h1>
      </div>
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
                {canEdit ? (
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
    </div>
  );
}