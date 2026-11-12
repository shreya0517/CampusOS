'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { EmptyState, ErrorState, Skeleton } from '@/components/feedback/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  deleteTimetableEntry,
  getRooms,
  getMyTimetable,
  listTimetableEntries,
} from '@/lib/timetable-api';
import type { RoomOption, TimetableEntry } from '@/lib/timetable-api';

const DAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

function formatTime(dateOrStr: string): string {
  if (!dateOrStr) return '';
  if (dateOrStr.includes('T')) {
    const d = new Date(dateOrStr);
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }
  return dateOrStr.slice(0, 5);
}

export default function TimetablePage() {
  const { primaryRole } = useAuth();
  const isStaff = primaryRole === 'Admin' || primaryRole === 'HOD' || primaryRole === 'Faculty';
  const isStudent = primaryRole === 'Student';

  const [activeTab, setActiveTab] = useState<'my' | 'all'>(isStudent ? 'my' : 'all');
  const [dayFilter, setDayFilter] = useState<string>('ALL');
  const [roomFilter, setRoomFilter] = useState<string>('ALL');

  const [entries, setEntries] = useState<TimetableEntry[]>([]);
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      if (rooms.length === 0) {
        getRooms().then(setRooms).catch(() => null);
      }

      if (activeTab === 'my') {
        const data = await getMyTimetable();
        setEntries(data);
      } else {
        const params = new URLSearchParams({ pageSize: '200' });
        if (dayFilter !== 'ALL') params.set('dayOfWeek', dayFilter);
        if (roomFilter !== 'ALL') params.set('roomId', roomFilter);

        const res = await listTimetableEntries(params);
        setEntries(res.items);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load timetable.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [activeTab, dayFilter, roomFilter]);

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to remove this timetable entry?')) return;
    setDeletingId(id);
    try {
      await deleteTimetableEntry(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to delete timetable entry.');
    } finally {
      setDeletingId(null);
    }
  };

  const filteredEntries = activeTab === 'my' && dayFilter !== 'ALL'
    ? entries.filter((e) => e.dayOfWeek === Number(dayFilter))
    : entries;

  const groupedByDay = DAYS.map((dayName, dayIdx) => {
    const dayEntries = filteredEntries.filter((e) => e.dayOfWeek === dayIdx);
    return { dayName, dayIdx, dayEntries };
  });

  return (
    <div className="grid gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[.16em] text-[hsl(var(--primary))]">Academics</p>
          <h1 className="mt-1 text-3xl font-semibold">Class Timetable</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            Schedule and view weekly class sessions, rooms, faculty assignments, and time slots.
          </p>
        </div>
        {isStaff && (
          <Link href="/dashboard/timetable/new">
            <Button className="w-full sm:w-auto">+ Schedule Entry</Button>
          </Link>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-b pb-4">
        <button
          type="button"
          onClick={() => setActiveTab('my')}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
            activeTab === 'my'
              ? 'bg-[hsl(var(--primary))] text-white shadow'
              : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]'
          }`}
        >
          My Timetable
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('all')}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
            activeTab === 'all'
              ? 'bg-[hsl(var(--primary))] text-white shadow'
              : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--accent))]'
          }`}
        >
          All Schedules
        </button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>{activeTab === 'my' ? 'My Weekly Schedule' : 'Master College Timetable'}</CardTitle>
              <CardDescription>
                {activeTab === 'my'
                  ? 'Your personalized schedule based on active section enrollments or assigned teaching modules.'
                  : 'View all scheduled classes by room or day of the week.'}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <select
                  value={dayFilter}
                  onChange={(e) => setDayFilter(e.target.value)}
                  className="rounded-md border bg-background px-3 py-1.5 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                >
                  <option value="ALL">All Days</option>
                  {DAYS.map((d, i) => (
                    <option key={d} value={i}>{d}</option>
                  ))}
                </select>
              </div>
              {activeTab === 'all' && (
                <div>
                  <select
                    value={roomFilter}
                    onChange={(e) => setRoomFilter(e.target.value)}
                    className="rounded-md border bg-background px-3 py-1.5 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                  >
                    <option value="ALL">All Rooms</option>
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.code} - {r.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Skeleton className="h-36 w-full" />
              <Skeleton className="h-36 w-full" />
              <Skeleton className="h-36 w-full" />
            </div>
          ) : error ? (
            <ErrorState message={error} onRetry={() => void loadData()} />
          ) : filteredEntries.length === 0 ? (
            <EmptyState
              title="No timetable entries found"
              description={
                activeTab === 'my'
                  ? 'You currently have no classes scheduled for your profile.'
                  : 'No entries match the selected day or room filter.'
              }
              action={
                isStaff ? (
                  <Link href="/dashboard/timetable/new">
                    <Button variant="outline">+ Create Entry</Button>
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <div className="grid gap-6">
              {groupedByDay.map(({ dayName, dayIdx, dayEntries }) => {
                if (dayEntries.length === 0 && dayFilter !== 'ALL') return null;
                if (dayEntries.length === 0 && dayFilter === 'ALL') return null;

                return (
                  <div key={dayIdx} className="grid gap-3">
                    <div className="flex items-center gap-2 border-b pb-2">
                      <h2 className="text-lg font-semibold">{dayName}</h2>
                      <span className="rounded-full bg-[hsl(var(--muted))] px-2.5 py-0.5 text-xs font-medium text-[hsl(var(--muted-foreground))]">
                        {dayEntries.length} {dayEntries.length === 1 ? 'class' : 'classes'}
                      </span>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {dayEntries.map((entry) => (
                        <Card key={entry.id} className="relative flex flex-col justify-between transition hover:border-[hsl(var(--primary))] hover:shadow-md">
                          <CardHeader className="pb-2">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <span className="inline-block rounded bg-[hsl(var(--primary))]/10 px-2 py-0.5 text-xs font-bold text-[hsl(var(--primary))]">
                                  {formatTime(entry.startsAt)} &ndash; {formatTime(entry.endsAt)}
                                </span>
                                <CardTitle className="mt-2 text-base font-semibold">
                                  {entry.class?.subject?.name || 'Class Session'}
                                </CardTitle>
                                <CardDescription className="text-xs">
                                  Code: {entry.class?.subject?.code || 'N/A'}
                                </CardDescription>
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent className="text-xs text-[hsl(var(--muted-foreground))]">
                            <div className="grid gap-1">
                              <div>
                                <strong>Section:</strong> {entry.class?.section?.code || 'N/A'}
                                {entry.class?.section?.semester && (
                                  <span> ({entry.class.section.semester.name})</span>
                                )}
                              </div>
                              <div>
                                <strong>Room:</strong> {entry.room ? `${entry.room.code} (${entry.room.name})` : 'N/A'}
                              </div>
                              <div>
                                <strong>Faculty:</strong>{' '}
                                {entry.class?.faculty
                                  ? `${entry.class.faculty.firstName} ${entry.class.faculty.lastName}`
                                  : 'Unassigned'}
                              </div>
                            </div>

                            {isStaff && (
                              <div className="mt-4 flex justify-end">
                                <Button
                                  variant="ghost"
                                  disabled={deletingId === entry.id}
                                  onClick={() => void handleDelete(entry.id)}
                                  className="h-7 px-2 text-xs text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/30"
                                >
                                  {deletingId === entry.id ? 'Deleting...' : 'Delete'}
                                </Button>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
