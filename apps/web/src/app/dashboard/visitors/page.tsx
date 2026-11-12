'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, ErrorState, Skeleton } from '@/components/feedback/states';
import { Table, TableCell, TableHead } from '@/components/ui/table';
import { listVisitors, listMyVisitors, reviewVisitor, type Visitor } from '@/lib/visitors-api';

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  CHECKED_IN: 'bg-blue-100 text-blue-700',
  CHECKED_OUT: 'bg-gray-100 text-gray-700',
};

function Badge({ value }: { value: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE[value] ?? 'bg-gray-100 text-gray-700'}`}>
      {value.replace('_', ' ')}
    </span>
  );
}

export default function VisitorsPage() {
  const { primaryRole } = useAuth();
  const isManager = primaryRole === 'Admin' || primaryRole === 'HOD';

  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [myVisitors, setMyVisitors] = useState<Visitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: '1', pageSize: '50' });
      const [allRes, myRes] = await Promise.all([
        isManager ? listVisitors(params) : Promise.resolve({ items: [] as Visitor[], total: 0, page: 1, pageSize: 50 }),
        listMyVisitors(params),
      ]);
      setVisitors(allRes.items);
      setMyVisitors(myRes.items);
    } catch {
      setError('Failed to load visitors. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [isManager]);

  const handleReview = async (id: string, decision: 'APPROVED' | 'REJECTED') => {
    setReviewing(id);
    setActionError(null);
    try {
      await reviewVisitor(id, { decision });
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update visitor status.');
    } finally {
      setReviewing(null);
    }
  };

  const pendingCount = visitors.filter((v) => v.status === 'PENDING').length;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[.16em] text-[hsl(var(--primary))]">Campus</p>
          <h1 className="mt-2 text-3xl font-semibold">Visitor Management</h1>
          <p className="mt-2 text-[hsl(var(--muted-foreground))]">
            {isManager
              ? `Register and manage campus visitors. ${pendingCount > 0 ? `${pendingCount} pending approval.` : ''}`
              : 'Register visitors and track your registrations.'}
          </p>
        </div>
        <Link href="/dashboard/visitors/new">
          <Button>+ Register Visitor</Button>
        </Link>
      </div>

      {actionError && (
        <p className="rounded-[var(--radius)] bg-[hsl(var(--destructive))]/10 px-3 py-2 text-sm text-[hsl(var(--destructive))]">
          {actionError}
        </p>
      )}
      {error && <ErrorState message={error} onRetry={load} />}

      {loading ? (
        <div className="grid gap-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <div className="grid gap-6">
          {/* Pending approvals (managers) */}
          {isManager && (
            <Card>
              <CardHeader>
                <CardTitle>
                  Pending Approvals
                  {pendingCount > 0 && (
                    <span className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-white">
                      {pendingCount}
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {visitors.filter((v) => v.status === 'PENDING').length === 0 ? (
                  <div className="p-6">
                    <EmptyState title="No pending requests" description="All visitor requests have been reviewed." />
                  </div>
                ) : (
                  <Table>
                    <thead>
                      <tr>
                        <TableHead>Name</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Purpose</TableHead>
                        <TableHead>Visit Date</TableHead>
                        <TableHead>Registered By</TableHead>
                        <TableHead>Actions</TableHead>
                      </tr>
                    </thead>
                    <tbody>
                      {visitors.filter((v) => v.status === 'PENDING').map((v) => (
                        <tr key={v.id}>
                          <TableCell className="font-medium">{v.name}</TableCell>
                          <TableCell>{v.phone}</TableCell>
                          <TableCell>{v.purpose}</TableCell>
                          <TableCell>{new Date(v.visitDate).toLocaleDateString('en-IN')}</TableCell>
                          <TableCell>{v.registeredBy.displayName}</TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button
                                className="text-xs"
                                loading={reviewing === v.id}
                                onClick={() => void handleReview(v.id, 'APPROVED')}
                              >
                                Approve
                              </Button>
                              <Button
                                variant="destructive"
                                className="text-xs"
                                loading={reviewing === v.id}
                                onClick={() => void handleReview(v.id, 'REJECTED')}
                              >
                                Reject
                              </Button>
                            </div>
                          </TableCell>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}

          {/* All visitors (managers) */}
          {isManager && (
            <Card>
              <CardHeader><CardTitle>All Visitors ({visitors.length})</CardTitle></CardHeader>
              <CardContent className="p-0">
                {visitors.length === 0 ? (
                  <div className="p-6">
                    <EmptyState title="No visitors yet" description="Registered campus visitors will appear here." />
                  </div>
                ) : (
                  <Table>
                    <thead>
                      <tr>
                        <TableHead>Name</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Purpose</TableHead>
                        <TableHead>Visit Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Approved By</TableHead>
                      </tr>
                    </thead>
                    <tbody>
                      {visitors.map((v) => (
                        <tr key={v.id}>
                          <TableCell className="font-medium">{v.name}</TableCell>
                          <TableCell>{v.phone}</TableCell>
                          <TableCell>{v.purpose}</TableCell>
                          <TableCell>{new Date(v.visitDate).toLocaleDateString('en-IN')}</TableCell>
                          <TableCell><Badge value={v.status} /></TableCell>
                          <TableCell>{v.approvedBy?.displayName ?? '—'}</TableCell>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}

          {/* My registrations */}
          <Card>
            <CardHeader><CardTitle>My Registrations ({myVisitors.length})</CardTitle></CardHeader>
            <CardContent className="p-0">
              {myVisitors.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    title="No visitors registered"
                    description="Register a visitor to track their campus visit."
                    action={
                      <Link href="/dashboard/visitors/new">
                        <Button>Register Visitor</Button>
                      </Link>
                    }
                  />
                </div>
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <TableHead>Name</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Purpose</TableHead>
                      <TableHead>Visit Date</TableHead>
                      <TableHead>Status</TableHead>
                    </tr>
                  </thead>
                  <tbody>
                    {myVisitors.map((v) => (
                      <tr key={v.id}>
                        <TableCell className="font-medium">{v.name}</TableCell>
                        <TableCell>{v.phone}</TableCell>
                        <TableCell>{v.purpose}</TableCell>
                        <TableCell>{new Date(v.visitDate).toLocaleDateString('en-IN')}</TableCell>
                        <TableCell><Badge value={v.status} /></TableCell>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
