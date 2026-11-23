'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { getPasswordResetOptions, requestPasswordReset } from '@/lib/api-client';
import { AuthShell } from '@/components/auth/auth-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/form-field';

type Delivery = 'email' | 'admin';

const INTRO: Record<Delivery, string> = {
  email: "Enter your college code and the email you sign in with. We'll email you a link to choose a new password.",
  admin: "Enter your college code and the email you sign in with. Your college admin will be told, and they'll give you a temporary password.",
};

function ForgotPasswordForm() {
  const params = useSearchParams();
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getPasswordResetOptions()
      .then((options) => setDelivery(options.delivery))
      .catch(() => setDelivery('admin'));
  }, []);

  if (sentTo) {
    return (
      <div role="status">
        <h2 className="text-2xl font-bold tracking-tight">{delivery === 'email' ? 'Check your email' : 'Request sent'}</h2>
        {delivery === 'email' ? (
          <p className="mt-3 text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
            If an account exists for <span className="font-medium text-[hsl(var(--foreground))]">{sentTo}</span>, we&apos;ve sent it a link to reset
            the password. The link works for one hour. Nothing there after a few minutes? Check your spam folder, or ask again.
          </p>
        ) : (
          <p className="mt-3 text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
            If an account exists for <span className="font-medium text-[hsl(var(--foreground))]">{sentTo}</span>, your college admin has been told.
            They&apos;ll give you a temporary password. Sign in with it, then choose your own under Settings.
          </p>
        )}
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/login">
            <Button className="min-h-11">Back to sign in</Button>
          </Link>
          <Button variant="outline" className="min-h-11" onClick={() => setSentTo(null)}>
            Use a different email
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <h2 className="text-2xl font-bold tracking-tight">Forgot your password?</h2>
      <p className="mt-1.5 min-h-10 text-sm text-[hsl(var(--muted-foreground))]">{delivery ? INTRO[delivery] : 'Enter your college code and the email you sign in with.'}</p>

      <form
        className="mt-8 grid gap-5"
        onSubmit={async (event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const email = String(data.get('email')).trim();
          setLoading(true);
          setError(null);
          try {
            await requestPasswordReset({ collegeCode: String(data.get('collegeCode')).trim(), email });
            setSentTo(email);
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'The request could not be sent. Try again.');
          } finally {
            setLoading(false);
          }
        }}
      >
        <Input label="College code" name="collegeCode" required autoComplete="organization" placeholder="e.g. DEMO" defaultValue={params.get('college') ?? ''} />
        <Input label="Email address" name="email" type="email" required autoComplete="email" placeholder="you@college.edu" defaultValue={params.get('email') ?? ''} />
        {error && (
          <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
            {error}
          </p>
        )}
        <Button type="submit" loading={loading} className="min-h-11 w-full">
          {delivery === 'admin' ? 'Ask for a new password' : 'Send reset link'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-[hsl(var(--muted-foreground))]">
        Remembered it?{' '}
        <Link href="/login" className="font-medium text-[hsl(var(--primary))] underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      </p>
    </>
  );
}

export default function ForgotPasswordPage() {
  return (
    <AuthShell>
      <Suspense fallback={null}>
        <ForgotPasswordForm />
      </Suspense>
    </AuthShell>
  );
}
