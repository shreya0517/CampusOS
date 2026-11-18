'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { ErrorState, Skeleton } from '@/components/feedback/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/form-field';
import { Table, TableCell, TableHead } from '@/components/ui/table';
import { getDepartment, listFaculty, setDepartmentHod } from '@/lib/faculty-api';
import type { DepartmentDetail, Faculty } from '@/lib/faculty-api';

function Figure({ label, value, href }: { label: string; value: number; href?: string }) {
  const body = (
    <Card className={`h-full ${href ? 'transition hover:border-[hsl(var(--primary))]/40 hover:shadow-md' : ''}`}>
      <CardContent>
        <p className="text-sm font-medium text-[hsl(var(--muted-foreground))]">{label}</p>
        <p className="mt-2 text-[1.75rem] font-bold leading-none tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
  return href ? (
    <Link href={href} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  );
}

export default function DepartmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { primaryRole } = useAuth();
  const isAdmin = primaryRole === 'Admin';

  const [department, setDepartment] = useState<DepartmentDetail | null>(null);
  const [faculty, setFaculty] = useState<Faculty[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hodChoice, setHodChoice] = useState('');
  const [hodError, setHodError] = useState<string | null>(null);
  const [hodSaving, setHodSaving] = useState(false);
  const [hodSaved, setHodSaved] = useState(false);

  const load = async () => {
    try {
      const [detail, members] = await Promise.all([getDepartment(id), listFaculty(new URLSearchParams({ departmentId: id, page: '1', pageSize: '100' }))]);
      setDepartment(detail);
      setFaculty(members.items);
      setHodChoice(detail.hod?.facultyId ?? '');
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The department could not be loaded.');
    }
  };

  useEffect(() => {
    void load();
  }, [id]);

  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!department) return <Skeleton className="h-64 w-full" />;

  // Only someone in this department with an active sign-in account can head it.
  const eligible = faculty.filter((member) => member.account?.status === 'ACTIVE');

  const saveHod = async (facultyId: string | null) => {
    setHodSaving(true);
    setHodError(null);
    setHodSaved(false);
    try {
      const updated = await setDepartmentHod(department.id, facultyId);
      setDepartment(updated);
      setHodChoice(updated.hod?.facultyId ?? '');
      setFaculty((await listFaculty(new URLSearchParams({ departmentId: id, page: '1', pageSize: '100' }))).items);
      setHodSaved(true);
    } catch (reason) {
      setHodError(reason instanceof Error ? reason.message : 'The HOD could not be changed.');
    } finally {
      setHodSaving(false);
    }
  };

  return (
    <div className="grid gap-6">
      <div>
        <Link className="text-sm font-semibold text-[hsl(var(--primary))] hover:underline" href="/dashboard/departments">
          ← Departments
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">{department.name}</h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          {department.code} · Head of Department: {department.hod ? `${department.hod.name}${department.hod.designation ? `, ${department.hod.designation}` : ''}` : 'not assigned'}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Figure label="Faculty" value={department.counts.faculty} />
        <Figure label="Students" value={department.counts.students} href={isAdmin ? undefined : '/dashboard/students'} />
        <Figure label="Courses" value={department.counts.courses} />
        <Figure label="Subjects" value={department.counts.subjects} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        {isAdmin && (
          <Card className="self-start">
            <CardHeader>
              <CardTitle>Head of Department</CardTitle>
              <CardDescription>Choose a faculty member of this department with an active sign-in account. The previous HOD, if any, returns to a regular faculty role.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <Select label="HOD" value={hodChoice} onChange={(event) => setHodChoice(event.target.value)}>
                <option value="">{eligible.length ? 'Select a faculty member' : 'No eligible faculty yet'}</option>
                {eligible.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.firstName} {member.lastName} ({member.employeeCode}){member.designation ? ` · ${member.designation}` : ''}
                  </option>
                ))}
              </Select>
              {faculty.length > eligible.length && (
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  {faculty.length - eligible.length} faculty member{faculty.length - eligible.length === 1 ? '' : 's'} without an active account can&apos;t be chosen.
                </p>
              )}
              {hodError && (
                <p role="alert" className="text-sm text-[hsl(var(--destructive))]">
                  {hodError}
                </p>
              )}
              {hodSaved && <p className="text-sm text-emerald-700 dark:text-emerald-400">Saved. The new HOD gets the HOD portal the next time they sign in.</p>}
              <div className="flex flex-wrap gap-2">
                <Button loading={hodSaving} disabled={!hodChoice || hodChoice === department.hod?.facultyId} onClick={() => void saveHod(hodChoice)}>
                  {department.hod ? 'Change HOD' : 'Assign HOD'}
                </Button>
                {department.hod && (
                  <Button variant="outline" disabled={hodSaving} onClick={() => void saveHod(null)}>
                    Remove HOD
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <Card className={isAdmin ? 'xl:col-span-2' : 'xl:col-span-3'}>
          <CardHeader>
            <CardTitle>Faculty</CardTitle>
            <CardDescription>Everyone whose profile is in this department.</CardDescription>
          </CardHeader>
          <CardContent className={faculty.length ? 'p-0' : ''}>
            {faculty.length === 0 ? (
              <p className="text-sm text-[hsl(var(--muted-foreground))]">No faculty are assigned to this department yet.</p>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <TableHead>Name</TableHead>
                    <TableHead>Designation</TableHead>
                    <TableHead className="text-right">Classes</TableHead>
                    <TableHead>Account</TableHead>
                  </tr>
                </thead>
                <tbody>
                  {faculty.map((member) => (
                    <tr key={member.id}>
                      <TableCell>
                        <Link href={`/dashboard/faculty/${member.id}`} className="font-semibold hover:underline">
                          {member.firstName} {member.lastName}
                        </Link>
                        {member.isHod && (
                          <span className="ml-2 rounded-full bg-[hsl(var(--sidebar-active))] px-2 py-0.5 text-[11px] font-semibold text-[hsl(var(--sidebar-active-foreground))]">HOD</span>
                        )}
                        <span className="block text-xs text-[hsl(var(--muted-foreground))]">{member.employeeCode}</span>
                      </TableCell>
                      <TableCell>{member.designation ?? '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">{member.classCount ?? 0}</TableCell>
                      <TableCell className="text-sm">{member.account ? (member.account.status === 'ACTIVE' ? 'Active' : 'Inactive') : 'No account'}</TableCell>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Courses</CardTitle>
          </CardHeader>
          <CardContent className={department.courses.length ? 'p-0' : ''}>
            {department.courses.length === 0 ? (
              <p className="text-sm text-[hsl(var(--muted-foreground))]">No courses are offered by this department yet.</p>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <TableHead>Course</TableHead>
                    <TableHead className="text-right">Duration</TableHead>
                    <TableHead className="text-right">Semesters</TableHead>
                  </tr>
                </thead>
                <tbody>
                  {department.courses.map((course) => (
                    <tr key={course.id}>
                      <TableCell>
                        {course.name} <span className="text-xs text-[hsl(var(--muted-foreground))]">{course.code}</span>
                      </TableCell>
                      <TableCell className="text-right">{course.durationYears} years</TableCell>
                      <TableCell className="text-right tabular-nums">{course.semesters}</TableCell>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Subjects</CardTitle>
          </CardHeader>
          <CardContent className={department.subjects.length ? 'p-0' : ''}>
            {department.subjects.length === 0 ? (
              <p className="text-sm text-[hsl(var(--muted-foreground))]">No subjects are defined yet.</p>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <TableHead>Subject</TableHead>
                    <TableHead>Course · Semester</TableHead>
                    <TableHead className="text-right">Credits</TableHead>
                  </tr>
                </thead>
                <tbody>
                  {department.subjects.map((subject) => (
                    <tr key={subject.id}>
                      <TableCell>
                        {subject.name} <span className="text-xs text-[hsl(var(--muted-foreground))]">{subject.code}</span>
                      </TableCell>
                      <TableCell>
                        {subject.course.code} · {subject.semester.name}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{subject.credits}</TableCell>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
