'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '@/components/auth-provider';
import { EmptyState, ErrorState, Skeleton } from '@/components/feedback/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/form-field';
import { Pagination } from '@/components/ui/pagination';
import { AUDIENCE_LABEL, CATEGORY_LABEL, createAnnouncement, describeTarget, listAnnouncements } from '@/lib/announcements-api';
import type { Announcement, AnnouncementAudience, AnnouncementCategory } from '@/lib/announcements-api';
import { listDepartments } from '@/lib/faculty-api';
import type { Department } from '@/lib/faculty-api';
import { listSections } from '@/lib/student-api';
import type { SectionOption } from '@/lib/student-api';

const PAGE_SIZE = 10;
const CATEGORIES = Object.keys(CATEGORY_LABEL) as AnnouncementCategory[];

const formatDate = (value: string): string => new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const formatDateTime = (value: string): string =>
  new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
/** The current local time as a datetime-local value, the earliest a schedule can be set for. */
const nowForInput = (): string => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

const AUDIENCE_PEOPLE: Record<AnnouncementAudience, string> = { ALL: 'Students and staff', STUDENTS: 'Students', FACULTY: 'Faculty and HODs', STAFF: 'Faculty, HODs and Admins' };

function NewAnnouncementForm({ onCreated }: { onCreated(message: string): void }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<AnnouncementAudience>('ALL');
  const [category, setCategory] = useState<AnnouncementCategory>('GENERAL');
  const [departmentId, setDepartmentId] = useState('');
  const [semester, setSemester] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [timing, setTiming] = useState<'now' | 'later'>('now');
  const [publishAt, setPublishAt] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [departments, setDepartments] = useState<Department[]>([]);
  const [sections, setSections] = useState<SectionOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listDepartments(new URLSearchParams({ page: '1', pageSize: '100' }))
      .then((list) => setDepartments(list.items))
      .catch(() => undefined);
    listSections()
      .then(setSections)
      .catch(() => undefined);
  }, []);

  // Semesters and sections narrow to the chosen department, and sections to the chosen semester.
  const inDepartment = useMemo(() => sections.filter((section) => !departmentId || section.semester.course.department.id === departmentId), [sections, departmentId]);
  const semesters = useMemo(() => [...new Set(inDepartment.map((section) => section.semester.number))].sort((a, b) => a - b), [inDepartment]);
  const sectionChoices = inDepartment.filter((section) => !semester || section.semester.number === Number(semester));
  const chosenSection = sections.find((section) => section.id === sectionId);
  const departmentName = departments.find((department) => department.id === departmentId)?.name ?? chosenSection?.semester.course.department.name;
  const reach = chosenSection
    ? `${chosenSection.semester.course.code} ${chosenSection.semester.name}, section ${chosenSection.code}`
    : [departmentName, semester ? `semester ${semester}` : null].filter(Boolean).join(', ') || 'the whole college';

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (title.trim().length < 3 || !body.trim()) return setError('Add a title of at least 3 characters and a message.');
    if (timing === 'later' && !publishAt) return setError('Choose when to publish it.');
    setSaving(true);
    setError(null);
    try {
      const created = await createAnnouncement({
        title,
        body,
        audience,
        category,
        ...(departmentId ? { departmentId } : {}),
        ...(semester ? { semesterNumber: Number(semester) } : {}),
        ...(sectionId ? { sectionId } : {}),
        ...(timing === 'later' ? { publishedAt: new Date(publishAt).toISOString() } : {}),
        ...(expiresOn ? { expiresAt: new Date(`${expiresOn}T23:59:59`).toISOString() } : {}),
      });
      setTitle('');
      setBody('');
      setExpiresOn('');
      setPublishAt('');
      setTiming('now');
      onCreated(new Date(created.publishedAt) > new Date() ? `Scheduled for ${formatDateTime(created.publishedAt)}. It will be sent then.` : 'Published and sent.');
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
        <CardDescription>Send it to the whole college or to one department, semester or section, now or at a set time.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-5" onSubmit={(event) => void submit(event)} noValidate>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <Input label="Title" value={title} maxLength={160} onChange={(event) => setTitle(event.target.value)} required />
            <Select label="Category" value={category} onChange={(event) => setCategory(event.target.value as AnnouncementCategory)}>
              {CATEGORIES.map((key) => (
                <option key={key} value={key}>
                  {CATEGORY_LABEL[key]}
                </option>
              ))}
            </Select>
            <Select label="Audience" value={audience} onChange={(event) => setAudience(event.target.value as AnnouncementAudience)}>
              {(Object.keys(AUDIENCE_LABEL) as AnnouncementAudience[]).map((key) => (
                <option key={key} value={key}>
                  {AUDIENCE_LABEL[key]}
                </option>
              ))}
            </Select>
          </div>
          <label className="grid gap-1.5 text-sm font-medium" htmlFor="announcement-body">
            Message
            <textarea
              id="announcement-body"
              rows={4}
              maxLength={5000}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              className="rounded-[var(--radius)] border bg-[hsl(var(--card))] px-3 py-2 font-normal shadow-sm focus:border-[hsl(var(--primary))]"
            />
          </label>

          <fieldset className="grid gap-3 rounded-[var(--radius)] border p-4">
            <legend className="px-1 text-sm font-semibold">Send to</legend>
            <div className="grid gap-4 md:grid-cols-3">
              <Select
                label="Department"
                value={departmentId}
                onChange={(event) => {
                  setDepartmentId(event.target.value);
                  setSemester('');
                  setSectionId('');
                }}
              >
                <option value="">All departments</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </Select>
              <Select
                label="Semester"
                value={semester}
                onChange={(event) => {
                  setSemester(event.target.value);
                  setSectionId('');
                }}
              >
                <option value="">All semesters</option>
                {semesters.map((number) => (
                  <option key={number} value={String(number)}>
                    Semester {number}
                  </option>
                ))}
              </Select>
              <Select label="Section" value={sectionId} onChange={(event) => setSectionId(event.target.value)} disabled={sectionChoices.length === 0}>
                <option value="">All sections</option>
                {sectionChoices.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.semester.course.code} · {section.semester.name} · {section.code}
                  </option>
                ))}
              </Select>
            </div>
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              {AUDIENCE_PEOPLE[audience]} in <span className="font-semibold text-[hsl(var(--foreground))]">{reach}</span> will see it{audience !== 'STUDENTS' ? '; Admins always see every announcement' : ''}.
            </p>
          </fieldset>

          <div className="grid gap-4 md:grid-cols-3">
            <Select label="Publish" value={timing} onChange={(event) => setTiming(event.target.value as 'now' | 'later')}>
              <option value="now">Now</option>
              <option value="later">At a set time</option>
            </Select>
            {timing === 'later' && <Input label="Publish at" type="datetime-local" value={publishAt} min={nowForInput()} onChange={(event) => setPublishAt(event.target.value)} required />}
            <Input label="Show until (optional)" type="date" value={expiresOn} onChange={(event) => setExpiresOn(event.target.value)} />
          </div>

          {error && (
            <p role="alert" className="text-sm text-[hsl(var(--destructive))]">
              {error}
            </p>
          )}
          <div>
            <Button type="submit" loading={saving}>
              {timing === 'later' ? 'Schedule' : 'Publish'}
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
  const [category, setCategory] = useState<AnnouncementCategory | ''>('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
  }, [load]);

  const pageCount = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const filtered = Boolean(query || category);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Announcements</h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          {isAdmin ? 'Every notice in the college, newest first.' : 'Notices for you: college-wide, and for your department, semester or section. Newest first.'}
        </p>
      </div>

      {isAdmin && (
        <NewAnnouncementForm
          onCreated={(message) => {
            setNotice(message);
            setPage(1);
            void load();
          }}
        />
      )}
      {notice && (
        <p role="status" className="rounded-[var(--radius)] border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100">
          {notice}
        </p>
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
          {data.items.map((item) => {
            const target = describeTarget(item);
            return (
              <Card key={item.id}>
                <CardContent className="grid gap-2 pt-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h2 className="text-lg font-semibold">{item.title}</h2>
                    <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
                      <span className="rounded-full border border-[hsl(var(--primary))]/30 bg-[hsl(var(--sidebar-active))] px-2.5 py-0.5 text-[hsl(var(--sidebar-active-foreground))]">{CATEGORY_LABEL[item.category]}</span>
                      <span className="rounded-full bg-[hsl(var(--muted))] px-2.5 py-0.5">{AUDIENCE_LABEL[item.audience]}</span>
                      <span className="rounded-full bg-[hsl(var(--muted))] px-2.5 py-0.5">{target ?? 'Whole college'}</span>
                    </div>
                  </div>
                  <p className="whitespace-pre-line text-sm leading-relaxed">{item.body}</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">
                    {formatDate(item.publishedAt)} · {item.author.displayName}
                    {item.expiresAt ? ` · Until ${formatDate(item.expiresAt)}` : ''}
                  </p>
                </CardContent>
              </Card>
            );
          })}
          {pageCount > 1 && <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />}
        </div>
      )}
    </div>
  );
}
