'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ApiError, resetPassword } from '@/lib/api-client';
import { AuthShell } from '@/components/auth/auth-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/form-field';

/** Same rule as the API: at least 12 characters. */
const MIN_LENGTH = 12;

function LinkProblem({ title, message }: { title: string; message: string }) {
  return (
    <div role="alert">
      <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
      <p className="mt-3 text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">{message}</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/forgot-password">
          <Button className="min-h-11">Ask for a new link</Button>
        </Link>
        <Link href="/login">
          <Button variant="outline" className="min-h-11">Back to sign in</Button>
        </Link>
      </div>
    </div>
  );
}

function ResetPasswordForm() {
  const token = useSearchParams().get('token') ?? '';
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!token) {
    return <LinkProblem title="This link is incomplete" message="Open the link from your email again, making sure the whole address was copied, or ask for a new one." />;
  }
  if (expired) {
    return <LinkProblem title="This link has expired" message="Reset links work for one hour, and only once. Ask for a new one and use it straight away." />;
  }
  if (done) {
    return (
      <div role="status">
        <h2 className="text-2xl font-bold tracking-tight">Password changed</h2>
        <p className="mt-3 text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
          Your new password is set, and you&apos;ve been signed out on every other device. Sign in with the new password.
        </p>
        <Link href="/login" className="mt-8 inline-block">
          <Button className="min-h-11">Sign in</Button>
        </Link>
      </div>
    );
  }

  return (
    <>
      <h2 className="text-2xl font-bold tracking-tight">Choose a new password</h2>
      <p className="mt-1.5 text-sm text-[hsl(var(--muted-foreground))]">Use at least {MIN_LENGTH} characters. A short sentence is easy to remember and hard to guess.</p>

      <form
        className="mt-8 grid gap-5"
        noValidate
        onSubmit={async (event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const password = String(data.get('password'));
          const confirm = String(data.get('confirm'));
          const found: typeof errors = {};
          if (password.length < MIN_LENGTH) found.password = `Use at least ${MIN_LENGTH} characters.`;
          if (confirm !== password) found.confirm = "The two passwords don't match.";
          setErrors(found);
          setError(null);
          if (Object.keys(found).length) return;
          setLoading(true);
          try {
            await resetPassword({ token, password });
            setDone(true);
          } catch (reason) {
            // A used or expired link is a 400; anything else is worth retrying.
            if (reason instanceof ApiError && reason.status === 400) setExpired(true);
            else setError(reason instanceof Error ? reason.message : 'The password could not be changed. Try again.');
          } finally {
            setLoading(false);
          }
        }}
      >
        <Input label="New password" name="password" type="password" required autoComplete="new-password" minLength={MIN_LENGTH} error={errors.password} />
        <Input label="Confirm new password" name="confirm" type="password" required autoComplete="new-password" error={errors.confirm} />
        {error && (
          <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
            {error}
          </p>
        )}
        <Button type="submit" loading={loading} className="min-h-11 w-full">
          Set new password
        </Button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthShell>
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
    </AuthShell>
  );
}
