'use client';

import { useState } from 'react';

export type ColumnDatum = { key: string; label: string; value: number | null; detail?: string };

/** Rounds up to 1, 2, 2.5 or 5 times a power of ten, so the axis reads in clean steps. */
export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) if (step * magnitude >= value) return step * magnitude;
  return 10 * magnitude;
}

/**
 * A single-series column chart: one column per period, growing from a hairline baseline, with two recessive gridlines.
 * Hovering or focusing a column shows its value; the latest value is labelled on its cap, and every value is also in the
 * table view underneath. A null value (no data for that period) draws no column.
 */
export function ColumnChart({
  data,
  title,
  format,
  formatTick = format,
  max,
  reference,
  height = 176,
  wholeNumbers = false,
}: {
  data: ColumnDatum[];
  /** Names the series for screen readers and the table view. */
  title: string;
  format: (value: number) => string;
  formatTick?: (value: number) => string;
  /** Fixed top of the scale, such as 100 for percentages; otherwise rounded up from the largest value. */
  max?: number;
  /** A labelled hairline across the plot, such as the attendance threshold. */
  reference?: { value: number; label: string };
  height?: number;
  /** For counts: the middle gridline is dropped when it would fall on a fraction. */
  wholeNumbers?: boolean;
}) {
  const [active, setActive] = useState<number | null>(null);
  const top = max ?? niceMax(Math.max(0, ...data.map((datum) => datum.value ?? 0)));
  const ticks = [top, top / 2, 0].filter((tick) => !wholeNumbers || Number.isInteger(tick));
  const lastIndex = data.reduce((found, datum, index) => (datum.value !== null ? index : found), -1);
  const focused = active === null ? null : data[active];

  return (
    <figure className="grid gap-3">
      <div className="flex gap-2">
        <div className="relative w-12 shrink-0 text-right text-[11px] tabular-nums text-[hsl(var(--muted-foreground))]" style={{ height }} aria-hidden="true">
          {ticks.map((tick) => (
            <span key={tick} className="absolute right-0 -translate-y-1/2" style={{ top: `${(1 - tick / top) * 100}%` }}>
              {formatTick(tick)}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          <div className="relative" style={{ height }} role="group" aria-label={title} onPointerLeave={() => setActive(null)}>
            {ticks.map((tick) => (
              <div key={tick} aria-hidden="true" className={`absolute inset-x-0 h-px ${tick === 0 ? 'bg-[hsl(var(--border))]' : 'bg-[hsl(var(--border))]/60'}`} style={{ top: `${(1 - tick / top) * 100}%` }} />
            ))}
            {reference && reference.value <= top && (
              <div aria-hidden="true" className="absolute inset-x-0 h-px bg-[hsl(var(--foreground))]/45" style={{ top: `${(1 - reference.value / top) * 100}%` }} />
            )}
            <div className="absolute inset-0 flex">
              {data.map((datum, index) => {
                const share = datum.value === null ? 0 : Math.min(1, Math.max(0, datum.value / top));
                return (
                  <button
                    key={datum.key}
                    type="button"
                    className="group relative flex h-full min-w-0 flex-1 items-end justify-center px-[3px] outline-none focus-visible:bg-[hsl(var(--muted))]/60"
                    aria-label={`${datum.label}: ${datum.value === null ? 'no data' : format(datum.value)}${datum.detail ? `, ${datum.detail}` : ''}`}
                    onPointerEnter={() => setActive(index)}
                    onFocus={() => setActive(index)}
                    onBlur={() => setActive(null)}
                  >
                    {datum.value !== null && datum.value > 0 && (
                      <span
                        className={`w-full max-w-6 rounded-t-[4px] bg-[hsl(var(--primary))] transition-opacity ${active === index ? 'opacity-75' : ''}`}
                        style={{ height: `max(${share * 100}%, 2px)` }}
                      />
                    )}
                    {index === lastIndex && active === null && datum.value !== null && (
                      <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap pb-1 text-[11px] font-semibold tabular-nums" style={{ bottom: `${share * 100}%` }}>
                        {format(datum.value)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {focused && active !== null && (
              <div
                role="status"
                className="pointer-events-none absolute z-10 whitespace-nowrap rounded-md border bg-[hsl(var(--card))] px-2.5 py-1.5 text-xs shadow-md"
                style={{
                  bottom: `calc(${Math.min(1, (focused.value ?? 0) / top) * 100}% + 8px)`,
                  left: `${((active + 0.5) / data.length) * 100}%`,
                  transform: `translate(${active === 0 ? '-12%' : active === data.length - 1 ? '-88%' : '-50%'}, 0)`,
                }}
              >
                <p className="font-semibold tabular-nums">{focused.value === null ? 'No data' : format(focused.value)}</p>
                <p className="text-[hsl(var(--muted-foreground))]">
                  {focused.label}
                  {focused.detail ? ` · ${focused.detail}` : ''}
                </p>
              </div>
            )}
          </div>
          <div className="mt-2 flex" aria-hidden="true">
            {data.map((datum) => (
              <span key={datum.key} className="min-w-0 flex-1 truncate text-center text-[11px] text-[hsl(var(--muted-foreground))]">
                {datum.label}
              </span>
            ))}
          </div>
          {reference && (
            <p className="mt-2 flex items-center gap-2 text-[11px] text-[hsl(var(--muted-foreground))]">
              <span aria-hidden="true" className="h-px w-4 bg-[hsl(var(--foreground))]/45" />
              {reference.label}
            </p>
          )}
        </div>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-xs font-medium text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">View as table</summary>
        <table className="mt-2 w-full text-left text-xs">
          <caption className="sr-only">{title}</caption>
          <tbody>
            {data.map((datum) => (
              <tr key={datum.key} className="border-t">
                <th scope="row" className="py-1.5 pr-3 font-medium">
                  {datum.label}
                </th>
                <td className="py-1.5 pr-3 text-right tabular-nums">{datum.value === null ? '—' : format(datum.value)}</td>
                <td className="py-1.5 text-[hsl(var(--muted-foreground))]">{datum.detail ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
