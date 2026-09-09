import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
export const Card = ({ className, ...props }: HTMLAttributes<HTMLElement>) => <section className={cn('rounded-[var(--radius)] border bg-[hsl(var(--card))] shadow-sm', className)} {...props} />;
export const CardHeader = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => <div className={cn('border-b px-5 py-4', className)} {...props} />;
export const CardTitle = ({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) => <h2 className={cn('text-lg font-semibold', className)} {...props} />;
export const CardDescription = ({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) => <p className={cn('mt-1 text-sm text-[hsl(var(--muted-foreground))]', className)} {...props} />;
export const CardContent = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => <div className={cn('p-5', className)} {...props} />;
export const CardFooter = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => <div className={cn('flex items-center gap-3 border-t px-5 py-4', className)} {...props} />;
