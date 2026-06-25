"use client";

import { useEffect, useState } from "react";

import { getRiskCounterfactual, type RiskCounterfactual } from "../../lib/api";

function Curve({ actual, model }: { actual: number[]; model: number[] }) {
  const W = 640;
  const H = 240;
  const pad = 28;
  const all = [...actual, ...model, 0];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1;
  const n = Math.max(actual.length, model.length);
  const x = (i: number) => pad + (i / Math.max(1, n - 1)) * (W - 2 * pad);
  const y = (v: number) => H - pad - ((v - min) / span) * (H - 2 * pad);
  const path = (arr: number[]) => arr.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const zeroY = y(0);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Equity curve: actual vs no-stop model">
      <line x1={pad} y1={zeroY} x2={W - pad} y2={zeroY} stroke="rgba(138,147,168,0.4)" strokeDasharray="3 3" />
      <path d={path(model)} fill="none" stroke="#FF1744" strokeWidth="2" />
      <path d={path(actual)} fill="none" stroke="#00E676" strokeWidth="2" />
      <text x={pad} y={16} fill="#00E676" fontSize="11">— Actual (stops honored)</text>
      <text x={pad + 180} y={16} fill="#FF1744" fontSize="11">— No-stop model</text>
    </svg>
  );
}

export default function RiskLabPage() {
  const [data, setData] = useState<RiskCounterfactual | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    const ctrl = new AbortController();
    getRiskCounterfactual(ctrl.signal)
      .then(setData)
      .catch((e) => !ctrl.signal.aborted && setErr(e instanceof Error ? e.message : "failed to load"));
    return () => ctrl.abort();
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header>
        <h1 className="font-display text-xl font-semibold text-text">Risk Lab — why stops matter</h1>
        <p className="text-sm text-muted">Your real equity (stops honored) against a model where every loss runs without a stop.</p>
      </header>

      {err && <p className="panel border-loss/40 p-4 text-xs text-loss">{err}</p>}
      {!err && !data && <p className="panel p-6 text-center text-sm text-muted">Loading…</p>}

      {data && !data.available && (
        <div className="panel p-6 text-center">
          <p className="text-sm text-text">Insufficient data</p>
          <p className="mt-1 text-xs text-muted">{data.note}</p>
        </div>
      )}

      {data && data.available && (
        <>
          <div className="panel p-4">
            <p className="text-lg font-semibold text-text">{data.headline}</p>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              <Stat label="Your curve" v={`${data.actual_r >= 0 ? "+" : ""}${data.actual_r}R`} tone={data.actual_r >= 0 ? "text-profit" : "text-loss"} />
              <Stat label="No-stop model" v={`${data.model_r >= 0 ? "+" : ""}${data.model_r}R`} tone="text-loss" />
              <Stat label="Gap" v={`${data.gap_r >= 0 ? "+" : ""}${data.gap_r}R`} tone="text-warn" />
            </div>
          </div>

          <div className="panel p-4">
            <Curve actual={data.actual_curve} model={data.model_curve} />
          </div>

          <div className="panel border-warn/30 p-4">
            <p className="panel-head mb-1 text-warn">Read this as a model, not a record</p>
            <p className="text-xs text-text">{data.note}</p>
            <p className="mt-2 text-xs text-muted">
              Across {data.n} trades, {data.losers} were losers. The point isn&apos;t the exact number — it&apos;s the shape: an
              unstopped account compounds losses, while a stopped one caps each one. Honoring the stop is what keeps you in the game.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, v, tone }: { label: string; v: string; tone: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface2/40 p-2">
      <p className="text-[9px] uppercase tracking-wider text-muted">{label}</p>
      <p className={`mt-0.5 font-mono text-base font-semibold ${tone}`}>{v}</p>
    </div>
  );
}
