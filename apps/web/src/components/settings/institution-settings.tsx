'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { formatDateTime } from '@/components/announcements/announcement-form';
import { ErrorState, Skeleton } from '@/components/feedback/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/form-field';
import { ApiError } from '@/lib/api-client';
import {
  ATTENDANCE_THRESHOLD_RANGE,
  CORRECTION_WINDOW_RANGE,
  getInstitutionSettings,
  updateInstitutionSettings,
} from '@/lib/settings-api';
import type { InstitutionSettings, InstitutionSettingsInput } from '@/lib/settings-api';

/** Every field as typed, so numbers and blanks can be checked before saving. */
type Form = {
  name: string;
  timezone: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  attendanceThreshold: string;
  correctionWindowHours: string;
};
type Errors = Partial<Record<keyof Form, string>>;

const toForm = (settings: InstitutionSettings): Form => ({
  name: settings.name,
  timezone: settings.timezone,
  address: settings.address ?? '',
  phone: settings.phone ?? '',
  email: settings.email ?? '',
  website: settings.website ?? '',
  attendanceThreshold: String(settings.attendanceThreshold),
  correctionWindowHours: String(settings.correctionWindowHours),
});

const wholeIn = (value: string, range: { min: number; max: number }): boolean =>
  /^\d+$/.test(value.trim()) && Number(value) >= range.min && Number(value) <= range.max;

/** The same rules the API applies, so mistakes show next to the field instead of as one error after saving. */
function validate(form: Form): Errors {
  const errors: Errors = {};
  if (form.name.trim().length < 2) errors.name = 'Enter the college name.';
  const phone = form.phone.trim();
  if (phone && (!/^\+?[0-9 ()-]+$/.test(phone) || !/^\d{7,15}$/.test(phone.replace(/\D/g, ''))))
    errors.phone = 'Use 7 to 15 digits, with an optional + and spaces or hyphens.';
  if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
    errors.email = 'Enter an email address like office@college.edu.';
  if (form.website.trim() && !/^https?:\/\/[^\s/]+\.[^\s]+$/i.test(form.website.trim()))
    errors.website = 'Enter the full address, starting with https://';
  if (!wholeIn(form.attendanceThreshold, ATTENDANCE_THRESHOLD_RANGE))
    errors.attendanceThreshold = `Enter a whole number from ${ATTENDANCE_THRESHOLD_RANGE.min} to ${ATTENDANCE_THRESHOLD_RANGE.max}.`;
  if (!wholeIn(form.correctionWindowHours, CORRECTION_WINDOW_RANGE))
    errors.correctionWindowHours = `Enter a whole number of hours from ${CORRECTION_WINDOW_RANGE.min} to ${CORRECTION_WINDOW_RANGE.max} (30 days).`;
  return errors;
}

const toInput = (form: Form, updatedAt: string): InstitutionSettingsInput => ({
  name: form.name.trim(),
  timezone: form.timezone,
  address: form.address.trim() || null,
  phone: form.phone.trim() || null,
  email: form.email.trim() || null,
  website: form.website.trim() || null,
  attendanceThreshold: Number(form.attendanceThreshold),
  correctionWindowHours: Number(form.correctionWindowHours),
  updatedAt,
});

/** Timezones this browser knows, always including the saved one (browsers name some zones differently). */
function timezoneOptions(current: string): string[] {
  const known =
    typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  return [...new Set([current, ...known])].sort((a, b) => a.localeCompare(b));
}

