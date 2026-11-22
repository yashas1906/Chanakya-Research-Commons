"use client";

import { useId, useRef, useState } from "react";
import { clamp, cx, fmtInt } from "@/lib/format";

/* -------------------------------------------------------------------------- */
/* Sparkline: one measure, one axis, hover crosshair + tooltip.               */
/* Small multiples (one per measure) are used instead of a dual-axis chart.   */
/* -------------------------------------------------------------------------- */

export interface SparkPoint {
  label: string;
  value: number;
}

const W = 320;
const H = 72;
const PAD_X = 4;
const PAD_Y = 8;

export function Sparkline({ points, name, className }: { points: SparkPoint[]; name: string; className?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const gid = useId();

  if (points.length === 0) return null;

  const max = Math.max(...points.map((p) => p.value), 1);
  const rawMin = Math.min(...points.map((p) => p.value));
  // Line charts need not start at zero; pad the domain so month-to-month movement is legible.
  const span = max - rawMin;
  const lo = span === 0 ? Math.max(0, rawMin - 1) : Math.max(0, rawMin - span * 0.25);
  const hi = span === 0 ? max + 1 : max + span * 0.05;
  const x = (i: number) => PAD_X + (points.length === 1 ? (W - 2 * PAD_X) / 2 : (i / (points.length - 1)) * (W - 2 * PAD_X));
  const y = (v: number) => H - PAD_Y - ((v - lo) / (hi - lo)) * (H - 2 * PAD_Y);
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${H - PAD_Y} L${x(0).toFixed(1)},${H - PAD_Y} Z`;

  const onMove = (e: React.MouseEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const frac = clamp((e.clientX - r.left) / r.width, 0, 1);
    setHover(Math.round(frac * (points.length - 1)));
  };

  const active = hover ?? points.length - 1;
  const hp = points[active];

  return (
    <div className={cx("relative", className)}>
      <div
        ref={ref}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        className="relative"
        role="img"
        aria-label={`${name} by month. Latest ${fmtInt(points[points.length - 1].value)}, peak ${fmtInt(max)}.`}
      >
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-[72px] w-full overflow-visible" preserveAspectRatio="none">
          <defs>
            <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#18181B" stopOpacity="0.10" />
              <stop offset="100%" stopColor="#18181B" stopOpacity="0" />
            </linearGradient>
          </defs>
          <line x1={PAD_X} x2={W - PAD_X} y1={H - PAD_Y} y2={H - PAD_Y} stroke="#E7E5E4" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          <path d={area} fill={`url(#${gid})`} />
          <path d={line} fill="none" stroke="#18181B" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          {hover !== null && (
            <line x1={x(active)} x2={x(active)} y1={PAD_Y - 4} y2={H - PAD_Y} stroke="#A8A29E" strokeWidth="1" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        {/* Marker is HTML so it stays circular under the non-uniform SVG scaling. */}
        <span
          aria-hidden
          className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-paper bg-ink"
          style={{ left: `${(x(active) / W) * 100}%`, top: `${(y(hp.value) / H) * 100}%` }}
        />
        {hover !== null && (
          <div
            className="pointer-events-none absolute -top-9 z-10 -translate-x-1/2 whitespace-nowrap rounded-md border border-stone-200/90 bg-paper px-2 py-1 text-[11.5px] shadow-[0_4px_12px_-6px_rgba(24,24,27,0.25)]"
            style={{ left: `${clamp((x(active) / W) * 100, 12, 88)}%` }}
          >
            <span className="text-stone-500">{hp.label}</span> <span className="num font-medium text-ink">{fmtInt(hp.value)}</span>
          </div>
        )}
      </div>
      <div className="num mt-1 flex justify-between text-[10.5px] text-stone-400">
        <span>{points[0].label}</span>
        <span>{points[points.length - 1].label}</span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Matrix heatmap: sequential, single hue (ink), numbers printed in cells.    */
/* -------------------------------------------------------------------------- */

export interface MatrixCell {
  row: string;
  col: string;
  value: number;
}

export function MatrixHeatmap({
  rows,
  cols,
  cells,
  rowLabel,
  colLabel,
  format = (n: string) => n,
}: {
  rows: string[];
  cols: string[];
  cells: MatrixCell[];
  rowLabel: string;
  colLabel: string;
  format?: (name: string) => string;
}) {
  const lookup = new Map(cells.map((c) => [`${c.row}|${c.col}`, c.value]));
  const max = Math.max(...cells.map((c) => c.value), 1);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-separate border-spacing-[3px] text-center" aria-label={`${rowLabel} to ${colLabel} interaction matrix`}>
        <thead>
          <tr>
            <th className="w-28 pb-1 text-left align-bottom">
              <span className="eyebrow">
                {rowLabel} ↓ · {colLabel} →
              </span>
            </th>
            {cols.map((c) => (
              <th key={c} scope="col" className="px-1 pb-1 align-bottom text-[11px] font-medium leading-tight text-stone-500">
                {format(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r}>
              <th scope="row" className="pr-2 text-left text-[11.5px] font-medium leading-tight text-stone-600">
                {format(r)}
              </th>
              {cols.map((c) => {
                const v = lookup.get(`${r}|${c}`);
                const intensity = v ? v / max : 0;
                const alpha = v ? 0.07 + 0.83 * Math.sqrt(intensity) : 0;
                const dark = alpha > 0.5;
                return (
                  <td
                    key={c}
                    title={v !== undefined ? `${r} → ${c}: ${fmtInt(v)} interactions` : `${r} → ${c}: no recorded interactions`}
                    className={cx(
                      "num h-10 rounded-md text-[12px] transition-transform duration-150 hover:scale-[1.04]",
                      v === undefined ? "bg-sunken/60 text-stone-300" : dark ? "text-white" : "text-stone-700",
                    )}
                    style={v !== undefined ? { backgroundColor: `rgba(24,24,27,${alpha.toFixed(3)})` } : undefined}
                  >
                    {v !== undefined ? fmtInt(v) : "·"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
