'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { TemporaryPasswordNotice } from '@/components/accounts/temporary-password-notice';
import { ErrorState, Skeleton } from '@/components/feedback/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/form-field';
import { createStudent, listSections } from '@/lib/student-api';
import type { SectionOption, Student } from '@/lib/student-api';

export default function NewStudentPage() {
  const router = useRouter();
  const [sections, setSections] = useState<SectionOption[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [departmentId, setDepartmentId] = useState('');
  const [courseId, setCourseId] = useState('');
  const [semesterId, setSemesterId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<(Student & { temporaryPassword?: string }) | null>(null);

  const load = () => {
    setLoadError(null);
    listSections()
      .then(setSections)
      .catch((reason: unknown) => setLoadError(reason instanceof Error ? reason.message : 'Sections could not be loaded.'));
  };
  useEffect(load, []);

  // Department → course → semester → section, each list narrowed by the choice above it.
  const unique = <T extends { id: string }>(items: T[]): T[] => [...new Map(items.map((item) => [item.id, item])).values()];
  const departments = useMemo(() => unique((sections ?? []).map((section) => section.semester.course.department)), [sections]);
  const courses = useMemo(
    () => unique((sections ?? []).filter((section) => section.semester.course.department.id === departmentId).map((section) => section.semester.course)),
    [sections, departmentId],
  );
  const semesters = useMemo(
    () => unique((sections ?? []).filter((section) => section.semester.course.id === courseId).map((section) => section.semester)).sort((a, b) => a.number - b.number),
    [sections, courseId],
  );
  const sectionChoices = useMemo(() => (sections ?? []).filter((section) => section.semester.id === semesterId), [sections, semesterId]);

  if (created) {
    return (
      <div className="grid max-w-3xl gap-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Student added</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            {created.firstName} {created.lastName} ({created.studentCode})
          </p>
        </div>
        {created.temporaryPassword && created.account && <TemporaryPasswordNotice email={created.account.email} password={created.temporaryPassword} who="the student" />}
        <div className="flex flex-wrap gap-2">
          <Link href={`/dashboard/students/${created.id}`}>
            <Button>Open record</Button>
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
        <Link className="text-sm font-semibold text-[hsl(var(--primary))] hover:underline" href="/dashboard/students">
          ← Students
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Add Student</h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">Creates the student record and enrolls them in a section.</p>
      </div>

      {loadError ? (
        <ErrorState message={loadError} onRetry={load} />
      ) : !sections ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <Card>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              setSaving(true);
              setError(null);
              try {
                const student = await createStudent({
                  studentCode: String(data.get('studentCode')).trim(),
                  firstName: String(data.get('firstName')).trim(),
                  lastName: String(data.get('lastName')).trim(),
                  dateOfBirth: String(data.get('dateOfBirth') || '') || undefined,
                  sectionId,
                  email: String(data.get('email') ?? '').trim() || undefined,
                });
                // A new account's temporary password is shown once, so stay here to show it; otherwise open the record.
                if (student.temporaryPassword) {
                  setCreated(student);
                  setSaving(false);
                } else {
                  router.push(`/dashboard/students/${student.id}`);
                }
              } catch (reason) {
                setError(reason instanceof Error ? reason.message : 'The student could not be added.');
                setSaving(false);
              }
            }}
          >
            <CardHeader>
              <CardTitle>Personal details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Input label="Student code" name="studentCode" required placeholder="e.g. CSE-2026-014" description="The enrollment number; unique in the college." />
              <Input label="Date of birth" name="dateOfBirth" type="date" />
              <Input label="First name" name="firstName" required minLength={2} />
              <Input label="Last name" name="lastName" required minLength={2} />
            </CardContent>
            <CardHeader className="border-t">
              <CardTitle>Enrollment</CardTitle>
              <CardDescription>Choose where the student studies this term.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Select
                label="Department"
                required
                value={departmentId}
                onChange={(event) => {
                  setDepartmentId(event.target.value);
                  setCourseId('');
                  setSemesterId('');
                  setSectionId('');
                }}
              >
                <option value="">Select a department</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </Select>
              <Select
                label="Course"
                required
                disabled={!departmentId}
                value={courseId}
                onChange={(event) => {
                  setCourseId(event.target.value);
                  setSemesterId('');
                  setSectionId('');
                }}
              >
                <option value="">Select a course</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name} ({course.code})
                  </option>
                ))}
              </Select>
              <Select
                label="Semester"
                required
                disabled={!courseId}
                value={semesterId}
                onChange={(event) => {
                  setSemesterId(event.target.value);
                  setSectionId('');
                }}
              >
                <option value="">Select a semester</option>
                {semesters.map((semester) => (
                  <option key={semester.id} value={semester.id}>
                    {semester.name}
                  </option>
                ))}
              </Select>
              <Select label="Section" required disabled={!semesterId} value={sectionId} onChange={(event) => setSectionId(event.target.value)}>
                <option value="">Select a section</option>
                {sectionChoices.map((section) => (
                  <option key={section.id} value={section.id}>
                    Section {section.code}
                  </option>
                ))}
              </Select>
            </CardContent>
            <CardHeader className="border-t">
              <CardTitle>Sign-in account</CardTitle>
              <CardDescription>With an email, a student account is created and a temporary password is shown once on the next screen. Leave it empty to add the record only.</CardDescription>
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
              <Link href="/dashboard/students">
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
              <Button type="submit" loading={saving} disabled={!sectionId}>
                Add student
              </Button>
            </CardFooter>
          </form>
        </Card>
      )}
    </div>
  );
}
