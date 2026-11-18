'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '@/components/auth-provider';
import { NotificationBell } from '@/components/layout/notification-bell';
import { Button } from '@/components/ui/button';
import {
  getDefaultDashboardRoute,
  isRouteAllowedForRole,
  NavIcon,
  PORTAL_NAME,
  resolveCanonicalRole,
  ROLE_NAVIGATION,
} from '@/lib/navigation';
import type { CanonicalRole, NavItem } from '@/lib/navigation';

const ROLE_LABEL: Record<CanonicalRole, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Administrator',
  HOD: 'Head of Department',
  FACULTY: 'Faculty',
  STUDENT: 'Student',
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0] ?? '?';
  const last = parts.length > 1 ? (parts[parts.length - 1] ?? '') : '';
  return (last ? `${first.charAt(0)}${last.charAt(0)}` : first.slice(0, 2)).toUpperCase();
}

function isItemActive(item: NavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(`${item.href}/`));
}

/** Consecutive items that share a group, in menu order. */
function groupItems(items: NavItem[]): { group: string; items: NavItem[] }[] {
  const groups: { group: string; items: NavItem[] }[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.group === item.group) last.items.push(item);
    else groups.push({ group: item.group, items: [item] });
  }
  return groups;
}

function BrandMark({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--primary))] text-white shadow-sm ${className}`}>
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3 2 8l10 5 10-5-10-5Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 10.2V15c0 1.7 2.7 3 6 3s6-1.3 6-3v-4.8M22 8v6" />
      </svg>
    </span>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
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

  // An account without a role gets nothing from the API (403 NO_ROLE), so say so instead of showing a menu that fails.
  if (!user.roles?.length) {
    return (
      <div className="grid min-h-screen place-items-center bg-[hsl(var(--background))] p-6">
        <div className="grid max-w-md gap-3 rounded-[var(--radius)] border bg-[hsl(var(--card))] p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold">Your account has no role yet</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            You're signed in as {user.email}, but your college hasn't given this account a role, so there is nothing to show. Ask your college
            administrator to set it up.
          </p>
          <div>
            <button type="button" onClick={() => void handleLogout()} className="rounded-[var(--radius)] border px-4 py-2 text-sm font-semibold">
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  const canonicalRole = resolveCanonicalRole(user.roles, primaryRole);
  const visibleNavigation = ROLE_NAVIGATION[canonicalRole] ?? ROLE_NAVIGATION.STUDENT;
  const defaultRoute = getDefaultDashboardRoute(canonicalRole);
  const isAuthorized = isRouteAllowedForRole(pathname, canonicalRole);
  const activeNav = visibleNavigation.find((item) => isItemActive(item, pathname));
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      {/* ─── Sidebar ─────────────────────────────────────────────────────── */}
      <aside
        className={`${open ? 'translate-x-0' : '-translate-x-full'} fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r bg-[hsl(var(--sidebar))] text-[hsl(var(--sidebar-foreground))] transition-[transform,width] duration-200 lg:translate-x-0 ${
          collapsed ? 'lg:w-[4.5rem]' : 'lg:w-64'
        }`}
        aria-label="Primary navigation"
      >
        <Link
          href={defaultRoute}
          onClick={() => setOpen(false)}
          className={`flex h-16 shrink-0 items-center gap-3 border-b px-4 ${collapsed ? 'lg:justify-center lg:px-0' : ''}`}
          title="CampusOS"
        >
          <BrandMark />
          <span className={`min-w-0 ${collapsed ? 'lg:hidden' : ''}`}>
            <span className="block text-[15px] font-bold leading-tight tracking-tight text-[hsl(var(--foreground))]">CampusOS</span>
            <span className="block truncate text-xs font-medium text-[hsl(var(--sidebar-muted))]">{PORTAL_NAME[canonicalRole]}</span>
          </span>
        </Link>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {groupItems(visibleNavigation).map((section, index) => (
            <div key={`${section.group}-${index}`} className={index > 0 ? 'mt-5' : ''}>
              <p
                className={`mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[.08em] text-[hsl(var(--sidebar-muted))] ${
                  collapsed ? 'lg:hidden' : ''
                }`}
              >
                {section.group}
              </p>
              {collapsed && index > 0 && <div className="mx-3 mb-2 hidden border-t lg:block" aria-hidden="true" />}
              <ul className="grid gap-0.5">
                {section.items.map((item) => {
                  const isActive = isItemActive(item, pathname);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setOpen(false)}
                        aria-current={isActive ? 'page' : undefined}
                        title={collapsed ? item.label : undefined}
                        className={`relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                          collapsed ? 'lg:justify-center lg:px-0' : ''
                        } ${
                          isActive
                            ? 'bg-[hsl(var(--sidebar-active))] font-semibold text-[hsl(var(--sidebar-active-foreground))]'
                            : 'font-medium hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]'
                        }`}
                      >
                        {isActive && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r bg-[hsl(var(--primary))]" aria-hidden="true" />}
                        <NavIcon name={item.icon} className="h-[18px] w-[18px] shrink-0" />
                        <span className={`truncate ${collapsed ? 'lg:hidden' : ''}`}>{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="hidden shrink-0 border-t p-3 lg:block">
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-xs font-medium text-[hsl(var(--sidebar-muted))] transition-colors hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] ${
              collapsed ? 'justify-center px-0' : ''
            }`}
          >
            <svg className={`h-4 w-4 shrink-0 transition-transform ${collapsed ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
            <span className={collapsed ? 'hidden' : ''}>Collapse menu</span>
          </button>
        </div>
      </aside>

      {open && <button aria-label="Close navigation" className="fixed inset-0 z-20 bg-slate-900/40 lg:hidden" onClick={() => setOpen(false)} />}

      {/* ─── Main area ───────────────────────────────────────────────────── */}
      <div className={`flex min-h-screen min-w-0 flex-col transition-[padding] duration-200 ${collapsed ? 'lg:pl-[4.5rem]' : 'lg:pl-64'}`}>
        <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-3 border-b bg-[hsl(var(--card))]/95 px-4 backdrop-blur sm:px-6 lg:px-8">
          <button
            type="button"
            className="-ml-1 rounded-md p-2 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] lg:hidden"
            aria-label="Open navigation"
            onClick={() => setOpen(true)}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-sm">
            {activeNav && <span className="hidden text-[hsl(var(--muted-foreground))] sm:inline">{activeNav.group}</span>}
            {activeNav && (
              <svg className="hidden h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))] sm:block" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6" />
              </svg>
            )}
            <span className="truncate font-semibold text-[hsl(var(--foreground))]">{activeNav?.label ?? 'Dashboard'}</span>
          </nav>

          <div className="ml-auto flex items-center gap-2 sm:gap-4">
            <span className="hidden text-sm text-[hsl(var(--muted-foreground))] md:inline">{today}</span>
            <NotificationBell />
            <span className="hidden h-6 border-l md:block" aria-hidden="true" />
            <div className="flex items-center gap-3">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--sidebar-active))] text-xs font-bold text-[hsl(var(--sidebar-active-foreground))]"
                aria-hidden="true"
              >
                {initials(user.displayName)}
              </span>
              <span className="hidden min-w-0 leading-tight sm:block" title={user.email}>
                <span className="block max-w-[14rem] truncate text-sm font-semibold">{user.displayName}</span>
                <span className="block text-xs text-[hsl(var(--muted-foreground))]">{ROLE_LABEL[canonicalRole]}</span>
              </span>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Sign out"
              className="inline-flex items-center gap-2 rounded-md border bg-[hsl(var(--card))] px-3 py-2 text-sm font-medium text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17l5-5-5-5M20 12H9M12 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7" />
              </svg>
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1680px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {isAuthorized ? (
            children
          ) : (
            <div className="grid place-items-center py-16">
              <div className="w-full max-w-md space-y-4 rounded-[var(--radius)] border bg-[hsl(var(--card))] p-8 text-center shadow-sm">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400">
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2Zm10-10V7a4 4 0 0 0-8 0v4h8Z" />
                  </svg>
                </div>
                <div className="space-y-1.5">
                  <h2 className="text-lg font-semibold">You don&apos;t have access to this page</h2>
                  <p className="text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
                    This section isn&apos;t part of the {PORTAL_NAME[canonicalRole]}. If you think you should have access, contact the college administrator.
                  </p>
                </div>
                <Link href={defaultRoute} className="block pt-2">
                  <Button className="w-full">Return to Dashboard</Button>
                </Link>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
