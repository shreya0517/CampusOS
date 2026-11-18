'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { NavIcon } from '@/lib/navigation';
import { CATEGORY_ICON, getUnreadCount, listNotifications, markAllNotificationsRead, markNotificationRead, NOTIFICATION_EVENT, timeAgo } from '@/lib/notifications-api';
import type { AppNotification } from '@/lib/notifications-api';
import { subscribe } from '@/lib/socket';

/** How often the unread count is refreshed when no live event arrives (for example while the socket reconnects). */
const POLL_MS = 60_000;

/** Top-bar bell: unread badge, live updates, and a panel with the latest notifications. */
export function NotificationBell() {
  const router = useRouter();
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const refreshCount = useCallback(() => {
    getUnreadCount()
      .then((result) => setUnread(result.unread))
      .catch(() => undefined);
  }, []);

  const loadLatest = useCallback(() => {
    listNotifications(new URLSearchParams({ page: '1', pageSize: '6' }))
      .then((page) => {
        setItems(page.items);
        setUnread(page.unread);
      })
      .catch(() => setItems([]));
  }, []);

  useEffect(() => {
    refreshCount();
    const timer = window.setInterval(refreshCount, POLL_MS);
    const unsubscribe = subscribe(NOTIFICATION_EVENT, () => {
      setUnread((count) => count + 1);
      setItems(null);
    });
    return () => {
      window.clearInterval(timer);
      unsubscribe();
    };
  }, [refreshCount]);

  useEffect(() => {
    if (open && items === null) loadLatest();
  }, [open, items, loadLatest]);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const openItem = async (item: AppNotification) => {
    setOpen(false);
    if (!item.readAt) {
      setItems((current) => current?.map((entry) => (entry.id === item.id ? { ...entry, readAt: new Date().toISOString() } : entry)) ?? null);
      markNotificationRead(item.id)
        .then((result) => setUnread(result.unread))
        .catch(() => undefined);
    }
    if (item.link) router.push(item.link);
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        className="relative rounded-md p-2 text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0a3 3 0 1 1-6 0m6 0H9" />
        </svg>
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold leading-none text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[var(--radius)] border bg-[hsl(var(--card))] shadow-xl">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <p className="text-sm font-semibold">Notifications</p>
            {unread > 0 && (
              <button
                type="button"
                className="text-xs font-semibold text-[hsl(var(--primary))] hover:underline"
                onClick={() => {
                  markAllNotificationsRead()
                    .then((result) => {
                      setUnread(result.unread);
                      setItems((current) => current?.map((entry) => ({ ...entry, readAt: entry.readAt ?? new Date().toISOString() })) ?? null);
                    })
                    .catch(() => undefined);
                }}
              >
                Mark all as read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items === null ? (
              <p className="px-4 py-6 text-center text-sm text-[hsl(var(--muted-foreground))]">Loading…</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-[hsl(var(--muted-foreground))]">You&apos;re all caught up.</p>
            ) : (
              <ul className="divide-y">
                {items.map((item) => (
                  <li key={item.id}>
                    <button type="button" onClick={() => void openItem(item)} className={`flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-[hsl(var(--muted))]/60 ${item.readAt ? '' : 'bg-[hsl(var(--sidebar-active))]/40'}`}>
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--sidebar-active))] text-[hsl(var(--sidebar-active-foreground))]" aria-hidden="true">
                        <NavIcon name={CATEGORY_ICON[item.category]} className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-sm ${item.readAt ? 'font-medium' : 'font-semibold'}`}>{item.title}</span>
                        <span className="block truncate text-xs text-[hsl(var(--muted-foreground))]">{item.body}</span>
                        <span className="mt-0.5 block text-[11px] text-[hsl(var(--muted-foreground))]">{timeAgo(item.createdAt)}</span>
                      </span>
                      {!item.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[hsl(var(--primary))]" aria-label="Unread" />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Link href="/dashboard/notifications" onClick={() => setOpen(false)} className="block border-t px-4 py-2.5 text-center text-sm font-semibold text-[hsl(var(--primary))] hover:bg-[hsl(var(--muted))]/60">
            View all notifications
          </Link>
        </div>
      )}
    </div>
  );
}
