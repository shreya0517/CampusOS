import type { HTMLAttributes, TableHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
export const Table = ({ className, ...props }: TableHTMLAttributes<HTMLTableElement>) => <div className="overflow-x-auto"><table className={cn('w-full text-left text-sm', className)} {...props} /></div>;
export const TableCell = ({ className, ...props }: HTMLAttributes<HTMLTableCellElement>) => <td className={cn('border-t px-4 py-3', className)} {...props} />;
export const TableHead = ({ className, ...props }: HTMLAttributes<HTMLTableCellElement>) => <th className={cn('px-4 py-3 text-xs uppercase tracking-wide text-[hsl(var(--muted-foreground))]', className)} {...props} />;