/** Admin only: the college profile and the rules every report and dashboard uses. */
export function InstitutionSettingsPanel() {
  const [settings, setSettings] = useState<InstitutionSettings | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<{ message: string; stale: boolean } | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setLoadError(null);
    try {
      const next = await getInstitutionSettings();
      setSettings(next);
      setForm(toForm(next));
      setErrors({});
      setSaveError(null);
    } catch (reason) {
      setLoadError(reason instanceof Error ? reason.message : 'Settings could not be loaded.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const timezones = useMemo(() => (settings ? timezoneOptions(settings.timezone) : []), [settings]);

  if (loadError) return <ErrorState message={loadError} onRetry={() => void load()} />;
  if (!settings || !form) {
    return (
      <div className="grid gap-6" aria-busy="true">
        <Skeleton className="h-80" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  const dirty = JSON.stringify(form) !== JSON.stringify(toForm(settings));
  const set = (field: keyof Form) => (value: string) => {
    setForm({ ...form, [field]: value });
    setSaved(false);
    if (errors[field]) setErrors({ ...errors, [field]: undefined });
  };

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const found = validate(form);
    setErrors(found);
    setSaved(false);
    if (Object.values(found).some(Boolean)) return;
    setSaving(true);
    setSaveError(null);
    try {
      const next = await updateInstitutionSettings(toInput(form, settings.updatedAt));
      setSettings(next);
      setForm(toForm(next));
      setSaved(true);
    } catch (reason) {
      const stale = reason instanceof ApiError && reason.status === 409;
      setSaveError({
        message: reason instanceof Error ? reason.message : 'The settings could not be saved.',
        stale,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="grid grid-cols-1 gap-6" onSubmit={(event) => void submit(event)} noValidate>
      <Card>
        <CardHeader>
          <CardTitle>College profile</CardTitle>
          <CardDescription>
            How the college is named and reached. The timezone decides what “today” means in
            attendance and dashboards.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-1.5 text-sm">
            <span className="font-medium">College code</span>
            <p className="flex min-h-10 items-center rounded-[var(--radius)] border bg-[hsl(var(--muted))] px-3 font-mono">
              {settings.code}
            </p>
            <span className="text-[hsl(var(--muted-foreground))]">
              Everyone signs in with this code, so it can’t be changed here.
            </span>
          </div>
          <Input
            label="College name"
            value={form.name}
            onChange={(event) => set('name')(event.target.value)}
            maxLength={120}
            error={errors.name}
            required
          />
          <label
            className="grid gap-1.5 text-sm font-medium md:col-span-2"
            htmlFor="college-address"
          >
            Address
            <textarea
              id="college-address"
              rows={2}
              maxLength={300}
              value={form.address}
              onChange={(event) => set('address')(event.target.value)}
              className="rounded-[var(--radius)] border bg-[hsl(var(--card))] px-3 py-2 font-normal shadow-sm focus:border-[hsl(var(--primary))]"
            />
          </label>
          <Input
            label="Phone"
            type="tel"
            autoComplete="off"
            value={form.phone}
            onChange={(event) => set('phone')(event.target.value)}
            maxLength={25}
            placeholder="+91 80 1234 5678"
            error={errors.phone}
          />
          <Input
            label="Email"
            type="email"
            autoComplete="off"
            value={form.email}
            onChange={(event) => set('email')(event.target.value)}
            maxLength={254}
            placeholder="office@college.edu"
            error={errors.email}
          />
          <Input
            label="Website"
            type="url"
            value={form.website}
            onChange={(event) => set('website')(event.target.value)}
            maxLength={200}
            placeholder="https://college.edu"
            error={errors.website}
          />
          <Select
            label="Timezone"
            value={form.timezone}
            onChange={(event) => set('timezone')(event.target.value)}
            required
          >
            {timezones.map((zone) => (
              <option key={zone} value={zone}>
                {zone.replace(/_/g, ' ')}
              </option>
            ))}
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Attendance rules</CardTitle>
          <CardDescription>
            Changes apply at once to every attendance page, report and dashboard, including sessions
            already marked.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Input
            label="Minimum attendance (%)"
            type="number"
            inputMode="numeric"
            min={ATTENDANCE_THRESHOLD_RANGE.min}
            max={ATTENDANCE_THRESHOLD_RANGE.max}
            step={1}
            value={form.attendanceThreshold}
            onChange={(event) => set('attendanceThreshold')(event.target.value)}
            description="Students under this in a subject are shown as short of attendance."
            error={errors.attendanceThreshold}
            required
          />
          <Input
            label="Correction window (hours)"
            type="number"
            inputMode="numeric"
            min={CORRECTION_WINDOW_RANGE.min}
            max={CORRECTION_WINDOW_RANGE.max}
            step={1}
            value={form.correctionWindowHours}
            onChange={(event) => set('correctionWindowHours')(event.target.value)}
            description="How long faculty can correct a session after marking it. After that, the HOD corrects it."
            error={errors.correctionWindowHours}
            required
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Set up elsewhere</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          <Link
            href="/dashboard/departments"
            className="font-semibold text-[hsl(var(--primary))] underline underline-offset-4"
          >
            Departments and HODs →
          </Link>
          <Link
            href="/dashboard/fees/structures"
            className="font-semibold text-[hsl(var(--primary))] underline underline-offset-4"
          >
            Fee structures →
          </Link>
        </CardContent>
      </Card>

      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-3 rounded-[var(--radius)] border bg-[hsl(var(--card))] px-4 py-3 shadow-lg">
        <Button type="submit" loading={saving} disabled={!dirty}>
          Save changes
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!dirty || saving}
          onClick={() => {
            setForm(toForm(settings));
            setErrors({});
            setSaveError(null);
          }}
        >
          Discard
        </Button>
        <p className="text-sm text-[hsl(var(--muted-foreground))]" role="status">
          {saved
            ? 'Saved. The change is in the audit log.'
            : dirty
              ? 'You have unsaved changes.'
              : settings.lastChange
                ? `Last changed ${settings.lastChange.by ? `by ${settings.lastChange.by} ` : ''}on ${formatDateTime(settings.lastChange.at)}.`
                : 'Not changed since the college was set up.'}
        </p>
        {saveError && (
          <div
            role="alert"
            className="flex w-full flex-wrap items-center gap-3 text-sm text-[hsl(var(--destructive))]"
          >
            <span>{saveError.message}</span>
            {saveError.stale && (
              <Button type="button" variant="outline" onClick={() => void load()}>
                Reload settings
              </Button>
            )}
          </div>
        )}
      </div>
    </form>
  );
}
