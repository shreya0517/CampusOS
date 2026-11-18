'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { EmptyState, ErrorState, Skeleton } from '@/components/feedback/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Pagination } from '@/components/ui/pagination';
import { NavIcon } from '@/lib/navigation';
import { CATEGORY_ICON, CATEGORY_LABEL, listNotifications, markAllNotificationsRead, markNotificationRead, NOTIFICATION_EVENT, timeAgo } from '@/lib/notifications-api';
import type { AppNotification, NotificationCategory, NotificationPage } from '@/lib/notifications-api';
import { subscribe } from '@/lib/socket';

const PAGE_SIZE = 20;
const FILTERS: (NotificationCategory | '')[] = ['', 'TASK', 'EXAM', 'ASSIGNMENT', 'ATTENDANCE', 'VISITOR', 'FEE', 'ANNOUNCEMENT'];

export default function NotificationsPage() {
  const router = useRouter();
  const [category, setCategory] = useState<NotificationCategory | ''>('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<NotificationPage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (category) params.set('category', category);
      if (unreadOnly) params.set('unread', 'true');
      setData(await listNotifications(params));
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Notifications could not be loaded.');
    }
  };

  useEffect(() => {
    void load();
  }, [category, unreadOnly, page]);

  // New notifications appear without a refresh.
  useEffect(() => subscribe(NOTIFICATION_EVENT, () => void load()), [category, unreadOnly, page]);

  const open = async (item: AppNotification) => {
    if (!item.readAt) {
      await markNotificationRead(item.id).catch(() => undefined);
      setData((current) =>
        current ? { ...current, unread: Math.max(0, current.unread - 1), items: current.items.map((entry) => (entry.id === item.id ? { ...entry, readAt: new Date().toISOString() } : entry)) } : current,
      );
    }
    if (item.link) router.push(item.link);
  };

  return (
    <div className="grid max-w-4xl gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{data ? `${data.unread} unread` : 'Updates about your work, approvals and announcements.'}</p>
        </div>
        {data && data.unread > 0 && (
          <Button
            variant="outline"
            onClick={async () => {
              await markAllNotificationsRead(category || undefined).catch(() => undefined);
              await load();
            }}
          >
            Mark {category ? `${CATEGORY_LABEL[category].toLowerCase()}` : 'all'} as read
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((value) => (
          <button
            key={value || 'all'}
            type="button"
            onClick={() => {
              setCategory(value);
              setPage(1);
            }}
            className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
              category === value ? 'border-[hsl(var(--primary))] bg-[hsl(var(--sidebar-active))] text-[hsl(var(--sidebar-active-foreground))]' : 'bg-[hsl(var(--card))] hover:bg-[hsl(var(--muted))]'
            }`}
          >
            {value ? CATEGORY_LABEL[value] : 'All'}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(event) => {
              setUnreadOnly(event.target.checked);
              setPage(1);
            }}
            className="h-4 w-4"
          />
          Unread only
        </label>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : !data ? (
        <Skeleton className="h-64 w-full" />
      ) : data.items.length === 0 ? (
        <EmptyState title="No notifications" description={unreadOnly || category ? 'Nothing matches these filters.' : "You'll be notified here about tasks, approvals, results and announcements."} />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y">
              {data.items.map((item) => (
                <li key={item.id}>
                  <button type="button" onClick={() => void open(item)} className={`flex w-full gap-4 px-5 py-4 text-left transition-colors hover:bg-[hsl(var(--muted))]/60 ${item.readAt ? '' : 'bg-[hsl(var(--sidebar-active))]/40'}`}>
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--sidebar-active))] text-[hsl(var(--sidebar-active-foreground))]" aria-hidden="true">
                      <NavIcon name={CATEGORY_ICON[item.category]} className="h-[18px] w-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className={`text-sm ${item.readAt ? 'font-medium' : 'font-semibold'}`}>{item.title}</span>
                        <span className="text-xs text-[hsl(var(--muted-foreground))]" title={new Date(item.createdAt).toLocaleString('en-IN')}>
                          {timeAgo(item.createdAt)}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-sm text-[hsl(var(--muted-foreground))]">{item.body}</span>
                      <span className="mt-1 block text-xs text-[hsl(var(--muted-foreground))]">{CATEGORY_LABEL[item.category]}</span>
                    </span>
                    {!item.readAt && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[hsl(var(--primary))]" aria-label="Unread" />}
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {data && data.total > PAGE_SIZE && <Pagination page={page} pageCount={Math.ceil(data.total / PAGE_SIZE)} onPageChange={setPage} />}
    </div>
  );
}
