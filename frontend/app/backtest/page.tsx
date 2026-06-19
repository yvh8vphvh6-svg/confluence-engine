"use client";

import { useState } from "react";

import { runBacktest, type BacktestResult } from "../../lib/api";
import { fmt, pct, pctRaw, usd, signColor } from "../../lib/format";
import ConditionsChecklist from "../../components/ConditionsChecklist";
import EquityCurve from "../../components/dashboard/EquityCurve";

const SYMBOLS = ["MNQ", "MGC"];
const TIMEFRAMES = ["1m", "5m", "15m", "30m", "1h"];
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
const SESSIONS = [
  ["london", "London open (04:00)"],
  ["ny", "NY / Market open (09:30)"],
  ["power_hour", "Power hour (15:00)"],
];

const DEFAULTS = { symbol: "MNQ", timeframe: "5m", strategy: "ORB", session: "ny", seed: 42, days: 120 };

export default function BacktestPage() {
  const [form, setForm] = useState({ ...DEFAULTS });
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const run = async () => {
    setLoading(true);
    setErr("");
    try {
      const r = await runBacktest({
        symbol: form.symbol, timeframe: form.timeframe, strategy: form.strategy,
        session: form.session, seed: form.seed, days: form.days,
      });
      setResult(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "backtest failed");
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setResult(null);
    setErr("");
    setForm({ ...DEFAULTS });
  };

  const m = result?.metrics;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-text">Backtest</h1>
        <p className="text-sm text-muted">
          Run ONE strategy over historical synthetic data from a chosen session start. Same seed → same result.
          Synthetic data — proves the engine, not a live edge.
        </p>
      </header>

      <div className="panel p-4">
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Select label="Instrument" value={form.symbol} onChange={(v) => set("symbol", v)} options={SYMBOLS.map((s) => [s, s])} />
          <Select label="Timeframe" value={form.timeframe} onChange={(v) => set("timeframe", v)} options={TIMEFRAMES.map((s) => [s, s])} />
          <Select label="Strategy" value={form.strategy} onChange={(v) => set("strategy", v)} options={STRATS} />
          <Select label="Session start" value={form.session} onChange={(v) => set("session", v)} options={SESSIONS} />
          <NumberField label="Seed" value={form.seed} onChange={(v) => set("seed", v)} />
          <NumberField label="Days" value={form.days} min={20} max={300} onChange={(v) => set("days", v)} />
        </div>
        <div className="mt-3 flex gap-2">
          <button onClick={run} disabled={loading} className="flex-1 rounded-lg bg-neon px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110 disabled:opacity-50">
            {loading ? "Running…" : "Run backtest"}
          </button>
          <button onClick={reset} disabled={loading} className="btn">Reset</button>
        </div>
        {err && <p className="mt-2 text-xs text-loss">{err}</p>}
      </div>

      {!result && !loading && (
        <div className="panel grid min-h-[160px] place-items-center p-8 text-sm text-muted">
          Pick a strategy and session, then Run. Use Reset to clear and try a different strategy from scratch.
        </div>
      )}

      {result && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-text">{result.label}</span>
            <span className="chip border-line text-muted">{result.symbol} {result.timeframe}</span>
            <span className="chip border-accent/40 text-accent">{result.family}</span>
            <span className="chip border-line text-muted">{result.bars} bars · {result.days}d · seed {result.seed}</span>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="Trades" value={String(m!.n_trades)} tone={m!.sufficient_sample ? "text-text" : "text-warn"} />
                <Stat label="Expectancy R" value={fmt(m!.expectancy_r)} tone={signColor(m!.expectancy_r)} />
                <Stat label="Win rate" value={m!.sufficient_sample ? pct(m!.win_rate) : "—"} />
                <Stat label="Profit factor" value={fmt(m!.profit_factor)} tone={(m!.profit_factor ?? 0) > 1 ? "text-profit" : "text-loss"} />
                <Stat label="Max DD" value={pctRaw(m!.max_drawdown_pct)} tone="text-loss" />
                <Stat label="Sharpe" value={fmt(m!.sharpe)} />
                <Stat label="Net P&L" value={usd.format(m!.net_pnl_dollars ?? 0)} tone={signColor(m!.net_pnl_dollars)} />
                <Stat label="MC p95 DD" value={pct(result.monte_carlo.p95_dd_pct as number | null)} />
              </div>

              <div className="panel p-4">
                <p className="panel-head mb-2">Equity curve (R)</p>
                <EquityCurve curve={result.equity_curve_r} />
                <p className="mt-1 text-[10px] text-muted">
                  final {fmt(result.equity_curve_r.at(-1) ?? 0)} R over {m!.n_trades} trades.
                  Gate: {result.monte_carlo.promote ? <span className="text-profit">passed</span> : <span className="text-loss">not passed</span>}.
                </p>
              </div>

              <div className="panel overflow-hidden">
                <div className="border-b border-line p-3"><p className="panel-head">Trades ({result.trades.length})</p></div>
                <div className="max-h-[320px] overflow-y-auto">
                  <table className="w-full text-right text-[11px]">
                    <thead className="sticky top-0 bg-panel text-[9px] uppercase tracking-wider text-muted">
                      <tr>
                        <th className="px-2 py-1.5 text-left">Entry time</th>
                        <th className="px-2 py-1.5">Dir</th>
                        <th className="px-2 py-1.5">Entry</th>
                        <th className="px-2 py-1.5">Exit</th>
                        <th className="px-2 py-1.5">R</th>
                        <th className="px-2 py-1.5">P&L</th>
                        <th className="px-2 py-1.5 text-left">Exit</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono">
                      {result.trades.length === 0 && (
                        <tr><td colSpan={7} className="px-2 py-4 text-center text-muted">No trades for these settings.</td></tr>
                      )}
                      {[...result.trades].reverse().map((t, i) => (
                        <tr key={i} className="border-t border-line/60">
                          <td className="px-2 py-1 text-left text-muted">{t.entry_time.replace("T", " ").slice(5, 16)}</td>
                          <td className={`px-2 py-1 ${t.direction === "long" ? "text-profit" : "text-loss"}`}>{t.direction}</td>
                          <td className="px-2 py-1">{fmt(t.entry_price)}</td>
                          <td className="px-2 py-1">{fmt(t.exit_price)}</td>
                          <td className={`px-2 py-1 ${signColor(t.r_multiple)}`}>{fmt(t.r_multiple)}</td>
                          <td className={`px-2 py-1 ${signColor(t.pnl_dollars)}`}>{usd.format(t.pnl_dollars)}</td>
                          <td className="px-2 py-1 text-left text-muted">{t.exit_reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="panel h-fit p-4">
              <ConditionsChecklist conditions={result.conditions} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[][] }) {
  return (
    <label className="block">
      <span className="text-[9px] uppercase tracking-wider text-muted">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-black/30 px-2 py-1.5 text-xs">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

function NumberField({ label, value, onChange, min, max }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <label className="block">
      <span className="text-[9px] uppercase tracking-wider text-muted">{label}</span>
      <input type="number" value={value} min={min} max={max} onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full rounded-lg border border-line bg-black/30 px-2 py-1.5 font-mono text-xs" />
    </label>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="panel p-3">
      <p className="text-[9px] uppercase tracking-wider text-muted">{label}</p>
      <p className={`mt-1 font-mono text-base font-semibold ${tone ?? "text-text"}`}>{value}</p>
    </div>
  );
}
