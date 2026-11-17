'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/form-field';
import {
  createTimetableEntry,
  getClasses,
  getRooms,
} from '@/lib/timetable-api';
import type { ClassOption, RoomOption } from '@/lib/timetable-api';

const DAYS = [
  { value: '0', label: 'Sunday' },
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
];

export default function NewTimetableEntryPage() {
  const router = useRouter();

  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const [classId, setClassId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [dayOfWeek, setDayOfWeek] = useState('1');
  const [startsAt, setStartsAt] = useState('09:00');
  const [endsAt, setEndsAt] = useState('10:00');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      try {
        const [clsList, rmList] = await Promise.all([getClasses(), getRooms()]);
        setClasses(clsList);
        setRooms(rmList);
        if (clsList.length > 0 && clsList[0]) setClassId(clsList[0].id);
        if (rmList.length > 0 && rmList[0]) setRoomId(rmList[0].id);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load classes and rooms options.');
      } finally {
        setLoadingData(false);
      }
    }
    void init();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!classId) {
      setError('Please select a class.');
      return;
    }
    if (!roomId) {
      setError('Please select a room.');
      return;
    }
    if (!startsAt || !endsAt) {
      setError('Start time and End time are required.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await createTimetableEntry({
        classId,
        roomId,
        dayOfWeek: Number(dayOfWeek),
        startsAt,
        endsAt,
      });
      router.push('/dashboard/timetable');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to schedule timetable entry.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl grid gap-6">
      <div>
        <Link href="/dashboard/timetable" className="text-xs font-semibold text-[hsl(var(--primary))] hover:underline">
          &larr; Back to Timetable
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Schedule New Class Session</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          Assign a class to a room and time slot with automatic room, class, and faculty conflict checks.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Session Details</CardTitle>
          <CardDescription>All fields are required. Time conflicts will be automatically detected.</CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-300">
              <strong>Error:</strong> {error}
            </div>
          )}

          {loadingData ? (
            <div className="py-8 text-center text-xs text-[hsl(var(--muted-foreground))]">
              Loading options...
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="grid gap-5">
              <Select
                label="Class & Subject"
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
              >
                {classes.length === 0 ? (
                  <option value="">No classes available</option>
                ) : (
                  classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.subject.code} - {c.subject.name} (Section {c.section.code})
                      {c.faculty ? ` — ${c.faculty.firstName} ${c.faculty.lastName}` : ''}
                    </option>
                  ))
                )}
              </Select>

              <Select
                label="Classroom / Facility"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
              >
                {rooms.length === 0 ? (
                  <option value="">No rooms available</option>
                ) : (
                  rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.code} — {r.name} {r.capacity ? `(Capacity: ${r.capacity})` : ''}
                    </option>
                  ))
                )}
              </Select>

              <Select
                label="Day of Week"
                value={dayOfWeek}
                onChange={(e) => setDayOfWeek(e.target.value)}
              >
                {DAYS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </Select>

              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Start Time (HH:mm)"
                  type="time"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                />
                <Input
                  label="End Time (HH:mm)"
                  type="time"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                />
              </div>

              <div className="mt-4 flex items-center justify-end gap-3">
                <Link href="/dashboard/timetable">
                  <Button type="button" variant="outline">
                    Cancel
                  </Button>
                </Link>
                <Button type="submit" disabled={submitting || classes.length === 0 || rooms.length === 0}>
                  {submitting ? 'Scheduling...' : 'Schedule Entry'}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
