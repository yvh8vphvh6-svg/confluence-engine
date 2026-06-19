"use client";

import { useStore, type StrategySignalView } from "../../lib/store";

function dirChip(s: StrategySignalView) {
  if (!s.active) return <span className="chip border-line text-muted">idle</span>;
  if (s.blocked_by_regime) return <span className="chip border-warn/40 text-warn">regime block</span>;
  const exec = s.confluence?.execute;
  const tone = s.direction === "long" ? "border-profit/40 text-profit" : "border-loss/40 text-loss";
  return (
    <span className={`chip ${tone}`}>
      {s.direction}
      {exec ? " ✓" : ""}
    </span>
  );
}

export default function StrategySignals() {
  const tick = useStore((s) => s.latestTick);
  const openInspector = useStore((s) => s.openInspector);
  const active = tick?.active_strategy;
  const signals = [...(tick?.signals ?? [])].sort(
    (a, b) => (b.confluence?.confidence ?? 0) - (a.confluence?.confidence ?? 0),
  );

  return (
    <div className="panel p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="panel-head">Strategy signals</p>
        <span className="text-[10px] text-muted">click a row → rule stack</span>
      </div>
      <div className="space-y-1.5">
        {signals.length === 0 && <p className="text-xs text-muted">Waiting for stream…</p>}
        {signals.map((s) => (
          <button
            key={s.name}
            onClick={() => openInspector(s)}
            className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition hover:border-neon/40 ${
              s.name === active ? "border-neon/50 bg-neon/5" : "border-line bg-black/20"
            }`}
          >
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-text">{s.label}</p>
              <p className="text-[10px] text-muted">
                {s.family} · {s.confluence ? `${(s.confluence.confidence * 100).toFixed(0)}%` : "—"}
                {s.regime_sample >= 100 && s.regime_win_rate != null
                  ? ` · regime wr ${(s.regime_win_rate * 100).toFixed(0)}%`
                  : ""}
              </p>
            </div>
            {dirChip(s)}
          </button>
        ))}
      </div>
    </div>
  );
}
