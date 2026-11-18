'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { AnnouncementForm } from '@/components/announcements/announcement-form';
import { AnnouncementHistory } from '@/components/announcements/announcement-history';
import { EmptyState, ErrorState, Skeleton } from '@/components/feedback/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/form-field';
import { Pagination } from '@/components/ui/pagination';
import { AUDIENCE_LABEL, CATEGORY_LABEL, describeTarget, listAnnouncements } from '@/lib/announcements-api';
import type { Announcement, AnnouncementCategory } from '@/lib/announcements-api';

const PAGE_SIZE = 10;
const CATEGORIES = Object.keys(CATEGORY_LABEL) as AnnouncementCategory[];

const formatDate = (value: string): string => new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/** The announcements a user can see now, with search and a category filter. */
function NoticeBoard({ reloadKey }: { reloadKey: number }) {
  const [data, setData] = useState<{ items: Announcement[]; total: number } | null>(null);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<AnnouncementCategory | ''>('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setError(null);
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (query) params.set('search', query);
    if (category) params.set('category', category);
    try {
      setData(await listAnnouncements(params));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Announcements could not be loaded.');
    }
  }, [page, query, category]);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const pageCount = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const filtered = Boolean(query || category);

  return (
    <div className="grid gap-4">
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
          <Input label="Search announcements" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Exam, holiday, fees…" />
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
            {CATEGORIES.map((key) => (
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
        <EmptyState title={filtered ? 'No matching announcements' : 'No announcements yet'} description={filtered ? 'Try a different word or category.' : 'Notices from the college will appear here.'} />
      ) : (
        <div className="grid gap-4">
          {data.items.map((item) => (
            <Card key={item.id}>
              <CardContent className="grid gap-2 pt-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h2 className="text-lg font-semibold">{item.title}</h2>
                  <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
                    <span className="rounded-full border border-[hsl(var(--primary))]/30 bg-[hsl(var(--sidebar-active))] px-2.5 py-0.5 text-[hsl(var(--sidebar-active-foreground))]">{CATEGORY_LABEL[item.category]}</span>
                    <span className="rounded-full bg-[hsl(var(--muted))] px-2.5 py-0.5">{AUDIENCE_LABEL[item.audience]}</span>
                    <span className="rounded-full bg-[hsl(var(--muted))] px-2.5 py-0.5">{describeTarget(item) ?? 'Whole college'}</span>
                  </div>
                </div>
                <p className="whitespace-pre-line text-sm leading-relaxed">{item.body}</p>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  {formatDate(item.publishedAt)} · {item.author.displayName}
                  {item.expiresAt ? ` · Until ${formatDate(item.expiresAt)}` : ''}
                </p>
              </CardContent>
            </Card>
          ))}
          {pageCount > 1 && <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />}
        </div>
      )}
    </div>
  );
}

export default function AnnouncementsPage() {
  const { user } = useAuth();
  // Publishing and managing are ADMIN-only API actions, so these follow that role exactly.
  const isAdmin = user?.roles?.includes('ADMIN') ?? false;
  const [tab, setTab] = useState<'board' | 'manage'>('board');
  const [notice, setNotice] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Announcements</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            {isAdmin ? 'Publish notices and manage every announcement in the college.' : 'Notices for you: college-wide, and for your department, semester or section. Newest first.'}
          </p>
        </div>
        {isAdmin && (
          <div className="inline-flex rounded-[var(--radius)] border bg-[hsl(var(--card))] p-1" role="tablist" aria-label="Announcements view">
            {(
              [
                ['board', 'Notice board'],
                ['manage', 'Manage'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={`rounded-md px-4 py-1.5 text-sm font-semibold transition-colors ${tab === key ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {isAdmin && tab === 'manage' ? (
        <AnnouncementHistory />
      ) : (
        <>
          {isAdmin && (
            <AnnouncementForm
              onSaved={(message) => {
                setNotice(message);
                setReloadKey((key) => key + 1);
              }}
            />
          )}
          {notice && (
            <p role="status" className="rounded-[var(--radius)] border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100">
              {notice}
            </p>
          )}
          <NoticeBoard reloadKey={reloadKey} />
        </>
      )}
    </div>
  );
}
