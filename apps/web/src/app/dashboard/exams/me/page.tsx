'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ErrorState, Skeleton } from '@/components/feedback/states';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableCell, TableHead } from '@/components/ui/table';
import { getMyResults } from '@/lib/exams-api';
import type { Mark, Result } from '@/lib/exams-api';

export default function MyResultsPage() {
  const [results, setResults] = useState<Result[]>([]);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMyResults();
      setResults(data.results);
      setMarks(data.marks);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load personal exam results.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const passedCount = results.filter((r) => r.status === 'PASSED').length;
  const avgPercentage =
    results.length > 0
      ? results.reduce((acc, curr) => acc + (curr.percentage ? Number(curr.percentage) : 0), 0) / results.length
      : 0;

  if (loading) return <Skeleton className="h-96 w-full" />;
  if (error) return <ErrorState message={error} onRetry={() => void loadData()} />;

  return (
    <div className="grid gap-6">
      <div>
        <Link href="/dashboard/exams" className="text-sm font-semibold text-[hsl(var(--primary))] hover:underline">
          &larr; Back to Exams
        </Link>
        <h1 className="mt-2 text-3xl font-semibold">My Academic Performance & Results</h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          Your official academic record, exam report cards, and subject paper marks.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">Exams Evaluated</p>
            <p className="mt-2 text-3xl font-bold">{results.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">Exams Passed</p>
            <p className="mt-2 text-3xl font-bold text-green-600">{passedCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">Average Percentage</p>
            <p className="mt-2 text-3xl font-bold text-blue-600">{avgPercentage.toFixed(1)}%</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Term Examination Report Cards</CardTitle>
          <CardDescription>Overall percentage standings and pass/fail status per exam.</CardDescription>
        </CardHeader>
        <CardContent>
          {results.length ? (
            <Table>
              <thead>
                <tr>
                  <TableHead>Exam Name</TableHead>
                  <TableHead>Published Date</TableHead>
                  <TableHead>Total Score</TableHead>
                  <TableHead>Percentage</TableHead>
                  <TableHead>Standing</TableHead>
                </tr>
              </thead>
              <tbody>
                {results.map((res) => (
                  <tr key={res.id}>
                    <TableCell>
                      <strong>{res.exam?.name ?? 'Exam'}</strong>
                    </TableCell>
                    <TableCell>{res.publishedAt ? new Date(res.publishedAt).toLocaleDateString() : 'N/A'}</TableCell>
                    <TableCell>{res.totalMarks ?? 'N/A'}</TableCell>
                    <TableCell>{res.percentage !== null && res.percentage !== undefined ? `${Number(res.percentage).toFixed(1)}%` : 'N/A'}</TableCell>
                    <TableCell>
                      <span className={`inline-block rounded-full px-3 py-0.5 text-xs font-bold ${
                        res.status === 'PASSED'
                          ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200'
                          : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200'
                      }`}>
                        {res.status}
                      </span>
                    </TableCell>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <div className="p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">
              No official exam results published for your profile yet.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Subject Paper Marks Breakdown</CardTitle>
          <CardDescription>Individual subject scores and attendance statuses.</CardDescription>
        </CardHeader>
        <CardContent>
          {marks.length ? (
            <Table>
              <thead>
                <tr>
                  <TableHead>Exam</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Marks Obtained</TableHead>
                  <TableHead>Max Marks</TableHead>
                  <TableHead>Status</TableHead>
                </tr>
              </thead>
              <tbody>
                {marks.map((m) => (
                  <tr key={m.id}>
                    <TableCell>{m.examSubject?.exam?.name ?? 'Exam'}</TableCell>
                    <TableCell>
                      <strong>{m.examSubject?.subject?.name ?? 'Subject'}</strong>
                      <span className="block text-xs text-[hsl(var(--muted-foreground))]">{m.examSubject?.subject?.code ?? ''}</span>
                    </TableCell>
                    <TableCell>{m.isAbsent ? <span className="font-semibold text-red-600">ABSENT</span> : (m.marksObtained ?? 'N/A')}</TableCell>
                    <TableCell>{m.examSubject?.maxMarks ?? 100}</TableCell>
                    <TableCell>
                      {!m.isAbsent && m.marksObtained !== null && m.marksObtained !== undefined && m.examSubject?.passMarks ? (
                        m.marksObtained >= m.examSubject.passMarks ? (
                          <span className="text-xs font-bold text-green-600">PASS</span>
                        ) : (
                          <span className="text-xs font-bold text-red-600">FAIL</span>
                        )
                      ) : (
                        <span className="text-xs text-[hsl(var(--muted-foreground))]">&mdash;</span>
                      )}
                    </TableCell>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <div className="p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">
              No subject paper marks uploaded yet.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
