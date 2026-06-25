"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";

import { getPatternDrill, getPatternStats, scorePatternDrill, type PatternDrill, type PatternScore, type PatternStats } from "../../lib/api";
import { REGIME_LABEL } from "../../lib/format";

const BarsChart = dynamic(() => import("../../components/BarsChart"), { ssr: false });

export default function PatternDrillsPage() {
  const [drill, setDrill] = useState<PatternDrill | null>(null);
  const [result, setResult] = useState<PatternScore | null>(null);
  const [stats, setStats] = useState<PatternStats | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const next = useCallback(() => {
    setDrill(null); setResult(null); setErr("");
    getPatternDrill()
      .then(setDrill)
      .catch((e) => setErr(e instanceof Error ? e.message : "no drill available"));
    getPatternStats().then(setStats).catch(() => undefined);
  }, []);

  useEffect(() => next(), [next]);

  const answer = async (name: string) => {
    if (!drill || result || busy) return;
    setBusy(true);
    try {
      const r = await scorePatternDrill({ scenario: drill.scenario, answer: name });
      setResult(r);
      setStats(r.stats);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "scoring failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-text">Pattern-Matching Drills</h1>
          <p className="text-sm text-muted">Read the chart. Which strategy fits here? The answer is the one whose confluence actually fired.</p>
        </div>
        {stats && stats.n > 0 && (
          <span className="chip border-neon/40 text-neon">accuracy {Math.round((stats.accuracy ?? 0) * 100)}% · {stats.n} drills</span>
        )}
      </header>

      {err && <p className="panel border-loss/40 p-4 text-xs text-loss">{err} <button onClick={next} className="ml-2 underline">retry</button></p>}
      {!err && !drill && <p className="panel p-6 text-center text-sm text-muted">Loading a setup…</p>}

      {drill && (
        <>
          <div className="panel p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="panel-head">{drill.symbol} · {drill.timeframe}</p>
              <span className="chip border-line text-muted">{REGIME_LABEL[drill.regime] ?? drill.regime}</span>
            </div>
            <BarsChart candles={drill.candles} overlays={drill.overlays} height={360} />
            <p className="mt-1 text-[10px] text-muted">Recorded structure to the decision bar — no future leaked. Synthetic practice data.</p>
          </div>

          <div className="panel p-4">
            <p className="text-sm font-semibold text-text">Which strategy fits here?</p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {drill.choices.map((c) => {
                const isOptimal = result && c.name === result.optimal;
                const tone = !result
                  ? "border-line text-text hover:border-neon/50 hover:text-neon"
                  : isOptimal
                    ? "border-profit/60 text-profit"
                    : "border-line text-muted";
                return (
                  <button key={c.name} disabled={!!result || busy} onClick={() => answer(c.name)}
                    className={`rounded-lg border px-2 py-2 text-xs transition ${tone}`}>
                    {c.label}
                  </button>
                );
              })}
            </div>

            {result && (
              <div className={`mt-3 rounded-lg border p-3 text-sm ${result.correct ? "border-profit/50 bg-profit/5" : "border-loss/50 bg-loss/5"}`}>
                <p className={result.correct ? "text-profit" : "text-loss"}>
                  {result.correct ? "Correct ✓" : "Not the best fit ✗"} — optimal: <span className="font-semibold">{result.optimal_label}</span>
                </p>
                {result.why && <p className="mt-1 text-xs text-text">{result.why}</p>}
                <button onClick={next} className="mt-3 rounded-lg bg-neon px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110">Next drill →</button>
              </div>
            )}
          </div>

          {stats && Object.keys(stats.by_strategy).length > 0 && (
            <div className="panel p-4">
              <p className="panel-head mb-2">Accuracy by strategy</p>
              <ul className="grid grid-cols-2 gap-1.5 text-xs sm:grid-cols-3">
                {Object.entries(stats.by_strategy).map(([k, v]) => (
                  <li key={k} className="flex justify-between rounded border border-line bg-surface2/40 px-2 py-1">
                    <span className="text-muted">{k}</span>
                    <span className="font-mono text-text">{Math.round(v.accuracy * 100)}% ({v.n})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
