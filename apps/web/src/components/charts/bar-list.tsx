export type BarRow = {
  key: string;
  label: string;
  value: number;
  /** The value as printed at the bar's tip; defaults to the number itself. */
  display?: string;
  /** A second, quieter line under the label, such as "3 invoices". */
  hint?: string;
  /** Bar colour (CSS). Defaults to the primary colour; status colours are only for statuses, always with their label. */
  color?: string;
};

/** Status colours, used only for statuses and always next to the status's name. */
export const STATUS_COLORS = { good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#d03b3b', neutral: '#94a3b8' } as const;

/**
 * Labelled horizontal bars sharing one scale, each with its value printed at the tip, so every figure is readable
 * without hovering. Thin bars, square at the baseline and rounded at the data end.
 */
export function BarList({ rows, title, max, empty = 'Nothing to show for this selection.' }: { rows: BarRow[]; title: string; max?: number; empty?: string }) {
  if (rows.length === 0) return <p className="text-sm text-[hsl(var(--muted-foreground))]">{empty}</p>;
  const top = max ?? Math.max(...rows.map((row) => row.value), 0);
  return (
    <ul className="grid gap-3" aria-label={title}>
      {rows.map((row) => {
        const share = top > 0 ? Math.min(1, Math.max(0, row.value / top)) : 0;
        const display = row.display ?? row.value.toLocaleString('en-IN');
        return (
          <li key={row.key} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-center gap-3 text-sm">
            <div className="min-w-0">
              <p className="truncate font-medium" title={row.label}>
                {row.label}
              </p>
              {row.hint && <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">{row.hint}</p>}
            </div>
            <div className="flex min-w-0 items-center gap-2">
              {share > 0 && (
                <span
                  aria-hidden="true"
                  className="h-2.5 shrink-0 rounded-r-[4px]"
                  style={{ width: `calc((100% - 4.5rem) * ${share})`, minWidth: 2, background: row.color ?? 'hsl(var(--primary))' }}
                />
              )}
              <span className="whitespace-nowrap text-xs font-semibold tabular-nums">{display}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
