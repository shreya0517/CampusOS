'use client';

'use client';

import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) { return <div className="grid place-items-center gap-2 rounded-[var(--radius)] border border-dashed p-8 text-center"><p className="font-semibold">{title}</p><p className="max-w-sm text-sm text-[hsl(var(--muted-foreground))]">{description}</p>{action}</div>; }
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) { return <div role="alert" className="flex items-center justify-between gap-4 rounded-[var(--radius)] border border-[hsl(var(--destructive))] p-4 text-sm"><span>{message}</span>{onRetry && <Button variant="outline" onClick={onRetry}>Retry</Button>}</div>; }
export function Skeleton({ className = '' }: { className?: string }) { return <div aria-hidden="true" className={`animate-pulse rounded bg-[hsl(var(--muted))] ${className}`} />; }
