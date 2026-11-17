'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ErrorState, Skeleton } from '@/components/feedback/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/form-field';
import { Table, TableCell, TableHead } from '@/components/ui/table';
import { createAttendance, listClasses } from '@/lib/attendance-api';
import type { AttendanceStatus, ClassRecord } from '@/lib/attendance-api';
import { listStudents } from '@/lib/student-api';
import type { Student } from '@/lib/student-api';

const STATUS_OPTIONS: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'];

export default function NewAttendancePage() {
  const router = useRouter();

  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [classesError, setClassesError] = useState<string | null>(null);
  const [classesLoading, setClassesLoading] = useState(true);

  const [selectedClassId, setSelectedClassId] = useState('');
  const [heldOn, setHeldOn] = useState(new Date().toISOString().slice(0, 10));

  const [students, setStudents] = useState<Student[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentsError, setStudentsError] = useState<string | null>(null);

  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Load classes on mount
  useEffect(() => {
    void (async () => {
      setClassesLoading(true);
      try {
        const result = await listClasses(new URLSearchParams({ page: '1', pageSize: '100' }));
        setClasses(result.items);
        setClassesError(null);
      } catch (reason) {
        setClassesError(reason instanceof Error ? reason.message : 'Classes could not be loaded.');
      } finally {
        setClassesLoading(false);
      }
    })();
  }, []);

  // Load students when class is selected
  useEffect(() => {
    if (!selectedClassId) { setStudents([]); return; }
    const cls = classes.find((c) => c.id === selectedClassId);
    if (!cls) return;
    void (async () => {
      setStudentsLoading(true);
      setStudentsError(null);
      try {
        const result = await listStudents(new URLSearchParams({ sectionId: cls.sectionId, page: '1', pageSize: '100' }));
        setStudents(result.items);
        // Default all to PRESENT
        setStatuses(Object.fromEntries(result.items.map((s) => [s.id, 'PRESENT' as AttendanceStatus])));
        setNotes({});
      } catch (reason) {
        setStudentsError(reason instanceof Error ? reason.message : 'Students could not be loaded.');
      } finally {
        setStudentsLoading(false);
      }
    })();
  }, [selectedClassId]);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!selectedClassId || !heldOn || students.length === 0) return;
    setSaving(true);
    setSaveError(null);
    try {
      const records = students.map((s) => ({ studentId: s.id, status: statuses[s.id] ?? 'PRESENT', note: notes[s.id] || undefined }));
      const session = await createAttendance({ classId: selectedClassId, heldOn, records });
      router.push(`/dashboard/attendance/${session.id}`);
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : 'Attendance could not be saved.');
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[.16em] text-[hsl(var(--primary))]">Attendance</p>
        <h1 className="mt-2 text-3xl font-semibold">Mark attendance</h1>
        <p className="mt-2 text-[hsl(var(--muted-foreground))]">Select a class and date, then set each student's status.</p>
      </div>

      {classesLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : classesError ? (
        <ErrorState message={classesError} />
      ) : (
        <form onSubmit={(e) => void handleSubmit(e)} className="grid gap-6">
          <Card>
            <CardHeader><CardTitle>Session details</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <Select
                label="Class"
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                required
              >
                <option value="">Select a class…</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.subject.name} — {c.section.semester.course.name} · {c.section.code}
                  </option>
                ))}
              </Select>
              <Input
                label="Date"
                type="date"
                value={heldOn}
                onChange={(e) => setHeldOn(e.target.value)}
                required
              />
            </CardContent>
          </Card>

          {selectedClassId && (
            <Card>
              <CardHeader><CardTitle>Student roster</CardTitle></CardHeader>
              <CardContent>
                {studentsLoading ? (
                  <Skeleton className="h-24 w-full" />
                ) : studentsError ? (
                  <ErrorState message={studentsError} />
                ) : students.length === 0 ? (
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">No students enrolled in this section.</p>
                ) : (
                  <Table>
                    <thead>
                      <tr>
                        <TableHead>Student</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Note (optional)</TableHead>
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((s) => (
                        <tr key={s.id}>
                          <TableCell>
                            <strong>{s.firstName} {s.lastName}</strong>
                            <span className="block text-xs text-[hsl(var(--muted-foreground))]">{s.studentCode}</span>
                          </TableCell>
                          <TableCell>
                            <select
                              aria-label={`Status for ${s.firstName} ${s.lastName}`}
                              className="min-h-10 rounded-[var(--radius)] border bg-[hsl(var(--background))] px-3 text-sm"
                              value={statuses[s.id] ?? 'PRESENT'}
                              onChange={(e) => setStatuses((prev) => ({ ...prev, [s.id]: e.target.value as AttendanceStatus }))}
                            >
                              {STATUS_OPTIONS.map((st) => <option key={st} value={st}>{st}</option>)}
                            </select>
                          </TableCell>
                          <TableCell>
                            <input
                              aria-label={`Note for ${s.firstName} ${s.lastName}`}
                              className="min-h-10 w-full rounded-[var(--radius)] border bg-[hsl(var(--background))] px-3 text-sm"
                              placeholder="Optional note"
                              value={notes[s.id] ?? ''}
                              onChange={(e) => setNotes((prev) => ({ ...prev, [s.id]: e.target.value }))}
                            />
                          </TableCell>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}

          {saveError && <ErrorState message={saveError} />}

          <div className="flex gap-3">
            <Button type="submit" loading={saving} disabled={!selectedClassId || students.length === 0}>
              Save attendance
            </Button>
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
