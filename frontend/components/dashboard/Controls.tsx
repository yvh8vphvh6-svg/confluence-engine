"use client";

import { useEffect, useRef, useState } from "react";

import { useStore, ALL_STRATEGIES, type Regime } from "../../lib/store";
import { applyConfig, play, pause, step, stepBack, reset, setSpeed } from "../../lib/stream";

const TIMEFRAMES = ["1m", "5m", "15m", "30m", "1h"];
const SYMBOLS = [
  { v: "MNQ", label: "MNQ · Micro Nasdaq" },
  { v: "MGC", label: "MGC · Micro Gold" },
];
const REGIMES: { v: Regime | null; label: string }[] = [
  { v: null, label: "All regimes" },
  { v: "trending", label: "Trending" },
  { v: "ranging", label: "Ranging" },
  { v: "high_vol", label: "High vol" },
  { v: "low_vol", label: "Low vol" },
];
const SPEEDS = [0.25, 0.5, 1, 2, 4, 8];
const STRAT_LABEL: Record<string, string> = {
  ORB: "ORB",
  FVG_RETEST: "FVG Retest",
  OB_RETEST: "OB Retest",
  BOS_CONTINUATION: "BOS Cont.",
  BREAKOUT_RETEST: "Breakout Retest",
  VWAP_REVERSION: "VWAP Revert",
  EMA_TREND_PULLBACK: "EMA Pullback",
  LIQUIDITY_SWEEP: "Liq. Sweep",
};

export default function Controls() {
  const config = useStore((s) => s.config);
  const setConfig = useStore((s) => s.setConfig);
  const stream = useStore((s) => s.stream);
  const tick = useStore((s) => s.latestTick);
  const meta = useStore((s) => s.meta);
  const [speed, setLocalSpeed] = useState(1);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstRun = useRef(true);

  // debounced config push (cancel/replace in-flight build)
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => applyConfig(config), 280);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [config]);

  const toggleStrategy = (name: string) => {
    const has = config.strategies.includes(name);
    const next = has ? config.strategies.filter((s) => s !== name) : [...config.strategies, name];
    if (next.length === 0) return; // keep at least one armed
    setConfig({ strategies: next });
  };

  const building = stream === "building";

  return (
    <div className="space-y-4">
      <div className="panel p-4">
        <p className="panel-head mb-3">Instrument</p>
        <div className="grid grid-cols-1 gap-2">
          {SYMBOLS.map((s) => (
            <button
              key={s.v}
              onClick={() => setConfig({ symbol: s.v })}
              className={`btn justify-start text-left ${config.symbol === s.v ? "btn-active" : ""}`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <p className="panel-head mb-2 mt-4">Timeframe</p>
        <div className="flex gap-2">
          {TIMEFRAMES.map((t) => (
            <button key={t} onClick={() => setConfig({ timeframe: t })} className={`btn flex-1 ${config.timeframe === t ? "btn-active" : ""}`}>
              {t}
            </button>
          ))}
        </div>
        <p className="panel-head mb-2 mt-4">Regime filter</p>
        <select
          value={config.regime_filter ?? ""}
          onChange={(e) => setConfig({ regime_filter: (e.target.value || null) as Regime | null })}
          className="w-full rounded-lg border border-line bg-black/30 px-3 py-1.5 text-xs"
        >
          {REGIMES.map((r) => (
            <option key={r.label} value={r.v ?? ""}>
              {r.label}
            </option>
          ))}
        </select>
        <p className="panel-head mb-2 mt-4">Seed</p>
        <input
          type="number"
          value={config.seed}
          onChange={(e) => setConfig({ seed: Number(e.target.value) || 0 })}
          className="w-full rounded-lg border border-line bg-black/30 px-3 py-1.5 font-mono text-xs"
        />
      </div>

      <div className="panel p-4">
        <p className="panel-head mb-3">Strategies ({config.strategies.length}/8)</p>
        <div className="grid grid-cols-2 gap-2">
          {ALL_STRATEGIES.map((s) => (
            <button
              key={s}
              onClick={() => toggleStrategy(s)}
              className={`btn text-left ${config.strategies.includes(s) ? "btn-active" : ""}`}
            >
              {STRAT_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="panel p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="panel-head">Replay</p>
          <span className="text-[10px] text-muted">
            {building ? "building…" : tick ? `bar ${tick.metrics.bar_index}/${tick.metrics.bars_total}` : "—"}
          </span>
        </div>
        <div className="flex gap-2">
          <button className="btn flex-1" onClick={stepBack} title="Step back (←)">
            ⏮
          </button>
          <button className="btn flex-1" onClick={() => (tick?.playing ? pause() : play())}>
            {tick?.playing ? "⏸ Pause" : "▶ Play"}
          </button>
          <button className="btn flex-1" onClick={step} title="Step (→)">
            ⏭
          </button>
          <button className="btn" onClick={reset} title="Reset">
            ↺
          </button>
        </div>
        <p className="panel-head mb-2 mt-4">Speed</p>
        <div className="flex gap-2">
          {SPEEDS.map((sp) => (
            <button
              key={sp}
              onClick={() => {
                setLocalSpeed(sp);
                setSpeed(sp);
              }}
              className={`btn flex-1 ${speed === sp ? "btn-active" : ""}`}
            >
              {sp}×
            </button>
          ))}
        </div>
        {meta && (
          <p className="mt-3 text-[10px] text-muted">
            {meta.instrument.name} · pt ${meta.instrument.point_value} · tick {meta.instrument.tick_size} · comm $
            {meta.instrument.commission_per_side}/side
          </p>
        )}
      </div>
    </div>
  );
}
