'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { listStudents } from '@/lib/student-api';
import { listFaculty, listDepartments, type Department, type Faculty } from '@/lib/faculty-api';

type OverviewStats = {
  students: number;
  faculty: number;
  departments: number;
};

function StatCard({ label, value, href }: { label: string; value: string | number; href?: string }) {
  const inner = (
    <Card className={href ? 'transition-shadow hover:shadow-md cursor-pointer' : ''}>
      <CardContent className="pt-5">
        <p className="text-3xl font-bold">{value}</p>
        <p className="mt-1 text-sm font-semibold">{label}</p>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export default function InstitutionalOverviewPage() {
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [recentFaculty, setRecentFaculty] = useState<Faculty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const mini = new URLSearchParams({ page: '1', pageSize: '1' });
    const deptParams = new URLSearchParams({ page: '1', pageSize: '50' });
    const facultyParams = new URLSearchParams({ page: '1', pageSize: '8' });

    Promise.all([
      listStudents(mini),
      listFaculty(mini),
      listDepartments(mini),
      listDepartments(deptParams),
      listFaculty(facultyParams),
    ])
      .then(([s, f, d, deptFull, facultyFull]) => {
        setStats({ students: s.total, faculty: f.total, departments: d.total });
        setDepartments(deptFull.items);
        setRecentFaculty(facultyFull.items);
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to load institutional data.');
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="grid gap-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[.16em] text-[hsl(var(--primary))]">Admin</p>
          <h1 className="mt-2 text-3xl font-semibold">Institutional Overview</h1>
        </div>
        <p className="text-[hsl(var(--muted-foreground))]">Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="grid gap-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[.16em] text-[hsl(var(--primary))]">Admin</p>
          <h1 className="mt-2 text-3xl font-semibold">Institutional Overview</h1>
        </div>
        <Card className="border-destructive">
          <CardContent className="pt-5">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid gap-8">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[.16em] text-[hsl(var(--primary))]">Admin</p>
        <h1 className="mt-2 text-3xl font-semibold">Institutional Overview</h1>
        <p className="mt-2 max-w-2xl text-[hsl(var(--muted-foreground))]">
          A snapshot of students, faculty, and departments across the college.
        </p>
      </div>

      {/* Key metrics */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total Students" value={stats?.students ?? '…'} href="/dashboard/students" />
        <StatCard label="Total Faculty" value={stats?.faculty ?? '…'} href="/dashboard/faculty" />
        <StatCard label="Departments" value={stats?.departments ?? '…'} href="/dashboard/departments" />
      </div>

      {/* Departments list */}
      {departments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Departments</CardTitle>
            <CardDescription>All active departments in this college.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {departments.map((dept) => (
                <div key={dept.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium">{dept.name}</p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">{dept.code}</p>
                  </div>
                  <Link
                    href={`/dashboard/departments`}
                    className="text-xs font-semibold text-[hsl(var(--primary))] underline underline-offset-4"
                  >
                    View →
                  </Link>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent faculty */}
      {recentFaculty.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Faculty Directory</CardTitle>
            <CardDescription>Showing up to 8 faculty members.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {recentFaculty.map((f) => (
                <div key={f.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium">
                      {f.firstName} {f.lastName}
                    </p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      {f.department?.name ?? 'No department'} · {f.employeeCode}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            {(stats?.faculty ?? 0) > 8 && (
              <div className="mt-4">
                <Link
                  href="/dashboard/faculty"
                  className="text-sm font-semibold text-[hsl(var(--primary))] underline underline-offset-4"
                >
                  View all {stats?.faculty} faculty →
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Quick navigation */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Student Management</CardTitle>
            <CardDescription>Browse and manage student enrollments.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/dashboard/students"
              className="text-sm font-semibold text-[hsl(var(--primary))] underline underline-offset-4"
            >
              Open Students →
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Attendance</CardTitle>
            <CardDescription>Mark and review class attendance sessions.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/dashboard/attendance"
              className="text-sm font-semibold text-[hsl(var(--primary))] underline underline-offset-4"
            >
              Open Attendance →
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Exams &amp; Results</CardTitle>
            <CardDescription>Schedule examinations and publish report cards.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/dashboard/exams"
              className="text-sm font-semibold text-[hsl(var(--primary))] underline underline-offset-4"
            >
              Open Exams →
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
