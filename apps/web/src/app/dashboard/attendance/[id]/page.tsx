'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ErrorState, Skeleton } from '@/components/feedback/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableCell, TableHead } from '@/components/ui/table';
import { getAttendance, updateAttendance } from '@/lib/attendance-api';
import type { AttendanceRecordItem, AttendanceSession, AttendanceStatus } from '@/lib/attendance-api';

const STATUS_OPTIONS: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'];
const STATUS_COLORS: Record<AttendanceStatus, string> = {
  PRESENT: 'text-green-600 dark:text-green-400',
  ABSENT: 'text-red-500',
  LATE: 'text-amber-500',
  EXCUSED: 'text-[hsl(var(--muted-foreground))]',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

export default function AttendanceDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [session, setSession] = useState<AttendanceSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = async (): Promise<void> => {
    try {
      const data = await getAttendance(id);
      setSession(data);
      setError(null);
      // Sync edit state from loaded data
      setStatuses(Object.fromEntries(data.records.map((r) => [r.studentId, r.status])));
      setNotes(Object.fromEntries(data.records.map((r) => [r.studentId, r.note ?? ''])));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Attendance session could not be loaded.');
    }
  };

  useEffect(() => { void load(); }, [id]);

  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!session) return <div className="grid gap-4"><Skeleton className="h-20 w-full" /><Skeleton className="h-48 w-full" /></div>;

  const handleSave = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      const records = session.records.map((r) => ({
        studentId: r.studentId,
        status: statuses[r.studentId] ?? r.status,
        note: notes[r.studentId] || undefined,
      }));
      const updated = await updateAttendance(id, { records });
      setSession(updated);
      setEditing(false);
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : 'Could not save attendance.');
    } finally {
      setSaving(false);
    }
  };

  const summary: Record<AttendanceStatus, number> = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 };
  session.records.forEach((r) => { summary[r.status] = (summary[r.status] ?? 0) + 1; });

  return (
    <div className="grid gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link className="text-sm font-semibold text-[hsl(var(--primary))] underline underline-offset-4" href="/dashboard/attendance">
            ← Attendance
          </Link>
          <h1 className="mt-3 text-3xl font-semibold">{session.class.subject.name}</h1>
          <p className="mt-1 text-[hsl(var(--muted-foreground))]">
            {session.class.section.semester.course.name} · Section {session.class.section.code} · {formatDate(session.heldOn)}
          </p>
        </div>
        {!editing && (
          <Button variant="outline" onClick={() => setEditing(true)}>Edit records</Button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(Object.entries(summary) as [AttendanceStatus, number][]).map(([status, count]) => (
          <Card key={status}>
            <CardHeader>
              <p className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">{status}</p>
              <p className={`mt-1 text-2xl font-bold ${STATUS_COLORS[status]}`}>{count}</p>
            </CardHeader>
          </Card>
        ))}
      </div>

      {/* Records */}
      <Card>
        <CardHeader>
          <CardTitle>Student records</CardTitle>
        </CardHeader>
        <CardContent>
          {editing ? (
            <form onSubmit={(e) => void handleSave(e)} className="grid gap-4">
              <Table>
                <thead>
                  <tr>
                    <TableHead>Student</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Note</TableHead>
                  </tr>
                </thead>
                <tbody>
                  {session.records.map((r: AttendanceRecordItem) => (
                    <tr key={r.studentId}>
                      <TableCell>
                        <strong>{r.student.firstName} {r.student.lastName}</strong>
                        <span className="block text-xs text-[hsl(var(--muted-foreground))]">{r.student.studentCode}</span>
                      </TableCell>
                      <TableCell>
                        <select
                          aria-label={`Status for ${r.student.firstName} ${r.student.lastName}`}
                          className="min-h-10 rounded-[var(--radius)] border bg-[hsl(var(--background))] px-3 text-sm"
                          value={statuses[r.studentId] ?? r.status}
                          onChange={(e) => setStatuses((prev) => ({ ...prev, [r.studentId]: e.target.value as AttendanceStatus }))}
                        >
                          {STATUS_OPTIONS.map((st) => <option key={st} value={st}>{st}</option>)}
                        </select>
                      </TableCell>
                      <TableCell>
                        <input
                          aria-label={`Note for ${r.student.firstName} ${r.student.lastName}`}
                          className="min-h-10 w-full rounded-[var(--radius)] border bg-[hsl(var(--background))] px-3 text-sm"
                          placeholder="Optional note"
                          value={notes[r.studentId] ?? r.note ?? ''}
                          onChange={(e) => setNotes((prev) => ({ ...prev, [r.studentId]: e.target.value }))}
                        />
                      </TableCell>
                    </tr>
                  ))}
                </tbody>
              </Table>
              {saveError && <ErrorState message={saveError} />}
              <div className="flex gap-3">
                <Button type="submit" loading={saving}>Save changes</Button>
                <Button type="button" variant="outline" onClick={() => { setEditing(false); setSaveError(null); }}>Cancel</Button>
              </div>
            </form>
          ) : (
            <Table>
              <thead>
                <tr>
                  <TableHead>Student</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Note</TableHead>
                </tr>
              </thead>
              <tbody>
                {session.records.map((r: AttendanceRecordItem) => (
                  <tr key={r.studentId}>
                    <TableCell>
                      <strong>{r.student.firstName} {r.student.lastName}</strong>
                      <span className="block text-xs text-[hsl(var(--muted-foreground))]">{r.student.studentCode}</span>
                    </TableCell>
                    <TableCell>
                      <span className={`font-semibold ${STATUS_COLORS[r.status]}`}>{r.status}</span>
                    </TableCell>
                    <TableCell>{r.note ?? <span className="text-[hsl(var(--muted-foreground))]">—</span>}</TableCell>
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
