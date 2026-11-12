'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ThemeContext } from '@/components/theme-provider';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import {
  getDefaultDashboardRoute,
  isRouteAllowedForRole,
  NavIcon,
  resolveCanonicalRole,
  ROLE_NAVIGATION,
} from '@/lib/navigation';

const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN: 'bg-red-600 text-white',
  'Super Admin': 'bg-red-600 text-white',
  ADMIN: 'bg-purple-600 text-white',
  Admin: 'bg-purple-600 text-white',
  HOD: 'bg-amber-600 text-white',
  FACULTY: 'bg-blue-600 text-white',
  Faculty: 'bg-blue-600 text-white',
  STUDENT: 'bg-green-600 text-white',
  Student: 'bg-green-600 text-white',
  User: 'bg-gray-500 text-white',
};

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const { theme, toggleTheme } = useContext(ThemeContext);
  const { user, loading, primaryRole, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [loading, user, router]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, []);

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  if (loading || !user) {
    return null;
  }

  const canonicalRole = resolveCanonicalRole(user.roles, primaryRole);
  const visibleNavigation = ROLE_NAVIGATION[canonicalRole] ?? ROLE_NAVIGATION.STUDENT;
  const defaultRoute = getDefaultDashboardRoute(canonicalRole);
  const isAuthorized = isRouteAllowedForRole(pathname, canonicalRole);

  const activeNav = visibleNavigation.find((item) => {
    if (item.exact) return pathname === item.href;
    return pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
  });

  const pageTitle = activeNav?.label ?? (pathname === '/foundation' ? 'Foundation' : 'Dashboard');

  return (
    <div
      className={`min-h-screen lg:grid ${
        collapsed ? 'lg:grid-cols-[5rem_1fr]' : 'lg:grid-cols-[15rem_1fr]'
      } transition-[grid-template-columns] duration-200`}
    >
      {/* ─── Sidebar Aside ──────────────────────────────────────────────── */}
      <aside
        className={`${
          open ? 'translate-x-0' : '-translate-x-full'
        } fixed inset-y-0 left-0 z-20 ${
          collapsed ? 'lg:w-20' : 'lg:w-60'
        } w-60 bg-[hsl(var(--sidebar))] p-4 text-[hsl(var(--sidebar-foreground))] transition-all duration-200 lg:static lg:translate-x-0 flex flex-col justify-between`}
        aria-label="Primary navigation"
      >
        <div className="flex flex-col flex-1 min-h-0">
          {/* Logo / Brand Header */}
          <div className="mb-6 flex items-center justify-between">
            <Link
              href={defaultRoute}
              className="flex items-center gap-2.5 rounded focus:outline-none"
              onClick={() => setOpen(false)}
              title="CampusOS Workspace"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--primary))] text-white font-bold text-sm shadow">
                OS
              </div>
              <div className={`${collapsed ? 'lg:hidden' : ''} overflow-hidden whitespace-nowrap`}>
                <p className="text-[10px] font-semibold uppercase tracking-[.2em] opacity-65">CampusOS</p>
                <p className="text-base font-semibold leading-tight">Workspace</p>
              </div>
            </Link>
          </div>

          {/* Navigation Items */}
          <nav className="grid gap-1 flex-1 overflow-y-auto pr-0.5">
            {visibleNavigation.map((item) => {
              const isActive = item.exact
                ? pathname === item.href
                : pathname === item.href ||
                  (item.href !== '/dashboard' &&
                    (pathname.startsWith(item.href + '/') || pathname === item.href));

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={isActive ? 'page' : undefined}
                  title={collapsed ? item.label : undefined}
                  className={`flex items-center gap-3 rounded px-3 py-2 text-sm font-medium transition-colors ${
                    collapsed ? 'lg:justify-center lg:px-2' : ''
                  } ${
                    isActive
                      ? 'bg-white/15 text-white shadow-sm'
                      : 'text-[hsl(var(--sidebar-foreground))]/80 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <NavIcon name={item.icon} className="h-5 w-5 shrink-0" />
                  <span className={`${collapsed ? 'lg:hidden' : ''} truncate`}>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Desktop Collapse Toggle */}
        <div className="hidden lg:block pt-3 border-t border-white/10 mt-2">
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="flex w-full items-center gap-3 rounded px-2.5 py-1.5 text-xs font-medium text-[hsl(var(--sidebar-foreground))]/70 hover:bg-white/10 hover:text-white transition-colors"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg
              className={`h-4 w-4 shrink-0 transition-transform ${collapsed ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
            <span className={`${collapsed ? 'lg:hidden' : ''} truncate`}>
              {collapsed ? 'Expand' : 'Collapse'}
            </span>
          </button>
        </div>
      </aside>

      {/* ─── Mobile Drawer Backdrop ────────────────────────────────────────── */}
      {open && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-10 bg-black/40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* ─── Main Viewport Area ───────────────────────────────────────────── */}
      <div className="min-w-0 flex flex-col">
        <header className="flex min-h-16 items-center justify-between border-b bg-[hsl(var(--card))] px-4 lg:px-7 sticky top-0 z-10">
          <Button
            variant="ghost"
            className="lg:hidden"
            aria-label="Open navigation"
            onClick={() => setOpen(true)}
          >
            Menu
          </Button>

          <nav aria-label="Breadcrumb" className="text-sm text-[hsl(var(--muted-foreground))]">
            <Link href={defaultRoute} className="hover:text-[hsl(var(--foreground))] transition-colors">
              CampusOS
            </Link>
            <span aria-hidden="true"> / </span>
            <strong className="text-[hsl(var(--foreground))]">{pageTitle}</strong>
          </nav>

          <div className="flex items-center gap-3">
            {!loading && user ? (
              <>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${
                    ROLE_COLORS[canonicalRole] ?? ROLE_COLORS.User
                  }`}
                >
                  {canonicalRole.replace('_', ' ')}
                </span>
                <span
                  className="hidden text-sm font-medium text-[hsl(var(--foreground))] sm:inline"
                  title={user.email}
                >
                  {user.displayName}
                </span>
                <Button variant="outline" onClick={handleLogout}>
                  Sign out
                </Button>
              </>
            ) : !loading ? (
              <Link className="text-sm font-semibold text-[hsl(var(--primary))]" href="/login">
                Sign in
              </Link>
            ) : null}
            <Button
              variant="outline"
              aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
              onClick={toggleTheme}
            >
              {theme === 'light' ? 'Dark' : 'Light'}
            </Button>
          </div>
        </header>

        <main className="mx-auto max-w-6xl p-4 sm:p-7 flex-1 w-full">
          {isAuthorized ? (
            children
          ) : (
            <div className="grid place-items-center py-16">
              <div className="max-w-md w-full rounded-[var(--radius)] border border-rose-200 dark:border-rose-900 bg-rose-50/70 dark:bg-rose-950/30 p-6 text-center space-y-4 shadow-sm">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-900/50 text-rose-600 dark:text-rose-400">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                </div>
                <div className="space-y-1.5">
                  <h2 className="text-lg font-semibold text-rose-900 dark:text-rose-200">
                    Access Restricted
                  </h2>
                  <p className="text-xs text-[hsl(var(--muted-foreground))] leading-relaxed">
                    Your role (<strong>{canonicalRole.replace('_', ' ')}</strong>) is not authorized to access this section (<code>{pathname}</code>).
                  </p>
                </div>
                <div className="pt-2">
                  <Link href={defaultRoute}>
                    <Button className="w-full">Return to Dashboard</Button>
                  </Link>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}