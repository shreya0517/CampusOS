'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { login } from '@/lib/api-client';
import { getMyStudent } from '@/lib/student-api';
import { useAuth, getPrimaryRole } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/form-field';

const ROLE_PRESETS = [
  {
    role: 'Admin',
    description: 'College administrator with full management access.',
    email: 'admin@campusos.local',
    color: 'border-purple-500 bg-purple-50 dark:bg-purple-950/30',
    activeColor: 'border-purple-600 bg-purple-100 dark:bg-purple-900/50 ring-2 ring-purple-500',
  },
  {
    role: 'HOD',
    description: 'Head of Department with departmental oversight.',
    email: 'hod@campusos.local',
    color: 'border-amber-500 bg-amber-50 dark:bg-amber-950/30',
    activeColor: 'border-amber-600 bg-amber-100 dark:bg-amber-900/50 ring-2 ring-amber-500',
  },
  {
    role: 'Faculty',
    description: 'Faculty member managing courses and attendance.',
    email: 'faculty@campusos.local',
    color: 'border-blue-500 bg-blue-50 dark:bg-blue-950/30',
    activeColor: 'border-blue-600 bg-blue-100 dark:bg-blue-900/50 ring-2 ring-blue-500',
  },
  {
    role: 'Student',
    description: 'Student enrolled in courses and sections.',
    email: 'student@campusos.local',
    color: 'border-green-500 bg-green-50 dark:bg-green-950/30',
    activeColor: 'border-green-600 bg-green-100 dark:bg-green-900/50 ring-2 ring-green-500',
  },
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
      if (role === 'Student') {
        router.replace('/dashboard/student');
      } else {
        router.replace('/dashboard');
      }
    }
  }, [user, authLoading, router]);

  const handlePreset = (preset: (typeof ROLE_PRESETS)[number]) => {
    setSelectedPreset(preset.role);
    const form = document.getElementById('login-form') as HTMLFormElement | null;
    if (!form) return;
    const collegeCode = form.elements.namedItem('collegeCode') as HTMLInputElement;
    const email = form.elements.namedItem('email') as HTMLInputElement;
    if (collegeCode) collegeCode.value = 'DEMO';
    if (email) email.value = preset.email;
    setError(null);
  };

  if (authLoading || user) {
    return null;
  }


  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
        Use your CampusOS college account to continue.
      </p>

      <div className="mt-6">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[hsl(var(--muted-foreground))]">
          Quick access — select your role
        </p>
        <div className="grid grid-cols-2 gap-2">
          {ROLE_PRESETS.map((preset) => (
            <button
              key={preset.role}
              type="button"
              onClick={() => handlePreset(preset)}
              className={`rounded-lg border p-3 text-left transition-all ${
                selectedPreset === preset.role ? preset.activeColor : `${preset.color} hover:brightness-95`
              }`}
            >
              <span className="block text-sm font-bold">{preset.role}</span>
              <span className="mt-0.5 block text-xs text-[hsl(var(--muted-foreground))]">{preset.description}</span>
            </button>
          ))}
        </div>
      </div>

      <form
        id="login-form"
        className="mt-6 grid gap-4"
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
            } else if (role === 'Faculty' || role === 'HOD') {
              router.replace('/dashboard');
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
        <Input label="College code" name="collegeCode" required autoComplete="organization" />
        <Input label="Email" name="email" type="email" required autoComplete="email" />
        <Input label="Password" name="password" type="password" required autoComplete="current-password" />
        <Button type="submit" loading={loading}>
          Sign in
        </Button>
        {error && (
          <p role="alert" className="text-sm text-[hsl(var(--destructive))]">
            {error}
          </p>
        )}
      </form>
    </div>
  );
}