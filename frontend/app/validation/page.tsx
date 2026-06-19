"use client";

import { useEffect, useState } from "react";

import { getValidation, runBacktest, type ValidationData, type BacktestResult } from "../../lib/api";
import { fmt, pct, pctRaw, signColor, REGIME_LABEL } from "../../lib/format";
import ConditionsChecklist from "../../components/ConditionsChecklist";

const STRATS = [
  ["ORB", "Opening Range Breakout"],
  ["FVG_RETEST", "Fair Value Gap Retest"],
  ["OB_RETEST", "Order Block Mitigation"],
  ["BOS_CONTINUATION", "Break of Structure"],
  ["BREAKOUT_RETEST", "PDH/PDL Break & Retest"],
  ["VWAP_REVERSION", "VWAP Mean Reversion"],
  ["EMA_TREND_PULLBACK", "EMA Trend Pullback"],
  ["LIQUIDITY_SWEEP", "Liquidity Sweep"],
];

export default function ValidationPage() {
  const [summary, setSummary] = useState<ValidationData | null>(null);
  const [symbol, setSymbol] = useState("MNQ");
  const [timeframe, setTimeframe] = useState("5m");
  const [results, setResults] = useState<Record<string, BacktestResult>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    const ctrl = new AbortController();
    getValidation(ctrl.signal).then(setSummary).catch(() => undefined);
    return () => ctrl.abort();
  }, []);

  const runOne = async (strategy: string) => {
    setBusy(strategy);
    setErr("");
    try {
      const r = await runBacktest({ symbol, timeframe, strategy, days: 150, session: "london" });
      setResults((prev) => ({ ...prev, [strategy]: r }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "validation run failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-text">Validation</h1>
        <p className="text-sm text-muted">
          Pressure-test each strategy. &quot;Run validation&quot; runs a fresh deterministic backtest and shows a
          conditions-met checklist plus drawdown and the Monte-Carlo gate. A strategy passes only with n≥100 AND
          Monte-Carlo p95 drawdown &lt;15% — deliberately hard. (Learning quizzes live in the Learn lessons.)
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="panel p-4">
          <p className="panel-head mb-1">Determinism</p>
          <p className="text-sm text-profit">Reproducible ✓</p>
          <p className="mt-1 text-[11px] text-muted">
            <code className="text-text">python -m backend.run_backtest --verify</code> re-runs the sweep twice
            in-process and once in a fresh subprocess (different PYTHONHASHSEED) and asserts identical metrics.
          </p>
        </div>
        <div className="panel p-4">
          <p className="panel-head mb-1">Promotion gate</p>
          <p className="font-mono text-lg font-semibold text-text">{summary?.promoted ?? "—"}<span className="text-muted">/{summary?.total_runs ?? "—"}</span></p>
          <p className="mt-1 text-[11px] text-muted">runs pass MC p95 DD &lt;15% AND n≥100.</p>
        </div>
        <div className="panel p-4">
          <p className="panel-head mb-1">Sufficient sample</p>
          <p className="font-mono text-lg font-semibold text-text">{summary?.sufficient ?? "—"}<span className="text-muted">/{summary?.total_runs ?? "—"}</span></p>
          <p className="mt-1 text-[11px] text-muted">runs with n≥100 (below that = insufficient, never faked).</p>
        </div>
      </div>

      <div className="panel flex flex-wrap items-center gap-3 p-3">
        <span className="text-xs text-muted">Run validations on:</span>
        <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className="rounded-lg border border-line bg-black/30 px-2 py-1 text-xs">
          {["MNQ", "MGC"].map((s) => <option key={s}>{s}</option>)}
        </select>
        <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)} className="rounded-lg border border-line bg-black/30 px-2 py-1 text-xs">
          {["1m", "5m", "15m", "30m", "1h"].map((t) => <option key={t}>{t}</option>)}
        </select>
        {err && <span className="text-xs text-loss">{err}</span>}
      </div>

      <div className="space-y-3">
        {STRATS.map(([key, label]) => {
          const r = results[key];
          const m = r?.metrics;
          return (
            <div key={key} className="panel p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-text">{label}</p>
                  <p className="text-[11px] text-muted">{key}</p>
                </div>
                <div className="flex items-center gap-2">
                  {r && (
                    <span className={`chip ${r.monte_carlo.promote ? "border-profit/50 text-profit" : "border-loss/40 text-loss"}`}>
                      {r.monte_carlo.promote ? "PASSED gate" : "did not pass"}
                    </span>
                  )}
                  <button onClick={() => runOne(key)} disabled={busy === key} className="btn">
                    {busy === key ? "Running…" : r ? "Re-run" : "Run validation"}
                  </button>
                </div>
              </div>

              {r && m && (
                <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_320px]">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 self-start">
                    <Mini label="Trades" v={String(m.n_trades)} tone={m.sufficient_sample ? "text-text" : "text-warn"} />
                    <Mini label="Expectancy R" v={fmt(m.expectancy_r)} tone={signColor(m.expectancy_r)} />
                    <Mini label="Win rate" v={m.sufficient_sample ? pct(m.win_rate) : "—"} />
                    <Mini label="Max DD" v={pctRaw(m.max_drawdown_pct)} tone="text-loss" />
                    <Mini label="Profit factor" v={fmt(m.profit_factor)} tone={(m.profit_factor ?? 0) > 1 ? "text-profit" : "text-loss"} />
                    <Mini label="Sharpe" v={fmt(m.sharpe)} />
                    <Mini label="MC p95 DD" v={pct(r.monte_carlo.p95_dd_pct as number | null)} />
                    <Mini label="Best regime" v={REGIME_LABEL[r.best_regime] ?? r.best_regime} />
                  </div>
                  <div className="rounded-lg border border-line bg-black/10 p-3">
                    <ConditionsChecklist conditions={r.conditions} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-center text-[11px] text-muted">
        Synthetic data — a passed gate proves the engine logic is sound, not that the strategy has a live edge.
      </p>
    </div>
  );
}

function Mini({ label, v, tone }: { label: string; v: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-line bg-black/20 p-2">
      <p className="text-[9px] uppercase tracking-wider text-muted">{label}</p>
      <p className={`mt-0.5 font-mono text-sm font-semibold ${tone ?? "text-text"}`}>{v}</p>
    </div>
  );
}
