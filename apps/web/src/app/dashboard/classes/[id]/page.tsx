'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { EmptyState, ErrorState, Skeleton } from '@/components/feedback/states';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableCell, TableHead } from '@/components/ui/table';
import { getClassOverview } from '@/lib/attendance-api';
import type { AttendanceSummary, ClassOverview } from '@/lib/attendance-api';

const formatPercentage = (summary: AttendanceSummary): string =>
  summary.percentage === null ? '—' : `${summary.percentage.toFixed(1)}%`;

const percentageTone = (summary: AttendanceSummary): string =>
  summary.percentage === null ? '' : summary.belowThreshold ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400';

const formatDue = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'No deadline';

export default function ClassDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [overview, setOverview] = useState<ClassOverview | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = async (): Promise<void> => {
    setError(null);
    try {
      setOverview(await getClassOverview(id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'This class could not be loaded.');
    }
  };

  useEffect(() => {
    void load();
  }, [id]);

  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!overview) return <Skeleton className="h-96 w-full" />;

  const { class: cls, students, assignments, threshold } = overview;
  const term = search.trim().toLowerCase();
  const visible = term
    ? students.filter(({ student }) => `${student.firstName} ${student.lastName} ${student.studentCode}`.toLowerCase().includes(term))
    : students;
  const shortCount = students.filter((row) => row.attendance.belowThreshold).length;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link className="text-sm font-semibold text-[hsl(var(--primary))] underline underline-offset-4" href="/dashboard/classes">
            ← My Classes
          </Link>
          <h1 className="mt-3 text-3xl font-semibold">{cls.subject.name}</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            {cls.subject.code} · {cls.section.semester.course.name} · {cls.section.semester.name} · Section {cls.section.code}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/dashboard/attendance/new?classId=${cls.id}`}
            className="inline-flex min-h-10 items-center rounded-[var(--radius)] bg-[hsl(var(--primary))] px-4 text-sm font-semibold text-[hsl(var(--primary-foreground))]"
          >
            Mark attendance
          </Link>
          <Link href="/dashboard/assignments/new" className="inline-flex min-h-10 items-center rounded-[var(--radius)] border px-4 text-sm font-semibold">
            New assignment
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Students', value: String(students.length) },
          { label: 'Sessions held', value: String(overview.sessionsHeld) },
          { label: 'Class attendance', value: formatPercentage(overview.attendance), tone: percentageTone(overview.attendance) },
          { label: `Below ${threshold}%`, value: String(shortCount), tone: shortCount > 0 ? 'text-rose-600 dark:text-rose-400' : '' },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="pt-5">
              <p className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">{stat.label}</p>
              <p className={`mt-1 text-2xl font-bold tabular-nums ${stat.tone ?? ''}`}>{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <CardTitle>Students</CardTitle>
              <CardDescription>Attendance in this class and submitted assignments out of {assignments.length}.</CardDescription>
            </div>
            <input
              aria-label="Search students"
              placeholder="Search by name or code..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-60 min-h-10 rounded-[var(--radius)] border bg-[hsl(var(--background))] px-3 text-sm"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {students.length === 0 ? (
            <div className="p-5">
              <EmptyState title="No students enrolled" description="Students enrolled in this section will appear here." />
            </div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <TableHead>Student</TableHead>
                  <TableHead>Present</TableHead>
                  <TableHead>Absent</TableHead>
                  <TableHead>Late</TableHead>
                  <TableHead>Attendance</TableHead>
                  <TableHead>Submitted</TableHead>
                </tr>
              </thead>
              <tbody>
                {visible.map(({ student, attendance, submittedAssignments }) => (
                  <tr key={student.id}>
                    <TableCell>
                      <p className="font-semibold">
                        {student.firstName} {student.lastName}
                      </p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">{student.studentCode}</p>
                    </TableCell>
                    <TableCell>{attendance.present}</TableCell>
                    <TableCell>{attendance.absent}</TableCell>
                    <TableCell>{attendance.late}</TableCell>
                    <TableCell>
                      <span className={`font-semibold ${percentageTone(attendance)}`}>{formatPercentage(attendance)}</span>
                      {attendance.belowThreshold && (
                        <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800 dark:bg-rose-950 dark:text-rose-200">Short</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {submittedAssignments}/{assignments.length}
                    </TableCell>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Assignments</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {assignments.length === 0 ? (
            <div className="p-5">
              <EmptyState title="No assignments yet" description="Assignments you create for this class will appear here." />
            </div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <TableHead>Assignment</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Max marks</TableHead>
                  <TableHead>Submissions</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </tr>
              </thead>
              <tbody>
                {assignments.map((assignment) => (
                  <tr key={assignment.id}>
                    <TableCell className="font-semibold">{assignment.title}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDue(assignment.dueAt)}</TableCell>
                    <TableCell>{assignment.maxMarks}</TableCell>
                    <TableCell>
                      {assignment.submissions}/{students.length}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link className="font-semibold text-[hsl(var(--primary))] underline underline-offset-4" href={`/dashboard/assignments/${assignment.id}`}>
                        Review
                      </Link>
                    </TableCell>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
