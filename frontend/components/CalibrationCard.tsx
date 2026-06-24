"use client";

import type { Calibration } from "../lib/api";

function verdictTone(v: string | null): string {
  if (!v) return "text-muted";
  if (v.includes("over")) return "text-loss";
  if (v.includes("under")) return "text-warn";
  return "text-profit";
}

export default function CalibrationCard({ calibration, compact = false }: { calibration: Calibration | null; compact?: boolean }) {
  if (!calibration || !calibration.available) {
    const have = calibration?.n ?? 0;
    return (
      <div className="rounded-lg border border-line bg-surface2/40 p-3 text-xs text-muted">
        Confidence calibration unlocks at 10 graded trades — you have {have}. State a confidence on your reads to build it.
      </div>
    );
  }
  const active = calibration.buckets.filter((b) => b.n > 0);
  return (
    <div className={compact ? "" : "rounded-lg border border-line bg-surface2/40 p-3"}>
      <div className="mb-2 flex items-center justify-between">
        <p className="panel-head">Confidence calibration</p>
        {calibration.provisional && <span className="chip border-warn/40 text-warn">provisional · n={calibration.n}</span>}
      </div>
      <ul className="space-y-1.5">
        {active.map((b) => {
          const wr = b.win_rate ?? 0;
          return (
            <li key={b.band} className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs">
              <span className="text-text">
                At <span className="font-mono">{b.band}</span> confidence: {b.n} trade{b.n === 1 ? "" : "s"}, {b.won} won (
                <span className="font-mono">{Math.round(wr * 100)}%</span>)
              </span>
              <span className={`font-medium ${verdictTone(b.verdict)}`}>{b.verdict}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[10px] text-muted">Stated confidence vs your real win rate. Computed from logged reads — never invented.</p>
    </div>
  );
}
