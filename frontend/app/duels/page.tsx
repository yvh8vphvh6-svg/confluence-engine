"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";

import { getDuel, getDuelHistory, scoreDuel, type DuelHistory, type DuelNew, type DuelResult } from "../../lib/api";

const BarsChart = dynamic(() => import("../../components/BarsChart"), { ssr: false });

export default function DuelsPage() {
  const [duel, setDuel] = useState<DuelNew | null>(null);
  const [conf, setConf] = useState(5);
  const [result, setResult] = useState<DuelResult | null>(null);
  const [hist, setHist] = useState<DuelHistory | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const next = useCallback(() => {
    setDuel(null); setResult(null); setErr(""); setConf(5);
    getDuel().then(setDuel).catch((e) => setErr(e instanceof Error ? e.message : "no duel available"));
    getDuelHistory().then(setHist).catch(() => undefined);
  }, []);

  useEffect(() => next(), [next]);

  const commit = async (direction: "long" | "short") => {
    if (!duel || result || busy) return;
    setBusy(true);
    try {
      const r = await scoreDuel({ scenario: duel.scenario, direction, confidence: conf });
      setResult(r);
      setHist(r.history);
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
          <h1 className="font-display text-xl font-semibold text-text">Head-to-Head Duels</h1>
          <p className="text-sm text-muted">Same chart, both call it. Higher confidence × correctness wins.</p>
        </div>
        {hist && hist.n > 0 && (
          <span className="chip border-neon/40 text-neon">{hist.wins}W · {hist.losses}L · {hist.ties}T</span>
        )}
      </header>

      {err && <p className="panel border-loss/40 p-4 text-xs text-loss">{err} <button onClick={next} className="ml-2 underline">retry</button></p>}
      {!err && !duel && <p className="panel p-6 text-center text-sm text-muted">Finding an opponent…</p>}

      {duel && (
        <>
          <div className="panel p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="panel-head">{duel.symbol} · {duel.timeframe}</p>
              <span className="chip border-warn/40 text-warn">vs {duel.opponent.name} (example bot)</span>
            </div>
            <BarsChart candles={duel.candles} height={340} />
            <p className="mt-1 text-[10px] text-muted">No future leaked — both you and the bot call the next move. Synthetic practice data.</p>
          </div>

          <div className="panel p-4">
            {!result ? (
              <>
                <label className="block">
                  <span className="flex justify-between text-[11px] text-muted"><span>Your confidence</span><span className="font-mono text-text">{conf}/10</span></span>
                  <input type="range" min={1} max={10} value={conf} onChange={(e) => setConf(Number(e.target.value))} className="mt-1 w-full" />
                </label>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => commit("long")} disabled={busy} className="btn flex-1 border-profit/50 text-profit hover:border-profit">▲ Long</button>
                  <button onClick={() => commit("short")} disabled={busy} className="btn flex-1 border-loss/50 text-loss hover:border-loss">▼ Short</button>
                </div>
                <p className="mt-2 text-[10px] text-muted">The opponent is a deterministic practice bot — not a person.</p>
              </>
            ) : (
              <div className={`rounded-lg border p-3 ${result.winner === "user" ? "border-profit/50 bg-profit/5" : result.winner === "opponent" ? "border-loss/50 bg-loss/5" : "border-line bg-surface2/40"}`}>
                <p className={`text-sm font-semibold ${result.winner === "user" ? "text-profit" : result.winner === "opponent" ? "text-loss" : "text-text"}`}>
                  {result.winner === "user" ? "You win ✓" : result.winner === "opponent" ? "Bot wins ✗" : "Tie"} — it went <span className="uppercase">{result.correct_direction}</span>
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded border border-line bg-black/20 p-2">
                    <p className="text-muted">You</p>
                    <p className="text-text">{result.user.direction.toUpperCase()} @ conf {result.user.confidence} · {result.user.correct ? "correct" : "wrong"} · score {result.user.score}</p>
                  </div>
                  <div className="rounded border border-line bg-black/20 p-2">
                    <p className="text-muted">{result.opponent.name}</p>
                    <p className="text-text">{result.opponent.direction.toUpperCase()} @ conf {result.opponent.confidence} · {result.opponent.correct ? "correct" : "wrong"} · score {result.opponent.score}</p>
                  </div>
                </div>
                <button onClick={next} className="mt-3 rounded-lg bg-neon px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110">Next duel →</button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
