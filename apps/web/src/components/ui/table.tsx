import type { HTMLAttributes, TableHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
export const Table = ({ className, ...props }: TableHTMLAttributes<HTMLTableElement>) => <div className="overflow-x-auto"><table className={cn('w-full text-left text-sm [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-[hsl(var(--muted))]/50', className)} {...props} /></div>;
export const TableCell = ({ className, ...props }: HTMLAttributes<HTMLTableCellElement>) => <td className={cn('border-t px-4 py-3', className)} {...props} />;
export const TableHead = ({ className, ...props }: HTMLAttributes<HTMLTableCellElement>) => <th className={cn('whitespace-nowrap bg-[hsl(var(--muted))]/70 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]', className)} {...props} />;
