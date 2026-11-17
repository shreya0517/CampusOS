'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '@/components/auth-provider';
import { EmptyState, ErrorState, Skeleton } from '@/components/feedback/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/form-field';
import { Pagination } from '@/components/ui/pagination';
import { AUDIENCE_LABEL, createAnnouncement, listAnnouncements } from '@/lib/announcements-api';
import type { Announcement, AnnouncementAudience } from '@/lib/announcements-api';

const PAGE_SIZE = 10;

const formatDate = (value: string): string =>
  new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

function NewAnnouncementForm({ onCreated }: { onCreated(): void }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<AnnouncementAudience>('ALL');
  const [expiresOn, setExpiresOn] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (title.trim().length < 3 || !body.trim()) return setError('Add a title of at least 3 characters and a message.');
    setSaving(true);
    setError(null);
    try {
      await createAnnouncement({ title, body, audience, ...(expiresOn ? { expiresAt: new Date(`${expiresOn}T23:59:59`).toISOString() } : {}) });
      setTitle('');
      setBody('');
      setAudience('ALL');
      setExpiresOn('');
      onCreated();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The announcement could not be published.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>New announcement</CardTitle>
        <CardDescription>Published immediately to the audience you choose.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={(event) => void submit(event)} noValidate>
          <Input label="Title" value={title} maxLength={160} onChange={(event) => setTitle(event.target.value)} required />
          <label className="grid gap-1.5 text-sm font-semibold" htmlFor="announcement-body">
            Message
            <textarea
              id="announcement-body"
              rows={4}
              maxLength={5000}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              className="rounded-[var(--radius)] border bg-[hsl(var(--background))] px-3 py-2 font-normal"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select label="Audience" value={audience} onChange={(event) => setAudience(event.target.value as AnnouncementAudience)}>
              {(Object.keys(AUDIENCE_LABEL) as AnnouncementAudience[]).map((key) => (
                <option key={key} value={key}>
                  {AUDIENCE_LABEL[key]}
                </option>
              ))}
            </Select>
            <Input label="Show until (optional)" type="date" value={expiresOn} onChange={(event) => setExpiresOn(event.target.value)} />
          </div>
          {error && (
            <p role="alert" className="text-sm text-[hsl(var(--destructive))]">
              {error}
            </p>
          )}
          <div>
            <Button type="submit" loading={saving}>
              Publish
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export default function AnnouncementsPage() {
  const { user } = useAuth();
  // Publishing is an ADMIN-only API action, so the form follows that role exactly.
  const isAdmin = user?.roles?.includes('ADMIN') ?? false;
  const [data, setData] = useState<{ items: Announcement[]; total: number } | null>(null);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setError(null);
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (query) params.set('search', query);
    try {
      setData(await listAnnouncements(params));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Announcements could not be loaded.');
    }
  }, [page, query]);

  useEffect(() => {
    void load();
  }, [load]);

  const pageCount = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-3xl font-semibold">Announcements</h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">Notices from the college, newest first.</p>
      </div>

      {isAdmin && (
        <NewAnnouncementForm
          onCreated={() => {
            setPage(1);
            void load();
          }}
        />
      )}

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
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>

      {error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : !data ? (
        <Skeleton className="h-64 w-full" />
      ) : data.items.length === 0 ? (
        <EmptyState title={query ? 'No matching announcements' : 'No announcements yet'} description={query ? 'Try a different word.' : 'Notices from the college will appear here.'} />
      ) : (
        <div className="grid gap-4">
          {data.items.map((item) => (
            <Card key={item.id}>
              <CardContent className="grid gap-2 pt-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold">{item.title}</h2>
                  <span className="rounded-full bg-[hsl(var(--muted))] px-2.5 py-0.5 text-xs font-semibold">{AUDIENCE_LABEL[item.audience]}</span>
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
