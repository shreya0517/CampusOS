'use client';

import { useCallback, useEffect, useState } from 'react';
import { EmptyState, ErrorState, Skeleton } from '@/components/feedback/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/form-field';
import { Pagination } from '@/components/ui/pagination';
import { Table, TableCell, TableHead } from '@/components/ui/table';
import { AnnouncementForm, formatDateTime } from '@/components/announcements/announcement-form';
import { AUDIENCE_LABEL, CATEGORY_LABEL, STATE_LABEL, archiveAnnouncement, describeTarget, listAnnouncementHistory, restoreAnnouncement } from '@/lib/announcements-api';
import type { AnnouncementCategory, AnnouncementHistory as History, AnnouncementState, ManagedAnnouncement } from '@/lib/announcements-api';

const PAGE_SIZE = 15;
const STATES: AnnouncementState[] = ['PUBLISHED', 'SCHEDULED', 'EXPIRED', 'ARCHIVED'];
const STATE_STYLE: Record<AnnouncementState, string> = {
  PUBLISHED: 'bg-emerald-50 text-emerald-800 ring-emerald-600/20 dark:bg-emerald-950 dark:text-emerald-200',
  SCHEDULED: 'bg-blue-50 text-blue-800 ring-blue-600/20 dark:bg-blue-950 dark:text-blue-200',
  EXPIRED: 'bg-slate-100 text-slate-700 ring-slate-500/20 dark:bg-slate-800 dark:text-slate-200',
  ARCHIVED: 'bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-950 dark:text-amber-200',
};

/** Admin's announcement history: every announcement by state, with edit, archive and restore. */
export function AnnouncementHistory() {
  const [data, setData] = useState<History | null>(null);
  const [state, setState] = useState<AnnouncementState | ''>('');
  const [category, setCategory] = useState<AnnouncementCategory | ''>('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<ManagedAnnouncement | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setError(null);
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (state) params.set('state', state);
    if (category) params.set('category', category);
    if (query) params.set('search', query);
    try {
      setData(await listAnnouncementHistory(params));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The announcement history could not be loaded.');
    }
  }, [page, state, category, query]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleArchive = async (item: ManagedAnnouncement): Promise<void> => {
    setBusy(item.id);
    setNotice(null);
    try {
      if (item.state === 'ARCHIVED') {
        await restoreAnnouncement(item.id);
        setNotice(`Restored "${item.title}".`);
      } else {
        await archiveAnnouncement(item.id);
        setNotice(`Archived "${item.title}". Nobody sees it now${item.state === 'SCHEDULED' ? ', and it won’t be sent' : ''}.`);
      }
      await load();
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'That could not be done.');
    } finally {
      setBusy(null);
    }
  };

  const pageCount = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const allCount = data ? STATES.reduce((sum, key) => sum + data.counts[key], 0) : 0;

  return (
    <div className="grid grid-cols-1 gap-4">
      {editing && (
        <AnnouncementForm
          key={editing.id}
          editing={editing}
          onCancel={() => setEditing(null)}
          onSaved={(message) => {
            setEditing(null);
            setNotice(message);
            void load();
          }}
        />
      )}
      {notice && (
        <p role="status" className="rounded-[var(--radius)] border bg-[hsl(var(--muted))]/50 px-4 py-3 text-sm">
          {notice}
        </p>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Announcement history</CardTitle>
          <CardDescription>Every announcement in the college, including scheduled, expired and archived ones.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by state">
            {([['', 'All', allCount], ...STATES.map((key) => [key, STATE_LABEL[key], data?.counts[key] ?? 0])] as Array<[AnnouncementState | '', string, number]>).map(([key, label, count]) => (
              <button
                key={label}
                type="button"
                role="tab"
                aria-selected={state === key}
                onClick={() => {
                  setState(key);
                  setPage(1);
                }}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                  state === key ? 'border-[hsl(var(--primary))] bg-[hsl(var(--sidebar-active))] text-[hsl(var(--sidebar-active-foreground))]' : 'hover:bg-[hsl(var(--muted))]'
                }`}
              >
                {label} <span className="tabular-nums text-[hsl(var(--muted-foreground))]">{count}</span>
              </button>
            ))}
          </div>
          <form
            className="flex flex-wrap items-end gap-3"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              setPage(1);
              setQuery(search.trim());
            }}
          >
            <div className="min-w-56 flex-1">
              <Input label="Search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Title or message" />
            </div>
            <div className="w-48">
              <Select
                label="Category"
                value={category}
                onChange={(event) => {
                  setPage(1);
                  setCategory(event.target.value as AnnouncementCategory | '');
                }}
              >
                <option value="">All categories</option>
                {(Object.keys(CATEGORY_LABEL) as AnnouncementCategory[]).map((key) => (
                  <option key={key} value={key}>
                    {CATEGORY_LABEL[key]}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit" variant="outline">
              Search
            </Button>
          </form>

          {error ? (
            <ErrorState message={error} onRetry={() => void load()} />
          ) : !data ? (
            <Skeleton className="h-64 w-full" />
          ) : data.items.length === 0 ? (
            <EmptyState title="Nothing here" description="No announcements match these filters." />
          ) : (
            <div className="-mx-5">
              <Table>
                <thead>
                  <tr>
                    <TableHead>Announcement</TableHead>
                    <TableHead>Sent to</TableHead>
                    <TableHead>Publish time</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => (
                    <tr key={item.id} className="align-top">
                      <TableCell className="min-w-[16rem] max-w-md">
                        <p className="font-medium">{item.title}</p>
                        <p className="line-clamp-2 text-xs text-[hsl(var(--muted-foreground))]">{item.body}</p>
                        <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                          {CATEGORY_LABEL[item.category]} · {item.author.displayName}
                        </p>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {describeTarget(item) ?? 'Whole college'}
                        <p className="text-xs text-[hsl(var(--muted-foreground))]">{AUDIENCE_LABEL[item.audience]}</p>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatDateTime(item.publishedAt)}
                        {item.expiresAt && <p className="text-xs text-[hsl(var(--muted-foreground))]">Until {formatDateTime(item.expiresAt)}</p>}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${STATE_STYLE[item.state]}`}>{STATE_LABEL[item.state]}</span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            className="min-h-8 px-3"
                            onClick={() => {
                              setNotice(null);
                              setEditing(item);
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                          >
                            Edit
                          </Button>
                          <Button variant="outline" className="min-h-8 px-3" loading={busy === item.id} onClick={() => void toggleArchive(item)} aria-label={`${item.state === 'ARCHIVED' ? 'Restore' : 'Archive'} ${item.title}`}>
                            {item.state === 'ARCHIVED' ? 'Restore' : 'Archive'}
                          </Button>
                        </div>
                      </TableCell>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
          {pageCount > 1 && <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />}
        </CardContent>
      </Card>
    </div>
  );
}
