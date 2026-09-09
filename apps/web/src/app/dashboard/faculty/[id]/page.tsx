'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ErrorState, Skeleton } from '@/components/feedback/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/form-field';
import { getFaculty, updateFaculty } from '@/lib/faculty-api';
import type { Faculty } from '@/lib/faculty-api';

export default function FacultyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [faculty, setFaculty] = useState<Faculty | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const load = async (): Promise<void> => { try { setFaculty(await getFaculty(id)); setError(null); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Faculty could not be loaded.'); } };
  useEffect(() => { void load(); }, [id]);
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!faculty) return <Skeleton className="h-48 w-full" />;
  return <div className="grid gap-6"><Link className="text-sm font-semibold text-[hsl(var(--primary))] underline" href="/dashboard/faculty">Faculty</Link><div className="grid gap-6 lg:grid-cols-2"><Card><CardHeader><CardTitle>{faculty.firstName} {faculty.lastName}</CardTitle></CardHeader><CardContent><form className="grid gap-4" onSubmit={async (event) => { event.preventDefault(); const data = new FormData(event.currentTarget); setSaving(true); try { setFaculty(await updateFaculty(faculty.id, { employeeCode: String(data.get('employeeCode')), firstName: String(data.get('firstName')), lastName: String(data.get('lastName')) })); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Profile could not be saved.'); } finally { setSaving(false); } }}><Input label="Employee code" name="employeeCode" defaultValue={faculty.employeeCode} required /><Input label="First name" name="firstName" defaultValue={faculty.firstName} required /><Input label="Last name" name="lastName" defaultValue={faculty.lastName} required /><Button type="submit" loading={saving}>Save profile</Button></form></CardContent></Card><Card><CardHeader><CardTitle>Department</CardTitle></CardHeader><CardContent><p>{faculty.department?.name ?? 'No department assigned'}</p><p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">{faculty.department?.code ?? ''}</p></CardContent></Card></div></div>;
}