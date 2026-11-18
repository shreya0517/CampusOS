type Summary = { percentage: number | null; belowThreshold: boolean };

/** A percentage bar coloured by attendance: red under the threshold, amber under 85%, green otherwise. */
export function AttendanceBar({ summary }: { summary: Summary }) {
  if (summary.percentage === null) return <span className="text-xs text-[hsl(var(--muted-foreground))]">No sessions</span>;
  const color = summary.belowThreshold ? 'bg-rose-500' : summary.percentage < 85 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="flex min-w-[9rem] items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[hsl(var(--muted))]">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, summary.percentage)}%` }} />
      </div>
      <span className={`w-12 text-right text-sm font-semibold tabular-nums ${summary.belowThreshold ? 'text-rose-600 dark:text-rose-400' : ''}`}>
        {summary.percentage}%
      </span>
    </div>
  );
}
