'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/form-field';
import { registerVisitor } from '@/lib/visitors-api';

export default function NewVisitorPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    purpose: '',
    visitDate: '',
  });
  const [errors, setErrors] = useState<Partial<typeof form>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const validate = () => {
    const e: Partial<typeof form> = {};
    if (!form.name.trim()) e.name = 'Name is required.';
    if (!form.phone.trim()) e.phone = 'Phone is required.';
    if (!form.purpose.trim()) e.purpose = 'Purpose is required.';
    if (!form.visitDate) e.visitDate = 'Visit date is required.';
    return e;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSubmitting(true);
    setServerError(null);
    try {
      await registerVisitor({
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        purpose: form.purpose.trim(),
        visitDate: new Date(form.visitDate).toISOString(),
      });
      router.push('/dashboard/visitors');
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Failed to register visitor.');
      setSubmitting(false);
    }
  };

  return (
    <div className="grid gap-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[.16em] text-[hsl(var(--primary))]">Visitors</p>
        <h1 className="mt-2 text-3xl font-semibold">Register Visitor</h1>
        <p className="mt-2 text-[hsl(var(--muted-foreground))]">
          Register a campus visitor. The request will be reviewed by admin.
        </p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Visitor Details</CardTitle>
          <CardDescription>Enter the visitor's information and planned visit date.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
            <Input
              label="Full Name"
              required
              value={form.name}
              onChange={set('name')}
              error={errors.name}
              placeholder="Visitor's full name"
            />
            <Input
              label="Phone Number"
              required
              type="tel"
              value={form.phone}
              onChange={set('phone')}
              error={errors.phone}
              placeholder="+91 9876543210"
            />
            <Input
              label="Email (optional)"
              type="email"
              value={form.email}
              onChange={set('email')}
              placeholder="visitor@example.com"
            />
            <div className="grid gap-1">
              <label className="text-sm font-medium">
                Purpose of Visit <span className="text-[hsl(var(--destructive))]">*</span>
              </label>
              <textarea
                className="min-h-20 w-full rounded-[var(--radius)] border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                placeholder="Reason for the campus visit…"
                value={form.purpose}
                onChange={set('purpose')}
              />
              {errors.purpose && (
                <p className="text-xs text-[hsl(var(--destructive))]">{errors.purpose}</p>
              )}
            </div>
            <Input
              label="Visit Date"
              type="date"
              required
              value={form.visitDate}
              onChange={set('visitDate')}
              error={errors.visitDate}
            />
            {serverError && (
              <p className="rounded-[var(--radius)] bg-[hsl(var(--destructive))]/10 px-3 py-2 text-sm text-[hsl(var(--destructive))]">
                {serverError}
              </p>
            )}
            <div className="flex gap-3">
              <Button type="submit" loading={submitting}>Register Visitor</Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
