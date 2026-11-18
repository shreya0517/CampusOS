'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { EmptyState, ErrorState, Skeleton } from '@/components/feedback/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Pagination } from '@/components/ui/pagination';
import { Table, TableCell, TableHead } from '@/components/ui/table';
import { checkInVisitor, checkOutVisitor, listMyVisitors, listVisitors, reviewVisitor } from '@/lib/visitors-api';
import type { Visitor, VisitorStatus } from '@/lib/visitors-api';

const PAGE_SIZE = 25;

const STATUS_BADGE: Record<VisitorStatus, { label: string; tone: string }> = {
  PENDING: { label: 'Pending', tone: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300' },
  APPROVED: { label: 'Approved', tone: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' },
  REJECTED: { label: 'Rejected', tone: 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300' },
  CHECKED_IN: { label: 'On campus', tone: 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300' },
  CHECKED_OUT: { label: 'Checked out', tone: 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]' },
};

const TABS: { value: VisitorStatus | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'CHECKED_IN', label: 'On campus' },
  { value: 'CHECKED_OUT', label: 'Checked out' },
  { value: 'REJECTED', label: 'Rejected' },
];

function Badge({ status }: { status: VisitorStatus }) {
  const badge = STATUS_BADGE[status];
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.tone}`}>{badge.label}</span>;
}

const visitDay = (iso: string): string => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const clock = (iso: string | null): string => (iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '');
const localToday = (): string => new Date().toLocaleDateString('en-CA');

export default function VisitorsPage() {
  const { primaryRole } = useAuth();
  const isManager = primaryRole === 'Admin' || primaryRole === 'HOD';

  const [status, setStatus] = useState<VisitorStatus | ''>('');
  const [todayOnly, setTodayOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [total, setTotal] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [myVisitors, setMyVisitors] = useState<Visitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (status) params.set('status', status);
      if (todayOnly) params.set('on', localToday());
      const [all, pending, mine] = await Promise.all([
        isManager ? listVisitors(params) : Promise.resolve(null),
        isManager ? listVisitors(new URLSearchParams({ status: 'PENDING', page: '1', pageSize: '1' })) : Promise.resolve(null),
        listMyVisitors(),
      ]);
      if (all) {
        setVisitors(all.items);
        setTotal(all.total);
      }
      if (pending) setPendingCount(pending.total);
      setMyVisitors(mine);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Visitors could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [isManager, status, todayOnly, page]);

  const act = async (id: string, action: () => Promise<unknown>) => {
    setBusy(id);
    setActionError(null);
    try {
      await action();
      await load();
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'The visitor could not be updated.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Visitors</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            {isManager
              ? `Approve requests and record arrivals and departures.${pendingCount ? ` ${pendingCount} waiting for approval.` : ''}`
              : 'Register visitors and follow their requests.'}
          </p>
        </div>
        <Link href="/dashboard/visitors/new">
          <Button>+ Register Visitor</Button>
        </Link>
      </div>

      {actionError && (
        <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
          {actionError}
        </p>
      )}
      {error && <ErrorState message={error} onRetry={() => void load()} />}

      {isManager && (
        <Card>
          <CardHeader className="grid gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {TABS.map((tab) => (
                <button
                  key={tab.value || 'all'}
                  type="button"
                  onClick={() => {
                    setStatus(tab.value);
                    setPage(1);
                  }}
                  className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
                    status === tab.value ? 'border-[hsl(var(--primary))] bg-[hsl(var(--sidebar-active))] text-[hsl(var(--sidebar-active-foreground))]' : 'bg-[hsl(var(--card))] hover:bg-[hsl(var(--muted))]'
                  }`}
                >
                  {tab.label}
                  {tab.value === 'PENDING' && pendingCount > 0 && <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 text-[11px] font-bold text-white">{pendingCount}</span>}
                </button>
              ))}
              <label className="ml-auto flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={todayOnly}
                  onChange={(event) => {
                    setTodayOnly(event.target.checked);
                    setPage(1);
                  }}
                />
                Expected today
              </label>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="grid gap-2 p-5">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : visitors.length === 0 ? (
              <div className="p-5">
                <EmptyState title="No visitors" description={status || todayOnly ? 'Nothing matches these filters.' : 'Registered campus visitors will appear here.'} />
              </div>
            ) : (
              <>
                <Table>
                  <thead>
                    <tr>
                      <TableHead>Visitor</TableHead>
                      <TableHead>Purpose</TableHead>
                      <TableHead>Host / registered by</TableHead>
                      <TableHead>Visit date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </tr>
                  </thead>
                  <tbody>
                    {visitors.map((visitor) => (
                      <tr key={visitor.id}>
                        <TableCell>
                          <p className="font-semibold">{visitor.name}</p>
                          <p className="text-xs text-[hsl(var(--muted-foreground))]">{visitor.phone}</p>
                        </TableCell>
                        <TableCell className="max-w-[16rem]">{visitor.purpose}</TableCell>
                        <TableCell>
                          {visitor.host?.displayName ?? '—'}
                          <span className="block text-xs text-[hsl(var(--muted-foreground))]">by {visitor.registeredBy.displayName}</span>
                        </TableCell>
                        <TableCell>{visitDay(visitor.visitDate)}</TableCell>
                        <TableCell>
                          <Badge status={visitor.status} />
                          {(visitor.checkedInAt || visitor.checkedOutAt) && (
                            <span className="mt-1 block text-xs text-[hsl(var(--muted-foreground))]">
                              {visitor.checkedInAt ? `In ${clock(visitor.checkedInAt)}` : ''}
                              {visitor.checkedOutAt ? ` · Out ${clock(visitor.checkedOutAt)}` : ''}
                            </span>
                          )}
                          {visitor.approvedBy && visitor.status !== 'PENDING' && (
                            <span className="block text-xs text-[hsl(var(--muted-foreground))]">
                              {visitor.status === 'REJECTED' ? 'Rejected' : 'Approved'} by {visitor.approvedBy.displayName}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {visitor.status === 'PENDING' && (
                              <>
                                <Button className="min-h-8 px-3 text-xs" loading={busy === visitor.id} onClick={() => void act(visitor.id, () => reviewVisitor(visitor.id, { decision: 'APPROVED' }))}>
                                  Approve
                                </Button>
                                <Button variant="outline" className="min-h-8 px-3 text-xs" disabled={busy === visitor.id} onClick={() => void act(visitor.id, () => reviewVisitor(visitor.id, { decision: 'REJECTED' }))}>
                                  Reject
                                </Button>
                              </>
                            )}
                            {visitor.status === 'APPROVED' && (
                              <Button className="min-h-8 px-3 text-xs" loading={busy === visitor.id} onClick={() => void act(visitor.id, () => checkInVisitor(visitor.id))}>
                                Check in
                              </Button>
                            )}
                            {visitor.status === 'CHECKED_IN' && (
                              <Button variant="outline" className="min-h-8 px-3 text-xs" loading={busy === visitor.id} onClick={() => void act(visitor.id, () => checkOutVisitor(visitor.id))}>
                                Check out
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </tr>
                    ))}
                  </tbody>
                </Table>
                {total > PAGE_SIZE && (
                  <div className="p-4">
                    <Pagination page={page} pageCount={Math.ceil(total / PAGE_SIZE)} onPageChange={setPage} />
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>My registrations</CardTitle>
          <CardDescription>Visitors you registered and where their requests stand.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {myVisitors.length === 0 ? (
            <div className="p-5">
              <EmptyState title="No visitors registered" description="Register a visitor before they come to campus." />
            </div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <TableHead>Visitor</TableHead>
                  <TableHead>Purpose</TableHead>
                  <TableHead>Visit date</TableHead>
                  <TableHead>Status</TableHead>
                </tr>
              </thead>
              <tbody>
                {myVisitors.map((visitor) => (
                  <tr key={visitor.id}>
                    <TableCell>
                      <p className="font-semibold">{visitor.name}</p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">{visitor.phone}</p>
                    </TableCell>
                    <TableCell>{visitor.purpose}</TableCell>
                    <TableCell>{visitDay(visitor.visitDate)}</TableCell>
                    <TableCell>
                      <Badge status={visitor.status} />
                      {visitor.checkedInAt && <span className="mt-1 block text-xs text-[hsl(var(--muted-foreground))]">Arrived {clock(visitor.checkedInAt)}</span>}
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
