"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";

import {
  getDecision, scoreDecision, getDecisionStats,
  type DecisionScenario, type DecisionResult, type DecisionStats,
} from "../../lib/api";
import { fmt, pctRaw, REGIME_LABEL } from "../../lib/format";
import { plainDrillOutcome } from "../../lib/teach";
import { Gloss } from "../../components/Gloss";

const DrillChart = dynamic(() => import("../../components/DrillChart"), { ssr: false });

const DIFFS = [
  ["beginner", "Beginner — clean trend"],
  ["intermediate", "Intermediate — ranging"],
  ["advanced", "Advanced — choppy / high-vol"],
];
type Action = "buy" | "sell" | "wait" | "pass";

export default function DrillsPage() {
  const [difficulty, setDifficulty] = useState("beginner");
  const [sc, setSc] = useState<DecisionScenario | null>(null);
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState<Action | null>(null);
  const [why, setWhy] = useState("");
  const [stopPts, setStopPts] = useState(0);
  const [tpPts, setTpPts] = useState(0);
  const [result, setResult] = useState<DecisionResult | null>(null);
  const [stats, setStats] = useState<DecisionStats | null>(null);
  const [err, setErr] = useState("");

  const loadStats = useCallback(() => { getDecisionStats().then(setStats).catch(() => undefined); }, []);
  useEffect(() => { loadStats(); }, [loadStats]);

  const newScenario = async () => {
    setLoading(true); setErr(""); setResult(null); setAction(null); setWhy("");
    try {
      const s = await getDecision(difficulty);
      setSc(s);
      setStopPts(s.suggested_stop_pts);
      setTpPts(s.suggested_target_pts);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "could not load a scenario");
    } finally {
      setLoading(false);
    }
  };

  const submit = async () => {
    if (!sc || !action) return;
    setLoading(true); setErr("");
    const dir = action === "buy" ? 1 : action === "sell" ? -1 : 0;
    const body: Record<string, unknown> = { id: sc.id, action, why };
    if (dir !== 0) {
      body.stop = sc.last_close - dir * stopPts;
      body.target = sc.last_close + dir * tpPts;
    }
    try {
      const r = await scoreDecision(body);
      setResult(r);
      setStats(r.stats);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "scoring failed");
    } finally {
      setLoading(false);
    }
  };

  const revealCandles = result && sc ? [...sc.candles, ...result.reveal] : sc?.candles ?? [];
  const dir = action === "buy" ? 1 : action === "sell" ? -1 : 0;
  const entryLine = sc && action && dir !== 0 ? sc.last_close : null;
  const stopLine = sc && dir !== 0 ? sc.last_close - dir * stopPts : null;
  const tgtLine = sc && dir !== 0 ? sc.last_close + dir * tpPts : null;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text">Decision-Point Training</h1>
          <p className="text-sm text-muted">
            The chart pauses at a decision. Commit BEFORE the reveal: pick an action, say WHY, set your stop &amp;
            target — then see the real outcome and score on direction + risk. Synthetic data; practice only.
          </p>
        </div>
        {stats && stats.n > 0 && (
          <div className="panel px-3 py-2 text-right">
            <p className="text-[10px] uppercase tracking-wider text-muted">Your accuracy</p>
            <p className="font-mono text-lg text-text">{pctRaw((stats.accuracy ?? 0) * 100)} <span className="text-xs text-muted">· {stats.n} decisions · avg {fmt(stats.avg_score, 0)}/100</span></p>
          </div>
        )}
      </header>

      <div className="panel flex flex-wrap items-center gap-2 p-3">
        <span className="text-xs text-muted">Difficulty:</span>
        {DIFFS.map(([v, l]) => (
          <button key={v} onClick={() => setDifficulty(v)} className={`chip ${difficulty === v ? "border-neon/60 text-neon" : "text-muted"}`}>{l}</button>
        ))}
        <button onClick={newScenario} disabled={loading} className="ml-auto rounded-lg bg-neon px-4 py-1.5 text-sm font-semibold text-black hover:brightness-110 disabled:opacity-50">
          {loading ? "…" : sc ? "New scenario" : "Start"}
        </button>
      </div>
      {err && <p className="text-xs text-loss">{err}</p>}

      {!sc && !loading && (
        <div className="panel grid min-h-[200px] place-items-center text-sm text-muted">
          Pick a difficulty and hit Start. You&apos;ll see a chart paused at a decision point.
        </div>
      )}

      {sc && (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="panel min-w-0 overflow-hidden">
            <div className="flex items-center justify-between border-b border-line p-3 text-xs">
              <span className="font-semibold text-text">{sc.symbol} {sc.timeframe}</span>
              <span className="chip border-line text-muted">{REGIME_LABEL[sc.regime] ?? sc.regime}</span>
              <span className="text-muted">{result ? "revealed" : "decide now →"}</span>
            </div>
            <div className="bg-background p-2">
              <DrillChart candles={revealCandles} entry={entryLine} stop={stopLine} target={tgtLine} />
            </div>
          </div>

          <div className="panel h-fit p-4">
            {!result ? (
              <>
                <p className="panel-head mb-2">Your decision</p>
                <div className="grid grid-cols-2 gap-2">
                  {(["buy", "sell", "wait", "pass"] as Action[]).map((a) => (
                    <button key={a} onClick={() => setAction(a)}
                      className={`btn ${action === a ? "btn-active" : ""} ${a === "buy" ? "text-profit" : a === "sell" ? "text-loss" : ""}`}>
                      {a.toUpperCase()}
                    </button>
                  ))}
                </div>
                {(action === "buy" || action === "sell") && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="text-[9px] uppercase tracking-wider text-muted">Stop (pts)</span>
                      <input type="number" value={stopPts} min={0} step="0.25" onChange={(e) => setStopPts(Math.max(0, Number(e.target.value)))}
                        className="mt-1 w-full rounded-lg border border-line bg-black/30 px-2 py-1 font-mono text-xs" />
                    </label>
                    <label className="block">
                      <span className="text-[9px] uppercase tracking-wider text-muted">Target (pts)</span>
                      <input type="number" value={tpPts} min={0} step="0.25" onChange={(e) => setTpPts(Math.max(0, Number(e.target.value)))}
                        className="mt-1 w-full rounded-lg border border-line bg-black/30 px-2 py-1 font-mono text-xs" />
                    </label>
                    <p className="col-span-2 text-[10px] text-muted">
                      R:R {stopPts > 0 ? (tpPts / stopPts).toFixed(1) : "—"}:1 · drawn on the chart before you commit.
                    </p>
                  </div>
                )}
                <label className="mt-3 block">
                  <span className="text-[9px] uppercase tracking-wider text-muted">Why? (your read)</span>
                  <textarea value={why} onChange={(e) => setWhy(e.target.value)} placeholder="State your reasoning before the reveal…"
                    className="mt-1 h-20 w-full rounded-lg border border-line bg-black/30 px-2 py-1.5 text-xs" />
                </label>
                <button onClick={submit} disabled={!action || loading}
                  className="mt-3 w-full rounded-lg bg-neon px-4 py-2 text-sm font-semibold text-black hover:brightness-110 disabled:opacity-40">
                  Reveal &amp; score
                </button>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="panel-head">Result</p>
                  <span className={`font-mono text-lg font-semibold ${result.total_score >= 70 ? "text-profit" : result.total_score >= 40 ? "text-warn" : "text-loss"}`}>
                    {result.total_score}/100
                  </span>
                </div>

                {/* PLAIN-ENGLISH WHY — what the chart did and which read was right, before the score grid */}
                {action && (
                  <div className="mt-2 rounded-lg border border-neon/40 bg-neon/5 p-3 text-xs leading-relaxed text-text">
                    <p className="mb-1 text-[10px] uppercase tracking-wider text-neon">What just happened — and why</p>
                    {plainDrillOutcome(action, result, sc.regime)}
                  </div>
                )}

                <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
                  <Cell label="Direction" v={`${result.direction_score}/60`} ok={result.direction_correct} />
                  <Cell label="Risk mgmt" v={`${result.risk_score}/40`} />
                  <Cell label="Outcome" v={result.outcome} />
                </div>
                <p className="mt-2 text-xs text-muted">
                  Forward move {result.forward_move >= 0 ? "+" : ""}{result.forward_move} pts ·{" "}
                  <Gloss k="R">R {fmt(result.r_multiple)}</Gloss>
                </p>
                <ul className="mt-2 space-y-1">
                  {result.notes.map((n, i) => (
                    <li key={i} className="rounded border border-line bg-black/20 px-2 py-1 text-[11px] text-text">{n}</li>
                  ))}
                </ul>
                <button onClick={newScenario} className="mt-3 w-full rounded-lg bg-neon px-4 py-2 text-sm font-semibold text-black hover:brightness-110">
                  Next scenario →
                </button>
                <p className="mt-2 text-[10px] text-muted">Scored on direction + risk discipline. Synthetic data; not financial advice.</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Cell({ label, v, ok }: { label: string; v: string; ok?: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-black/20 p-2">
      <p className="text-[9px] uppercase text-muted">{label}</p>
      <p className={`mt-0.5 font-mono ${ok === undefined ? "text-text" : ok ? "text-profit" : "text-loss"}`}>{v}</p>
    </div>
  );
}
