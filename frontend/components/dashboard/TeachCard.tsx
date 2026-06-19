"use client";

import { useStore, type PaperPosition } from "../../lib/store";
import { play } from "../../lib/stream";
import { fmt, usd, FACTOR_LABEL, REGIME_LABEL } from "../../lib/format";

export default function TeachCard() {
  const teach = useStore((s) => s.teach);
  const tick = useStore((s) => s.latestTick);
  const meta = useStore((s) => s.meta);
  const balance = useStore((s) => s.paperBalance);
  const position = useStore((s) => s.paperPosition);
  const takePaper = useStore((s) => s.takePaper);

  if (!teach || !tick) return null;
  const sig = tick.signals.find((s) => s.name === teach.setup);
  const pv = meta?.instrument.point_value ?? 1;

  const resume = () => play();

  const canTrade =
    sig && sig.entry != null && sig.stop != null && sig.target != null && !position;
  const risk = canTrade ? Math.abs(sig!.entry! - sig!.stop!) : 0;
  const rr = canTrade && risk > 0 ? Math.abs(sig!.target! - sig!.entry!) / risk : 0;
  const contracts = risk > 0 ? (0.01 * balance) / (risk * pv) : 0;

  const take = () => {
    if (!canTrade) return resume();
    const p: PaperPosition = {
      strategy: sig!.name,
      label: sig!.label,
      direction: sig!.direction,
      entry: sig!.entry!,
      stop: sig!.stop!,
      target: sig!.target!,
      contracts: Number(contracts.toFixed(2)),
      rr,
      openedAt: tick.ohlc.time.toString(),
      openedBar: tick.bar_index,
      regime: tick.regime,
    };
    takePaper(p);
    play(); // resume — ManualController manages stop/TP as bars stream
  };

  const factors = ["base", "structure", "timing", "pa"];

  return (
    <div className="rounded-xl border-2 border-warn/70 bg-warn/[0.06] p-4 shadow-[0_0_28px_rgba(255,214,0,0.14)]" data-tour="teach">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-warn/20 text-warn">⏸</span>
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-warn">Paused — qualified setup</p>
            <p className="text-sm font-semibold text-text">{sig ? sig.label : teach.setup}</p>
          </div>
        </div>
        {sig && (
          <span className={`chip ${sig.direction === "long" ? "border-profit/50 text-profit" : "border-loss/50 text-loss"}`}>
            {sig.direction.toUpperCase()}
          </span>
        )}
      </div>

      {sig ? (
        <>
          <div className="grid grid-cols-4 gap-2 text-center text-xs">
            <Cell label="Entry" v={fmt(sig.entry)} tone="text-warn" />
            <Cell label="Stop" v={fmt(sig.stop)} tone="text-loss" />
            <Cell label="Target" v={fmt(sig.target)} tone="text-profit" />
            <Cell label="R:R" v={rr ? `${rr.toFixed(1)}:1` : "—"} />
          </div>

          <p className="mt-3 text-[11px] font-medium uppercase tracking-wider text-muted">Why this qualifies</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {factors.map((f) => {
              const on = sig.factors[f];
              return (
                <span key={f} className={`chip ${on ? "border-profit/40 text-profit" : "border-line text-muted"}`}>
                  {on ? "✓" : "✕"} {FACTOR_LABEL[f] ?? f}
                </span>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-text">
            Regime <span className="text-neon">{REGIME_LABEL[tick.regime] ?? tick.regime}</span> ·{" "}
            {sig.evidence}.
            {sig.regime_expectancy_r != null && (
              <> Backtested edge here ≈ <span className="font-mono">{fmt(sig.regime_expectancy_r)}R</span> (synthetic data — proves the logic, not a live edge).</>
            )}
          </p>
          <p className="mt-1 text-[11px] text-muted">
            Risk it like a pro: ≈ {fmt(contracts, 2)} contracts is ~1% of your {usd.format(balance)} paper account. Honor the stop.
          </p>
        </>
      ) : (
        <p className="text-xs text-muted">A qualified setup appeared but its details have scrolled off. Resume to continue.</p>
      )}

      <div className="mt-3 flex gap-2">
        <button
          onClick={take}
          disabled={!canTrade}
          className="flex-1 rounded-lg bg-profit px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110 disabled:opacity-40"
        >
          {position ? "In a trade" : "Take"}
        </button>
        <button onClick={resume} className="btn flex-1">Skip</button>
        <button onClick={resume} className="btn flex-1">Resume</button>
      </div>
      <p className="mt-2 text-[10px] text-muted">Practice / simulation — no real order is sent. Signals aren&apos;t guarantees; not financial advice.</p>
    </div>
  );
}

function Cell({ label, v, tone = "text-text" }: { label: string; v: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-line bg-black/20 p-1.5">
      <p className="text-[9px] uppercase text-muted">{label}</p>
      <p className={`font-mono ${tone}`}>{v}</p>
    </div>
  );
}
