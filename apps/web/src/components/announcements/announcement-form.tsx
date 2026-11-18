'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/form-field';
import { AUDIENCE_LABEL, CATEGORY_LABEL, createAnnouncement, updateAnnouncement } from '@/lib/announcements-api';
import type { AnnouncementAudience, AnnouncementCategory, ManagedAnnouncement } from '@/lib/announcements-api';
import { listDepartments } from '@/lib/faculty-api';
import type { Department } from '@/lib/faculty-api';
import { listSections } from '@/lib/student-api';
import type { SectionOption } from '@/lib/student-api';

const CATEGORIES = Object.keys(CATEGORY_LABEL) as AnnouncementCategory[];
const AUDIENCE_PEOPLE: Record<AnnouncementAudience, string> = { ALL: 'Students and staff', STUDENTS: 'Students', FACULTY: 'Faculty and HODs', STAFF: 'Faculty, HODs and Admins' };

export const formatDateTime = (value: string): string =>
  new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
/** A time as a local datetime-local value. */
const forInput = (date: Date): string => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
/** A local date (YYYY-MM-DD) for a date input. */
const localDay = (value: string): string => new Date(value).toLocaleDateString('en-CA');

/**
 * Admin's announcement form, for a new announcement or, given `editing`, an existing one. A published announcement keeps
 * its publish time; a scheduled one can be moved or published now.
 */
export function AnnouncementForm({ editing, onSaved, onCancel }: { editing?: ManagedAnnouncement; onSaved(message: string): void; onCancel?(): void }) {
  const scheduled = editing ? editing.notifiedAt === null : true;
  const [title, setTitle] = useState(editing?.title ?? '');
  const [body, setBody] = useState(editing?.body ?? '');
  const [audience, setAudience] = useState<AnnouncementAudience>(editing?.audience ?? 'ALL');
  const [category, setCategory] = useState<AnnouncementCategory>(editing?.category ?? 'GENERAL');
  const [departmentId, setDepartmentId] = useState(editing?.departmentId ?? '');
  const [semester, setSemester] = useState(editing?.semesterNumber ? String(editing.semesterNumber) : '');
  const [sectionId, setSectionId] = useState(editing?.sectionId ?? '');
  const [timing, setTiming] = useState<'now' | 'later'>(editing && scheduled ? 'later' : 'now');
  const [publishAt, setPublishAt] = useState(editing && scheduled ? forInput(new Date(editing.publishedAt)) : '');
  const [expiresOn, setExpiresOn] = useState(editing?.expiresAt ? localDay(editing.expiresAt) : '');
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
    if (scheduled && timing === 'later' && !publishAt) return setError('Choose when to publish it.');
    setSaving(true);
    setError(null);
    const fields = {
      title,
      body,
      audience,
      category,
      ...(departmentId ? { departmentId } : {}),
      ...(semester ? { semesterNumber: Number(semester) } : {}),
      ...(sectionId ? { sectionId } : {}),
    };
    // Only a scheduled announcement's publish time can be set; "now" publishes it straight away.
    const publishedAt = scheduled ? (timing === 'later' ? new Date(publishAt).toISOString() : editing ? new Date().toISOString() : undefined) : undefined;
    const expiresAt = expiresOn ? new Date(`${expiresOn}T23:59:59`).toISOString() : null;
    try {
      const saved = editing
        ? await updateAnnouncement(editing.id, { ...fields, ...(publishedAt ? { publishedAt } : {}), expiresAt })
        : await createAnnouncement({ ...fields, ...(publishedAt ? { publishedAt } : {}), ...(expiresAt ? { expiresAt } : {}) });
      const later = new Date(saved.publishedAt) > new Date();
      if (!editing) {
        setTitle('');
        setBody('');
        setExpiresOn('');
        setPublishAt('');
        setTiming('now');
      }
      onSaved(
        editing
          ? later
            ? `Saved. It will be published ${formatDateTime(saved.publishedAt)}.`
            : scheduled
              ? 'Saved and published now.'
              : 'Saved. It was already published, so nobody is notified again.'
          : later
            ? `Scheduled for ${formatDateTime(saved.publishedAt)}. It will be sent then.`
            : 'Published and sent.',
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The announcement could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{editing ? 'Edit announcement' : 'New announcement'}</CardTitle>
        <CardDescription>
          {editing ? `By ${editing.author.displayName}.` : 'Send it to the whole college or to one department, semester or section, now or at a set time.'}
        </CardDescription>
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
          <label className="grid gap-1.5 text-sm font-medium" htmlFor={editing ? `announcement-body-${editing.id}` : 'announcement-body'}>
            Message
            <textarea
              id={editing ? `announcement-body-${editing.id}` : 'announcement-body'}
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
              {AUDIENCE_PEOPLE[audience]} in <span className="font-semibold text-[hsl(var(--foreground))]">{reach}</span> will see it
              {audience !== 'STUDENTS' ? '; Admins always see every announcement' : ''}.
              {editing && !scheduled ? ' It was already sent, so people added by a change here see it but aren’t notified.' : ''}
            </p>
          </fieldset>

          <div className="grid gap-4 md:grid-cols-3">
            {scheduled ? (
              <>
                <Select label="Publish" value={timing} onChange={(event) => setTiming(event.target.value as 'now' | 'later')}>
                  <option value="now">Now</option>
                  <option value="later">At a set time</option>
                </Select>
                {timing === 'later' && <Input label="Publish at" type="datetime-local" value={publishAt} min={forInput(new Date())} onChange={(event) => setPublishAt(event.target.value)} required />}
              </>
            ) : (
              <div className="grid gap-1.5 text-sm">
                <span className="font-medium">Published</span>
                <span className="flex min-h-10 items-center text-[hsl(var(--muted-foreground))]">{editing ? formatDateTime(editing.publishedAt) : ''}</span>
              </div>
            )}
            <Input label="Show until (optional)" type="date" value={expiresOn} onChange={(event) => setExpiresOn(event.target.value)} />
          </div>

          {error && (
            <p role="alert" className="text-sm text-[hsl(var(--destructive))]">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={saving}>
              {editing ? 'Save changes' : timing === 'later' ? 'Schedule' : 'Publish'}
            </Button>
            {onCancel && (
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
