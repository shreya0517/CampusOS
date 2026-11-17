'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ErrorState, Skeleton } from '@/components/feedback/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableCell, TableHead } from '@/components/ui/table';
import { getSubjectMarks, updateSubjectMarks } from '@/lib/exams-api';
import type { ExamSubject } from '@/lib/exams-api';

type StudentMarkRow = {
  studentId: string;
  studentCode: string;
  name: string;
  marksObtained: string;
  isAbsent: boolean;
};

export default function MarksEntryPage() {
  const { id: examId, subjectId: examSubjectId } = useParams<{ id: string; subjectId: string }>();

  const [examSubject, setExamSubject] = useState<ExamSubject | null>(null);
  const [rows, setRows] = useState<StudentMarkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getSubjectMarks(examId, examSubjectId);
      setExamSubject(data.examSubject);

      const initialRows: StudentMarkRow[] = data.items.map((item) => ({
        studentId: item.student.id,
        studentCode: item.student.studentCode,
        name: `${item.student.firstName} ${item.student.lastName}`,
        marksObtained: item.mark?.marksObtained !== null && item.mark?.marksObtained !== undefined ? String(item.mark.marksObtained) : '',
        isAbsent: item.mark?.isAbsent ?? false,
      }));

      setRows(initialRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load marks entry sheet.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [examId, examSubjectId]);

  const handleMarksChange = (index: number, val: string) => {
    setRows((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index]!, marksObtained: val };
      return copy;
    });
  };

  const handleAbsentChange = (index: number, absent: boolean) => {
    setRows((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index]!, isAbsent: absent, marksObtained: absent ? '' : copy[index]!.marksObtained };
      return copy;
    });
  };

  const handleSave = async () => {
    if (!examSubject) return;
    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    const max = examSubject.maxMarks;
    for (const r of rows) {
      if (!r.isAbsent && r.marksObtained !== '') {
        const val = Number(r.marksObtained);
        if (isNaN(val) || val < 0 || val > max) {
          setError(`Marks for ${r.name} (${r.marksObtained}) must be a valid number between 0 and ${max}.`);
          setSaving(false);
          return;
        }
      }
    }

    try {
      const marksPayload = rows.map((r) => ({
        studentId: r.studentId,
        marksObtained: !r.isAbsent && r.marksObtained !== '' ? Number(r.marksObtained) : null,
        isAbsent: r.isAbsent,
      }));

      await updateSubjectMarks(examId, examSubjectId, { marks: marksPayload });
      setSuccessMsg(`Marks updated successfully for ${rows.length} students!`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save marks.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Skeleton className="h-96 w-full" />;
  if (error && !examSubject) return <ErrorState message={error} onRetry={() => void loadData()} />;

  return (
    <div className="grid gap-6">
      <div>
        <Link href={`/dashboard/exams/${examId}`} className="text-sm font-semibold text-[hsl(var(--primary))] hover:underline">
          &larr; Back to Exam Details
        </Link>
        <div className="mt-2 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-3xl font-semibold">Marks Entry & Evaluation</h1>
            <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
              {examSubject?.subject?.name ?? 'Subject'} &bull; Max Marks: <strong>{examSubject?.maxMarks}</strong> &bull; Pass Marks: <strong>{examSubject?.passMarks}</strong>
            </p>
          </div>
          <Button loading={saving} onClick={() => void handleSave()}>
            Save Marks Sheet &rarr;
          </Button>
        </div>
      </div>

      {error && <ErrorState message={error} />}
      {successMsg && (
        <div role="status" className="rounded-[var(--radius)] border border-green-500 bg-green-50 p-4 text-sm font-semibold text-green-900 dark:bg-green-950/40 dark:text-green-200">
          {successMsg}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Student Score Sheet ({rows.length} Enrolled Students)</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length ? (
            <Table>
              <thead>
                <tr>
                  <TableHead>Student Code</TableHead>
                  <TableHead>Student Name</TableHead>
                  <TableHead className="w-32">Absent?</TableHead>
                  <TableHead className="w-48">Marks Obtained / {examSubject?.maxMarks}</TableHead>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={row.studentId}>
                    <TableCell className="font-mono text-xs">{row.studentCode}</TableCell>
                    <TableCell>
                      <strong>{row.name}</strong>
                    </TableCell>
                    <TableCell>
                      <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                        <input
                          type="checkbox"
                          checked={row.isAbsent}
                          onChange={(e) => handleAbsentChange(idx, e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                        Absent
                      </label>
                    </TableCell>
                    <TableCell>
                      <input
                        type="number"
                        min="0"
                        max={examSubject?.maxMarks}
                        step="0.5"
                        disabled={row.isAbsent}
                        value={row.marksObtained}
                        placeholder={row.isAbsent ? 'Absent' : '0.0'}
                        onChange={(e) => handleMarksChange(idx, e.target.value)}
                        className="w-full rounded-[var(--radius)] border bg-[hsl(var(--card))] px-3 py-1.5 text-sm text-[hsl(var(--foreground))] disabled:bg-gray-100 dark:disabled:bg-gray-800"
                      />
                    </TableCell>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <div className="p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">
              No active students enrolled in this section/semester.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
