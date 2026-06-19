"use client";

import { useStore } from "../../lib/store";
import { FACTOR_LABEL, REGIME_LABEL, fmt } from "../../lib/format";

export default function SignalInspector() {
  const sig = useStore((s) => s.inspector);
  const close = () => useStore.getState().openInspector(null);
  const regime = useStore((s) => s.latestTick?.regime);
  if (!sig) return null;

  const c = sig.confluence;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={close}>
      <div
        className="panel max-h-[85vh] w-full max-w-lg overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-neon">Signal Inspector</p>
            <h2 className="text-lg font-semibold text-text">{sig.label}</h2>
            <p className="text-xs text-muted">
              {sig.family} · best regime {REGIME_LABEL[sig.best_regime] ?? sig.best_regime}
            </p>
          </div>
          <button className="btn" onClick={close}>
            ✕
          </button>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg border border-line bg-black/20 p-2">
            <p className="text-[9px] uppercase text-muted">Direction</p>
            <p className={`font-mono text-sm ${sig.direction === "long" ? "text-profit" : sig.direction === "short" ? "text-loss" : "text-muted"}`}>
              {sig.direction}
            </p>
          </div>
          <div className="rounded-lg border border-line bg-black/20 p-2">
            <p className="text-[9px] uppercase text-muted">Order</p>
            <p className="font-mono text-sm text-text">{sig.order_type ?? "—"}</p>
          </div>
          <div className="rounded-lg border border-line bg-black/20 p-2">
            <p className="text-[9px] uppercase text-muted">Confidence</p>
            <p className="font-mono text-sm text-text">{c ? `${(c.confidence * 100).toFixed(0)}%` : "—"}</p>
          </div>
        </div>

        {sig.entry != null && (
          <div className="mb-4 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border border-line bg-black/20 p-2">
              <p className="text-[9px] uppercase text-muted">Entry</p>
              <p className="font-mono text-sm text-warn">{fmt(sig.entry)}</p>
            </div>
            <div className="rounded-lg border border-line bg-black/20 p-2">
              <p className="text-[9px] uppercase text-muted">Stop</p>
              <p className="font-mono text-sm text-loss">{fmt(sig.stop)}</p>
            </div>
            <div className="rounded-lg border border-line bg-black/20 p-2">
              <p className="text-[9px] uppercase text-muted">Target</p>
              <p className="font-mono text-sm text-profit">{fmt(sig.target)}</p>
            </div>
          </div>
        )}

        <p className="panel-head mb-2">Rule stack</p>
        <p className="mb-4 rounded-lg border border-line bg-black/20 p-3 font-mono text-xs text-text">
          {sig.reason || "No active setup this bar."}
        </p>

        <p className="panel-head mb-2">Confluence factors</p>
        <div className="mb-4 space-y-1.5">
          {["base", "structure", "timing", "pa"].map((k) => {
            const present = sig.factors[k];
            const weight = c?.score_breakdown[k] ?? 0;
            return (
              <div key={k} className="flex items-center justify-between rounded-lg border border-line bg-black/20 px-3 py-1.5 text-xs">
                <span className={present ? "text-text" : "text-muted"}>
                  {present ? "✓" : "✕"} {FACTOR_LABEL[k] ?? k}
                </span>
                <span className={`font-mono ${present ? "text-neon" : "text-muted"}`}>+{weight.toFixed(2)}</span>
              </div>
            );
          })}
        </div>

        {c && c.missing_factors.length > 0 && (
          <p className="mb-4 text-xs text-warn">
            Missing: {c.missing_factors.map((f) => FACTOR_LABEL[f] ?? f).join(", ")} — needs ≥
            {(c.threshold * 100).toFixed(0)}% to execute.
          </p>
        )}

        <p className="panel-head mb-2">Historical win rate — current regime ({REGIME_LABEL[regime ?? ""] ?? regime})</p>
        <p className="rounded-lg border border-line bg-black/20 p-3 text-xs">
          {sig.regime_sample >= 100 && sig.regime_win_rate != null ? (
            <span className="text-text">
              {(sig.regime_win_rate * 100).toFixed(1)}% over {sig.regime_sample} backtested trades.
            </span>
          ) : (
            <span className="text-warn">
              Insufficient sample (n={sig.regime_sample}) in this regime — no win rate shown.
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
