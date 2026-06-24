"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";

import { getJournal, type JournalTrade } from "../../lib/api";
import { fmt, REGIME_LABEL, signColor } from "../../lib/format";

const SnapshotThumb = dynamic(() => import("../../components/SnapshotThumb"), { ssr: false });

type WinFilter = "all" | "win" | "loss";

export default function PatternLibraryPage() {
  const [trades, setTrades] = useState<JournalTrade[]>([]);
  const [err, setErr] = useState("");
  const [strategy, setStrategy] = useState("all");
  const [regime, setRegime] = useState("all");
  const [outcome, setOutcome] = useState("all");
  const [win, setWin] = useState<WinFilter>("all");

  useEffect(() => {
    const ctrl = new AbortController();
    getJournal(ctrl.signal)
      .then((d) => setTrades(d.trades.filter((t) => t.snapshot && t.snapshot.bars.length > 0)))
      .catch((e) => !ctrl.signal.aborted && setErr(e instanceof Error ? e.message : "failed to load"));
    return () => ctrl.abort();
  }, []);

  const strategies = useMemo(() => Array.from(new Set(trades.map((t) => t.strategy))).sort(), [trades]);
  const regimes = useMemo(() => Array.from(new Set(trades.map((t) => t.regime))).sort(), [trades]);

  const filtered = useMemo(
    () =>
      trades.filter((t) => {
        if (strategy !== "all" && t.strategy !== strategy) return false;
        if (regime !== "all" && t.regime !== regime) return false;
        if (outcome !== "all" && t.exit_reason !== outcome) return false;
        if (win === "win" && t.r_multiple <= 0) return false;
        if (win === "loss" && t.r_multiple >= 0) return false;
        return true;
      }),
    [trades, strategy, regime, outcome, win],
  );

  const sel = "rounded-lg border border-line bg-black/30 px-2 py-1.5 text-xs";

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header>
        <h1 className="font-display text-xl font-semibold text-text">Pattern Library</h1>
        <p className="text-sm text-muted">
          A learning archive of the setups you&apos;ve taken — rebuilt from each trade&apos;s captured snapshot. Filter to study a
          group (e.g. all your failed VWAP reverts). Synthetic data; not financial advice.
        </p>
      </header>

      <div className="panel flex flex-wrap items-center gap-2 p-3 text-xs">
        <select value={strategy} onChange={(e) => setStrategy(e.target.value)} className={sel} aria-label="Strategy">
          <option value="all">All strategies</option>
          {strategies.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={regime} onChange={(e) => setRegime(e.target.value)} className={sel} aria-label="Regime">
          <option value="all">All regimes</option>
          {regimes.map((r) => <option key={r} value={r}>{REGIME_LABEL[r] ?? r}</option>)}
        </select>
        <select value={outcome} onChange={(e) => setOutcome(e.target.value)} className={sel} aria-label="Outcome">
          <option value="all">All exits</option>
          <option value="target">Target</option>
          <option value="stop">Stop</option>
          <option value="manual">Manual</option>
        </select>
        <div className="flex gap-1">
          {(["all", "win", "loss"] as WinFilter[]).map((w) => (
            <button key={w} onClick={() => setWin(w)} className={`chip ${win === w ? "border-neon/60 text-neon" : "text-muted"}`}>
              {w === "all" ? "W+L" : w === "win" ? "Wins" : "Losses"}
            </button>
          ))}
        </div>
        <span className="ml-auto text-muted">{filtered.length} setup{filtered.length === 1 ? "" : "s"}</span>
      </div>

      {err && <p className="text-xs text-loss">{err}</p>}
      {!err && trades.length === 0 && (
        <p className="panel p-6 text-center text-sm text-muted">No snapshots yet — take setups on the Practice tab and they&apos;ll archive here.</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((t) => {
          const correct = t.prediction_correct;
          return (
            <div key={t.id} className="panel p-3">
              {t.snapshot && <SnapshotThumb snapshot={t.snapshot} />}
              <div className="mt-2 flex items-center justify-between">
                <p className="text-sm font-semibold text-text">{t.strategy}</p>
                <span className={`chip ${t.direction === "long" ? "border-profit/50 text-profit" : "border-loss/50 text-loss"}`}>{t.direction}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5 text-[10px]">
                <span className="chip border-line text-muted">{REGIME_LABEL[t.regime] ?? t.regime}</span>
                {t.confidence != null && <span className="chip border-line text-muted">conf {t.confidence}/10</span>}
                {t.quality_total != null && <span className="chip border-line text-muted">quality {t.quality_total}/10</span>}
                {correct != null && (
                  <span className={`chip ${correct ? "border-profit/40 text-profit" : "border-loss/40 text-loss"}`}>
                    read {correct ? "✓" : "✗"}
                  </span>
                )}
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px]">
                <span className="text-muted">{t.exit_reason}</span>
                <span className={`font-mono ${signColor(t.r_multiple)}`}>{t.r_multiple >= 0 ? "+" : ""}{fmt(t.r_multiple)}R</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
