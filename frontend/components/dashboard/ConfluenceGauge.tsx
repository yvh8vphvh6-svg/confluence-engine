"use client";

import { FACTOR_LABEL } from "../../lib/format";
import type { ConfluenceView } from "../../lib/store";

export default function ConfluenceGauge({ conf }: { conf: ConfluenceView | null }) {
  const score = conf?.confidence ?? 0;
  const threshold = conf?.threshold ?? 0.65;
  const pct = Math.min(1, score);
  const radius = 46;
  const circ = 2 * Math.PI * radius;
  const dash = circ * pct;
  const color = conf?.execute ? "#00E676" : score >= threshold ? "#FFD600" : "#FF1744";

  return (
    <div className="flex items-center gap-4">
      <div className="relative h-[120px] w-[120px] shrink-0">
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
          <circle cx="60" cy="60" r={radius} fill="none" stroke="#27304a" strokeWidth="9" />
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circ}`}
          />
          {/* threshold tick */}
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke="#E7ECF5"
            strokeWidth="9"
            strokeDasharray={`1.5 ${circ}`}
            strokeDashoffset={-circ * threshold}
            opacity="0.6"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-2xl font-semibold" style={{ color }}>
            {(score * 100).toFixed(0)}
          </span>
          <span className="text-[9px] uppercase tracking-wider text-muted">thr {(threshold * 100).toFixed(0)}</span>
        </div>
      </div>
      <div className="flex-1 space-y-1.5">
        {Object.entries(conf?.score_breakdown ?? {}).map(([k, v]) => {
          const present = v > 0;
          return (
            <div key={k} className="flex items-center justify-between text-[11px]">
              <span className={present ? "text-text" : "text-muted line-through"}>{FACTOR_LABEL[k] ?? k}</span>
              <span className={`font-mono ${present ? "text-neon" : "text-muted"}`}>+{v.toFixed(2)}</span>
            </div>
          );
        })}
        <div className="pt-1 text-[10px] text-muted">
          {conf?.execute ? "Execute: confluence cleared." : `Hold: ${(conf?.missing_factors ?? []).join(", ") || "below threshold"}`}
        </div>
      </div>
    </div>
  );
}
