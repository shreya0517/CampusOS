'use client';

import Link from 'next/link';
import { useDeferredValue, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { EmptyState, ErrorState, Skeleton } from '@/components/feedback/states';
import { AccountBadge } from '@/components/students/account-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/form-field';
import { Pagination } from '@/components/ui/pagination';
import { Table, TableCell, TableHead } from '@/components/ui/table';
import { listDepartments, listFaculty } from '@/lib/faculty-api';
import type { Department, Faculty } from '@/lib/faculty-api';

const PAGE_SIZE = 20;

export default function FacultyPage() {
  const { primaryRole } = useAuth();
  const isAdmin = primaryRole === 'Admin';
  const showAccounts = isAdmin || primaryRole === 'HOD';

  const [query, setQuery] = useState('');
  const search = useDeferredValue(query);
  const [departmentId, setDepartmentId] = useState('');
  const [departments, setDepartments] = useState<Department[]>([]);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<Faculty[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isAdmin) listDepartments(new URLSearchParams({ page: '1', pageSize: '100' })).then((list) => setDepartments(list.items)).catch(() => undefined);
  }, [isAdmin]);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (search.trim()) params.set('search', search.trim());
      if (departmentId) params.set('departmentId', departmentId);
      const result = await listFaculty(params);
      setItems(result.items);
      setTotal(result.total);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Faculty could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [search, departmentId, page]);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Faculty</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            {isAdmin ? 'Teaching staff across every department.' : 'Teaching staff in your department.'}
          </p>
        </div>
        {isAdmin && (
          <Link href="/dashboard/faculty/new">
            <Button>+ Add Faculty</Button>
          </Link>
        )}
      </div>

      <Card>
        <CardContent className="grid gap-4">
          <div className={`grid gap-3 ${isAdmin ? 'md:grid-cols-[minmax(0,1fr)_16rem]' : ''}`}>
            <Input
              label="Search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Name or employee code"
            />
            {isAdmin && (
              <Select
                label="Department"
                value={departmentId}
                onChange={(event) => {
                  setDepartmentId(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">All departments</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </Select>
            )}
          </div>

          {loading ? (
            <div className="grid gap-2">
              {[0, 1, 2].map((index) => (
                <Skeleton key={index} className="h-12 w-full" />
              ))}
            </div>
          ) : error ? (
            <ErrorState message={error} onRetry={() => void load()} />
          ) : items.length ? (
            <>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                {total} faculty member{total === 1 ? '' : 's'}
              </p>
              <Table>
                <thead>
                  <tr>
                    <TableHead>Faculty</TableHead>
                    {showAccounts && <TableHead>Email</TableHead>}
                    <TableHead>Department</TableHead>
                    <TableHead>Designation</TableHead>
                    <TableHead className="text-right">Classes</TableHead>
                    {showAccounts && <TableHead>Account</TableHead>}
                    <TableHead className="text-right">Profile</TableHead>
                  </tr>
                </thead>
                <tbody>
                  {items.map((member) => (
                    <tr key={member.id}>
                      <TableCell>
                        <Link href={`/dashboard/faculty/${member.id}`} className="font-semibold hover:underline">
                          {member.firstName} {member.lastName}
                        </Link>
                        {member.isHod && (
                          <span className="ml-2 rounded-full bg-[hsl(var(--sidebar-active))] px-2 py-0.5 text-[11px] font-semibold text-[hsl(var(--sidebar-active-foreground))]">HOD</span>
                        )}
                        <span className="block text-xs text-[hsl(var(--muted-foreground))]">{member.employeeCode}</span>
                      </TableCell>
                      {showAccounts && <TableCell className="text-[hsl(var(--muted-foreground))]">{member.account?.email ?? '—'}</TableCell>}
                      <TableCell>{member.department?.name ?? <span className="text-amber-700 dark:text-amber-400">Unassigned</span>}</TableCell>
                      <TableCell>{member.designation ?? <span className="text-[hsl(var(--muted-foreground))]">—</span>}</TableCell>
                      <TableCell className="text-right tabular-nums">{member.classCount ?? 0}</TableCell>
                      {showAccounts && (
                        <TableCell>
                          <AccountBadge account={member.account ?? null} />
                        </TableCell>
                      )}
                      <TableCell className="text-right">
                        <Link className="font-semibold text-[hsl(var(--primary))] hover:underline" href={`/dashboard/faculty/${member.id}`}>
                          View
                        </Link>
                      </TableCell>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <Pagination page={page} pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))} onPageChange={setPage} />
            </>
          ) : (
            <EmptyState title="No faculty found" description={query || departmentId ? 'Try a different search or department.' : 'Faculty members appear here once they are added.'} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
