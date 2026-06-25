"use client";

import type { Correlation } from "../../lib/api";

// Renders a sample-gated correlation view (B3 emotional-state, E2 decision-speed).
// Mirrors the calibration honesty rules: a bucket needs >= min_n trades to show,
// the whole view is flagged provisional under ~30, else "insufficient data".
function Buckets({ title, c, suffix = "" }: { title: string; c: Correlation | null; suffix?: string }) {
  if (!c) return null;
  const shown = c.buckets.filter((b) => b.shown);
  if (!c.available || shown.length === 0) {
    return (
      <div className="rounded-lg border border-line bg-surface2/40 p-3 text-xs text-muted">
        {title} unlocks at {c.min_n} trades per group{c.n ? ` — ${c.n} logged so far` : ""}. Keep practicing to surface it.
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-line bg-surface2/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="panel-head">{title}</p>
        {c.provisional && <span className="chip border-warn/40 text-warn">provisional · n={c.n}</span>}
      </div>
      <ul className="space-y-1.5 text-xs">
        {shown.map((b) => {
          const wr = b.win_rate ?? 0;
          const er = b.expectancy_r ?? 0;
          return (
            <li key={b.key} className="flex flex-wrap items-baseline justify-between gap-x-2">
              <span className="text-text">
                {b.key}
                {suffix}: {b.won}/{b.n} won (<span className="font-mono">{Math.round(wr * 100)}%</span>)
              </span>
              <span className={`font-mono ${er >= 0 ? "text-profit" : "text-loss"}`}>
                {er >= 0 ? "+" : ""}{er.toFixed(2)}R
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[10px] text-muted">Observed correlation from your real logs — not advice.</p>
    </div>
  );
}

export default function DisciplineInsights({ emotion, speed }: { emotion: Correlation | null; speed: Correlation | null }) {
  return (
    <div className="space-y-2">
      <Buckets title="Results by pre-session state" c={emotion} />
      <Buckets title="Results by decision speed" c={speed} />
    </div>
  );
}
