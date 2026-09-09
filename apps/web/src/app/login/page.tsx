'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { login } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/form-field';

export default function LoginPage() { const router = useRouter(); const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(false); return <div><h1 className="text-2xl font-semibold">Sign in</h1><p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">Use your CampusOS college account to continue.</p><form className="mt-6 grid gap-4" onSubmit={async (event) => { event.preventDefault(); const data = new FormData(event.currentTarget); setLoading(true); setError(null); try { await login({ collegeCode: String(data.get('collegeCode')), email: String(data.get('email')), password: String(data.get('password')) }); router.replace('/dashboard/students'); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Sign in failed.'); } finally { setLoading(false); } }}><Input label="College code" name="collegeCode" required autoComplete="organization" /><Input label="Email" name="email" type="email" required autoComplete="email" /><Input label="Password" name="password" type="password" required autoComplete="current-password" /><Button type="submit" loading={loading}>Sign in</Button>{error && <p role="alert" className="text-sm text-[hsl(var(--destructive))]">{error}</p>}</form></div>; }