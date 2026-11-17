import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableCell, TableHead } from '@/components/ui/table';
import type { AttendanceSummary, StudentRecord } from '@/lib/student-api';

const rupees = (amount: number): string => `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const shortDate = (iso: string | null): string => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

const STATUS_TONE: Record<string, string> = {
  GRADED: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
  SUBMITTED: 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
  LATE: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
  RETURNED: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
  MISSING: 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300',
  PASSED: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
  FAILED: 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300',
  PAID: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
  COMPLETED: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
  OVERDUE: 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300',
  FAILED_PAYMENT: 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300',
};

function Pill({ value, label }: { value: string; label?: string }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_TONE[value] ?? 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'}`}>
      {label ?? value.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (letter) => letter.toUpperCase())}
    </span>
  );
}

function Percentage({ summary }: { summary: AttendanceSummary }) {
  if (summary.percentage === null) return <span className="text-[hsl(var(--muted-foreground))]">—</span>;
  return <span className={`font-semibold tabular-nums ${summary.belowThreshold ? 'text-rose-600 dark:text-rose-400' : ''}`}>{summary.percentage}%</span>;
}

function Figure({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-[var(--radius)] border bg-[hsl(var(--muted))]/40 px-4 py-3">
      <p className="text-xs font-medium text-[hsl(var(--muted-foreground))]">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${tone ?? ''}`}>{value}</p>
    </div>
  );
}

/** Attendance, coursework, results and (Admin only) fees from a student's record. */
export function StudentRecordSections({ record }: { record: StudentRecord }) {
  const { attendance, coursework, results, fees } = record;
  return (
    <div className="grid gap-6">
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Attendance</CardTitle>
            <CardDescription>
              Late counts as present and excused sessions are left out; below {attendance.threshold}% is a shortage.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid grid-cols-3 gap-3">
              <Figure
                label="Overall"
                value={attendance.overall.percentage === null ? '—' : `${attendance.overall.percentage}%`}
                tone={attendance.overall.belowThreshold ? 'text-rose-600 dark:text-rose-400' : ''}
              />
              <Figure label="Attended" value={`${attendance.overall.attended}/${attendance.overall.counted}`} />
              <Figure label="Subjects short" value={attendance.subjects.filter((row) => row.belowThreshold).length} />
            </div>
            {attendance.subjects.length === 0 ? (
              <p className="text-sm text-[hsl(var(--muted-foreground))]">No attendance has been recorded yet.</p>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <TableHead>Subject</TableHead>
                    <TableHead className="text-right">Attended</TableHead>
                    <TableHead className="text-right">Attendance</TableHead>
                  </tr>
                </thead>
                <tbody>
                  {attendance.subjects.map((row) => (
                    <tr key={row.subject.id}>
                      <TableCell>
                        {row.subject.name} <span className="text-xs text-[hsl(var(--muted-foreground))]">{row.subject.code}</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.attended}/{row.counted}
                      </TableCell>
                      <TableCell className="text-right">
                        <Percentage summary={row} />
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
            <CardTitle>Examination results</CardTitle>
            <CardDescription>Published results only.</CardDescription>
          </CardHeader>
          <CardContent className={results.length ? 'p-0' : ''}>
            {results.length === 0 ? (
              <p className="text-sm text-[hsl(var(--muted-foreground))]">No results have been published yet.</p>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <TableHead>Exam</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Percentage</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead>Published</TableHead>
                  </tr>
                </thead>
                <tbody>
                  {results.map((result) => (
                    <tr key={result.id}>
                      <TableCell className="font-medium">{result.exam.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{result.totalMarks ?? '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">{result.percentage === null ? '—' : `${result.percentage}%`}</TableCell>
                      <TableCell>
                        <Pill value={result.status} />
                      </TableCell>
                      <TableCell>{shortDate(result.publishedAt)}</TableCell>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Coursework</CardTitle>
          <CardDescription>
            {coursework.assigned} assignment{coursework.assigned === 1 ? '' : 's'} in the student&apos;s current classes · {coursework.submitted} submitted ·{' '}
            <span className={coursework.missing ? 'font-semibold text-rose-600 dark:text-rose-400' : ''}>{coursework.missing} missed</span>
          </CardDescription>
        </CardHeader>
        <CardContent className={coursework.items.length ? 'p-0' : ''}>
          {coursework.items.length === 0 ? (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">No coursework has been set for the student&apos;s classes.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <TableHead>Assignment</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Marks</TableHead>
                </tr>
              </thead>
              <tbody>
                {coursework.items.map((item) => (
                  <tr key={item.id}>
                    <TableCell className="font-medium">{item.title}</TableCell>
                    <TableCell>{item.subject.name}</TableCell>
                    <TableCell>{shortDate(item.dueAt)}</TableCell>
                    <TableCell>
                      <Pill value={item.status} label={item.status === 'NOT_SUBMITTED' ? 'Not submitted' : item.status === 'MISSING' ? 'Missed' : undefined} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{item.marksAwarded === null ? '—' : `${item.marksAwarded}/${item.maxMarks}`}</TableCell>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>

      {fees && (
        <Card>
          <CardHeader>
            <CardTitle>Fees and payments</CardTitle>
            <CardDescription>Issued invoices with every payment attempt; only completed payments count as paid.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid grid-cols-3 gap-3">
              <Figure label="Billed" value={rupees(fees.billed)} />
              <Figure label="Paid" value={rupees(fees.paid)} tone="text-emerald-700 dark:text-emerald-400" />
              <Figure label="Balance" value={rupees(fees.balance)} tone={fees.balance > 0 ? 'text-rose-600 dark:text-rose-400' : ''} />
            </div>
            {fees.invoices.length === 0 ? (
              <p className="text-sm text-[hsl(var(--muted-foreground))]">No invoices have been issued to this student.</p>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Payments</TableHead>
                  </tr>
                </thead>
                <tbody>
                  {fees.invoices.map((invoice) => (
                    <tr key={invoice.id}>
                      <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                      <TableCell>{shortDate(invoice.dueOn)}</TableCell>
                      <TableCell className="text-right tabular-nums">{rupees(invoice.amountDue)}</TableCell>
                      <TableCell className="text-right tabular-nums">{rupees(invoice.paid)}</TableCell>
                      <TableCell className="text-right tabular-nums">{rupees(invoice.balance)}</TableCell>
                      <TableCell>
                        <Pill value={invoice.status} />
                      </TableCell>
                      <TableCell>
                        {invoice.payments.length === 0 ? (
                          <span className="text-[hsl(var(--muted-foreground))]">None</span>
                        ) : (
                          <ul className="grid gap-1 text-xs">
                            {invoice.payments.map((payment) => (
                              <li key={payment.id}>
                                {rupees(payment.amount)} · {payment.method.replace(/_/g, ' ').toLowerCase()} ·{' '}
                                <span className={payment.status === 'COMPLETED' ? 'text-emerald-700 dark:text-emerald-400' : payment.status === 'FAILED' ? 'text-rose-600 dark:text-rose-400' : ''}>
                                  {payment.status.toLowerCase()}
                                </span>
                                {payment.paidAt ? ` · ${shortDate(payment.paidAt)}` : ''}
                              </li>
                            ))}
                          </ul>
                        )}
                      </TableCell>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
