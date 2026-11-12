'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { listFaculty, listDepartments, type Department, type Faculty } from '@/lib/faculty-api';

type DeptGroup = {
  department: Department;
  faculty: Faculty[];
};

export default function FacultyPerformancePage() {
  const [groups, setGroups] = useState<DeptGroup[]>([]);
  const [unassigned, setUnassigned] = useState<Faculty[]>([]);
  const [totalFaculty, setTotalFaculty] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const deptParams = new URLSearchParams({ page: '1', pageSize: '50' });
    const facultyParams = new URLSearchParams({ page: '1', pageSize: '200' });

    Promise.all([listDepartments(deptParams), listFaculty(facultyParams)])
      .then(([deptList, facultyList]) => {
        setTotalFaculty(facultyList.total);

        // Group faculty by department
        const byDept = new Map<string, Faculty[]>();
        const noAssignment: Faculty[] = [];

        for (const f of facultyList.items) {
          if (f.departmentId) {
            if (!byDept.has(f.departmentId)) byDept.set(f.departmentId, []);
            byDept.get(f.departmentId)!.push(f);
          } else {
            noAssignment.push(f);
          }
        }

        const grouped: DeptGroup[] = deptList.items
          .filter((d) => byDept.has(d.id))
          .map((d) => ({ department: d, faculty: byDept.get(d.id)! }));

        setGroups(grouped);
        setUnassigned(noAssignment);
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to load faculty data.');
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="grid gap-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[.16em] text-[hsl(var(--primary))]">Admin</p>
          <h1 className="mt-2 text-3xl font-semibold">Faculty Performance</h1>
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
          <h1 className="mt-2 text-3xl font-semibold">Faculty Performance</h1>
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
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[.16em] text-[hsl(var(--primary))]">Admin</p>
          <h1 className="mt-2 text-3xl font-semibold">Faculty Performance</h1>
          <p className="mt-2 max-w-2xl text-[hsl(var(--muted-foreground))]">
            {totalFaculty} faculty member{totalFaculty !== 1 ? 's' : ''} across {groups.length} department
            {groups.length !== 1 ? 's' : ''}.
          </p>
        </div>
        <Link
          href="/dashboard/faculty"
          className="text-sm font-semibold text-[hsl(var(--primary))] underline underline-offset-4"
        >
          Full Faculty Directory →
        </Link>
      </div>

      {/* Dept groups */}
      {groups.length === 0 && unassigned.length === 0 && (
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-[hsl(var(--muted-foreground))]">No faculty members found.</p>
          </CardContent>
        </Card>
      )}

      {groups.map(({ department, faculty }) => (
        <Card key={department.id}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{department.name}</CardTitle>
                <CardDescription>
                  {department.code} · {faculty.length} faculty member{faculty.length !== 1 ? 's' : ''}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {faculty.map((f) => (
                <div key={f.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium">
                      {f.firstName} {f.lastName}
                    </p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">{f.employeeCode}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      {unassigned.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Unassigned Faculty</CardTitle>
            <CardDescription>Faculty members without a department assignment.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {unassigned.map((f) => (
                <div key={f.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium">
                      {f.firstName} {f.lastName}
                    </p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">{f.employeeCode}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
