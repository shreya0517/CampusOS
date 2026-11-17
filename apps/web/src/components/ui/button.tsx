'use client';

import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive'; loading?: boolean };

export const Button = forwardRef<HTMLButtonElement, Props>(function Button({ className, variant = 'primary', loading, disabled, children, ...props }, ref) {
  const styles = { primary: 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-sm hover:brightness-110', secondary: 'bg-[hsl(var(--secondary))] text-[hsl(var(--sidebar-active-foreground))] hover:brightness-95', outline: 'border bg-[hsl(var(--card))] shadow-sm hover:bg-[hsl(var(--muted))]', ghost: 'bg-transparent hover:bg-[hsl(var(--muted))]', destructive: 'bg-[hsl(var(--destructive))] text-white' };
  return <button ref={ref} className={cn('inline-flex min-h-10 items-center justify-center gap-2 rounded-[var(--radius)] px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50', styles[variant], className)} disabled={disabled || loading} {...props}>{loading && <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}{children}</button>;
});
