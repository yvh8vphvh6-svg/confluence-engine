"use client";

import { useMemo } from "react";

import { useStore } from "../../lib/store";
import { usd, fmt, pctRaw, signColor } from "../../lib/format";

export default function PaperAccount() {
  const manualMode = useStore((s) => s.manualMode);
  const setManualMode = useStore((s) => s.setManualMode);
  const start = useStore((s) => s.paperStart);
  const balance = useStore((s) => s.paperBalance);
  const position = useStore((s) => s.paperPosition);
  const trades = useStore((s) => s.paperTrades);
  const resetPaper = useStore((s) => s.resetPaper);
  const tick = useStore((s) => s.latestTick);
  const meta = useStore((s) => s.meta);

  const stats = useMemo(() => {
    const n = trades.length;
    if (n === 0) return { n, win: 0, exp: 0 };
    const wins = trades.filter((t) => t.r_multiple > 0).length;
    const exp = trades.reduce((a, t) => a + t.r_multiple, 0) / n;
    return { n, win: (wins / n) * 100, exp };
  }, [trades]);

  const pv = meta?.instrument.point_value ?? 1;
  const unreal =
    position && tick
      ? (tick.ohlc.close - position.entry) * (position.direction === "long" ? 1 : -1) * pv * position.contracts
      : 0;
  const equity = balance + unreal;

  return (
    <div className="panel p-4" data-tour="paper">
      <div className="mb-3 flex items-center justify-between">
        <p className="panel-head">Your paper account</p>
        <label className="flex items-center gap-2 text-[11px] text-muted">
          <input
            type="checkbox"
            checked={manualMode}
            onChange={(e) => setManualMode(e.target.checked)}
            className="accent-[#00E676]"
          />
          Manual mode
        </label>
      </div>

      {!manualMode ? (
        <p className="text-xs text-muted">
          Turn on manual mode to place your own paper trades from the entry ticket. Tracked separately from the
          engine&apos;s auto-sim.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Equity" value={usd.format(equity)} />
            <Stat
              label="P&L"
              value={usd.format(equity - start)}
              tone={signColor(equity - start)}
            />
            <Stat label="Your trades" value={String(stats.n)} />
            <Stat label="Win rate" value={stats.n ? pctRaw(stats.win) : "—"} />
            <Stat label="Expectancy (R)" value={stats.n ? fmt(stats.exp) : "—"} tone={signColor(stats.exp)} />
            <Stat label="Open" value={position ? "1" : "0"} />
          </div>
          <button onClick={resetPaper} className="btn mt-3 w-full">
            Reset paper account
          </button>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-line bg-black/20 p-2.5">
      <p className="text-[9px] uppercase tracking-wider text-muted">{label}</p>
      <p className={`mt-1 font-mono text-sm font-semibold ${tone ?? "text-text"}`}>{value}</p>
    </div>
  );
}
