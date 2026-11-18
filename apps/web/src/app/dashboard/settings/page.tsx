'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useContext, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '@/components/auth-provider';
import { ThemeContext } from '@/components/theme-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/form-field';
import { InstitutionSettingsPanel } from '@/components/settings/institution-settings';
import { changePassword } from '@/lib/api-client';

const MIN_PASSWORD_LENGTH = 12;

export default function SettingsPage() {
  const { user, primaryRole, logout } = useAuth();
  const { theme, toggleTheme } = useContext(ThemeContext);
  const router = useRouter();
  // Institution settings are an ADMIN-only API, so the tab follows that role exactly.
  const isAdmin = user?.roles?.includes('ADMIN') ?? false;
  const [tab, setTab] = useState<'account' | 'institution'>('account');
  const showInstitution = isAdmin && tab === 'institution';
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setDone(false);
    if (newPassword.length < MIN_PASSWORD_LENGTH) return setError(`Your new password needs at least ${MIN_PASSWORD_LENGTH} characters.`);
    if (newPassword !== confirmPassword) return setError('The two new passwords don’t match.');
    if (newPassword === currentPassword) return setError('Choose a password that is different from your current one.');
    setSaving(true);
    setError(null);
    try {
      await changePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setDone(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Your password could not be changed.');
    } finally {
      setSaving(false);
    }
  };

  const signOut = async (): Promise<void> => {
    await logout();
    router.replace('/login');
  };

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            {showInstitution ? 'The college profile and the rules every report and dashboard uses.' : 'Manage your password, appearance and session.'}
          </p>
        </div>
        {isAdmin && (
          <div className="inline-flex rounded-[var(--radius)] border bg-[hsl(var(--card))] p-1" role="tablist" aria-label="Settings section">
            {(
              [
                ['account', 'My account'],
                ['institution', 'Institution'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={`rounded-md px-4 py-1.5 text-sm font-semibold transition-colors ${tab === key ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]' : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {showInstitution && <InstitutionSettingsPanel />}

      {/* Hidden rather than unmounted, so a half-typed password survives switching tabs. */}
      <div className={`grid gap-6 lg:grid-cols-[2fr_1fr] ${showInstitution ? 'hidden' : ''}`}>
        <Card>
          <CardHeader>
            <CardTitle>Change password</CardTitle>
            <CardDescription>After the change, you stay signed in here and are signed out on every other device.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid max-w-md gap-4" onSubmit={(event) => void submit(event)} noValidate>
              <Input
                label="Current password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
              />
              <Input
                label="New password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                description={`At least ${MIN_PASSWORD_LENGTH} characters.`}
                required
              />
              <Input
                label="Confirm new password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
              />
              {error && (
                <p role="alert" className="text-sm text-[hsl(var(--destructive))]">
                  {error}
                </p>
              )}
              {done && (
                <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">
                  Password changed. Other devices have been signed out.
                </p>
              )}
              <div>
                <Button type="submit" loading={saving} disabled={!currentPassword || !newPassword || !confirmPassword}>
                  Change password
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Appearance</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-between gap-3">
              <p className="text-sm">{theme === 'dark' ? 'Dark theme' : 'Light theme'}</p>
              <Button variant="outline" onClick={toggleTheme}>
                Switch to {theme === 'dark' ? 'light' : 'dark'}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Account</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <p>
                Signed in as <strong>{user?.email}</strong>
              </p>
              {primaryRole === 'Student' && (
                <Link href="/dashboard/student/profile" className="font-semibold text-[hsl(var(--primary))] underline underline-offset-4">
                  Update your phone and address on My Profile →
                </Link>
              )}
              <div>
                <Button variant="outline" onClick={() => void signOut()}>
                  Sign out
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
