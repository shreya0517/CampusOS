'use client';

import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive'; loading?: boolean };

export const Button = forwardRef<HTMLButtonElement, Props>(function Button({ className, variant = 'primary', loading, disabled, children, ...props }, ref) {
  const styles = { primary: 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]', secondary: 'bg-[hsl(var(--secondary))]', outline: 'border bg-transparent', ghost: 'bg-transparent', destructive: 'bg-[hsl(var(--destructive))] text-white' };
  return <button ref={ref} className={cn('inline-flex min-h-10 items-center justify-center gap-2 rounded-[var(--radius)] px-4 text-sm font-semibold transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50', styles[variant], className)} disabled={disabled || loading} {...props}>{loading && <span aria-hidden="true">...</span>}{children}</button>;
});
