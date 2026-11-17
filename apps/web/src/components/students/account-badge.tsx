import type { StudentAccount } from '@/lib/student-api';

/** A student's sign-in account status as a small coloured badge. */
export function AccountBadge({ account }: { account: StudentAccount }) {
  if (!account) return <span className="inline-flex rounded-full bg-[hsl(var(--muted))] px-2.5 py-0.5 text-xs font-semibold text-[hsl(var(--muted-foreground))]">No account</span>;
  const active = account.status === 'ACTIVE';
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        active ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
      }`}
    >
      {active ? 'Active' : account.status === 'SUSPENDED' ? 'Suspended' : 'Inactive'}
    </span>
  );
}
