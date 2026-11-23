'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { login } from '@/lib/api-client';
import { getMyStudent } from '@/lib/student-api';
import { useAuth, getPrimaryRole } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/form-field';
import { AuthShell } from '@/components/auth/auth-shell';

const ROLE_PRESETS = [
  { role: 'Admin', description: 'College administration', email: 'admin@campusos.local' },
  { role: 'HOD', description: 'Department oversight', email: 'hod@campusos.local' },
  { role: 'Faculty', description: 'Classes and evaluation', email: 'faculty@campusos.local' },
  { role: 'Student', description: 'Academics and fees', email: 'student@campusos.local' },
] as const;

export default function LoginPage() {
  const router = useRouter();
  const { user, loading: authLoading, setUser } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && user) {
      const role = getPrimaryRole(user.roles);
      router.replace(role === 'Student' ? '/dashboard/student' : '/dashboard');
    }
  }, [user, authLoading, router]);

  const handlePreset = (preset: (typeof ROLE_PRESETS)[number]) => {
    setSelectedPreset(preset.role);
    const form = document.getElementById('login-form') as HTMLFormElement | null;
    if (!form) return;
    const collegeCode = form.elements.namedItem('collegeCode') as HTMLInputElement | null;
    const email = form.elements.namedItem('email') as HTMLInputElement | null;
    const password = form.elements.namedItem('password') as HTMLInputElement | null;
    if (collegeCode) collegeCode.value = 'DEMO';
    if (email) email.value = preset.email;
    password?.focus();
    setError(null);
  };

  if (authLoading || user) {
    return null;
  }

  return (
    <AuthShell>
      <h2 className="text-2xl font-bold tracking-tight">Sign in to your portal</h2>
      <p className="mt-1.5 text-sm text-[hsl(var(--muted-foreground))]">Use the account issued by your college.</p>

      <form
        id="login-form"
        className="mt-8 grid gap-5"
        onSubmit={async (event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          setLoading(true);
          setError(null);
          try {
            const result = await login({
              collegeCode: String(data.get('collegeCode')),
              email: String(data.get('email')),
              password: String(data.get('password')),
            });
            setUser(result.user);
            const role = getPrimaryRole(result.user.roles);
            if (role === 'Student') {
              try {
                await getMyStudent();
                router.replace('/dashboard/student');
              } catch {
                router.replace('/dashboard');
              }
            } else {
              router.replace('/dashboard');
            }
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'Sign in failed.');
          } finally {
            setLoading(false);
          }
        }}
      >
        <Input label="College code" name="collegeCode" required autoComplete="organization" placeholder="e.g. DEMO" />
        <Input label="Email address" name="email" type="email" required autoComplete="email" placeholder="you@college.edu" />
        <div className="grid gap-1.5">
          <Input label="Password" name="password" type="password" required autoComplete="current-password" />
          <Link
            href="/forgot-password"
            className="justify-self-end text-sm font-medium text-[hsl(var(--primary))] underline-offset-4 hover:underline"
            onClick={(event) => {
              // Carry over what was already typed, so it needn't be entered twice.
              const form = document.getElementById('login-form') as HTMLFormElement | null;
              const value = (name: string) => (form?.elements.namedItem(name) as HTMLInputElement | null)?.value.trim() ?? '';
              const query = new URLSearchParams(Object.entries({ college: value('collegeCode'), email: value('email') }).filter(([, v]) => v)).toString();
              if (query) {
                event.preventDefault();
                router.push(`/forgot-password?${query}`);
              }
            }}
          >
            Forgot password?
          </Link>
        </div>
        {error && (
          <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
            {error}
          </p>
        )}
        <Button type="submit" loading={loading} className="min-h-11 w-full">
          Sign in
        </Button>
      </form>

      <div className="mt-10">
        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-[hsl(var(--border))]" aria-hidden="true" />
          <p className="text-xs font-semibold uppercase tracking-[.08em] text-[hsl(var(--muted-foreground))]">Demo accounts</p>
          <span className="h-px flex-1 bg-[hsl(var(--border))]" aria-hidden="true" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {ROLE_PRESETS.map((preset) => {
            const selected = selectedPreset === preset.role;
            return (
              <button
                key={preset.role}
                type="button"
                onClick={() => handlePreset(preset)}
                aria-pressed={selected}
                className={`rounded-md border px-3 py-2.5 text-left transition-colors ${
                  selected
                    ? 'border-[hsl(var(--primary))] bg-[hsl(var(--sidebar-active))]'
                    : 'hover:border-[hsl(var(--primary))]/40 hover:bg-[hsl(var(--muted))]'
                }`}
              >
                <span className={`block text-sm font-semibold ${selected ? 'text-[hsl(var(--sidebar-active-foreground))]' : ''}`}>{preset.role}</span>
                <span className="block text-xs text-[hsl(var(--muted-foreground))]">{preset.description}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-[hsl(var(--muted-foreground))]">Picking an account fills in the college code and email; enter the password to continue.</p>
      </div>
    </AuthShell>
  );
}
