'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

/** Shows a newly issued temporary password. It is never shown again, so the Admin is asked to hand it over now. */
export function TemporaryPasswordNotice({ email, password }: { email: string; password: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div role="status" className="rounded-[var(--radius)] border border-emerald-300 bg-emerald-50 p-4 text-sm dark:border-emerald-800 dark:bg-emerald-950/40">
      <p className="font-semibold text-emerald-900 dark:text-emerald-200">Sign-in account created</p>
      <p className="mt-1 text-emerald-900/80 dark:text-emerald-200/80">
        Share these details with the faculty member. They sign in with this temporary password and should change it under Settings. It won&apos;t be shown again.
      </p>
      <dl className="mt-3 grid gap-2 sm:grid-cols-[auto_1fr] sm:gap-x-4">
        <dt className="font-medium text-emerald-900/70 dark:text-emerald-200/70">Email</dt>
        <dd className="font-mono">{email}</dd>
        <dt className="font-medium text-emerald-900/70 dark:text-emerald-200/70">Temporary password</dt>
        <dd className="flex flex-wrap items-center gap-3">
          <code className="rounded bg-white px-2 py-1 font-mono text-base dark:bg-black/30">{password}</code>
          <Button
            type="button"
            variant="outline"
            className="min-h-8 px-3 text-xs"
            onClick={() => {
              void navigator.clipboard
                .writeText(password)
                .then(() => setCopied(true))
                .catch(() => setCopied(false));
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </dd>
      </dl>
    </div>
  );
}
