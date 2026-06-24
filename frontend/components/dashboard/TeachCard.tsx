"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { logMissedSetup } from "../../lib/api";
import { useSettings } from "../../lib/settings";
import { useStore, type Direction, type PaperPosition } from "../../lib/store";
import type { EntryCtx, Prediction } from "../../lib/quality";
import { play } from "../../lib/stream";
import { fmt, usd, FACTOR_LABEL, REGIME_LABEL } from "../../lib/format";

const FACTORS = ["base", "structure", "timing", "pa"];
const RATIONALES = ["Setup quality", "Timing", "Risk", "Gut feeling"];
type Predicted = "long" | "short" | "skip";

export default function TeachCard() {
  const teach = useStore((s) => s.teach);
  const tick = useStore((s) => s.latestTick);
  const meta = useStore((s) => s.meta);
  const balance = useStore((s) => s.paperBalance);
  const position = useStore((s) => s.paperPosition);
  const takePaper = useStore((s) => s.takePaper);
  const noteSetupSeen = useStore((s) => s.noteSetupSeen);
  const noteSkippedQualified = useStore((s) => s.noteSkippedQualified);

  const confidencePrompt = useSettings((s) => s.settings.confidencePrompt);
  const timerOn = useSettings((s) => s.settings.decisionTimerEnabled);
  const timerSecs = useSettings((s) => s.settings.decisionTimerSeconds);
  const riskPct = useSettings((s) => s.settings.riskPerTradePct);

  const [phase, setPhase] = useState<"predict" | "reveal">("reveal");
  const [predicted, setPredicted] = useState<Predicted | null>(null);
  const [confidence, setConfidence] = useState(5);
  const [decisionMs, setDecisionMs] = useState<number | null>(null);
  const [rationale, setRationale] = useState<string>("");
  const [secondsLeft, setSecondsLeft] = useState(0);
  const startRef = useRef<number>(0);
  const seenBar = useRef<number>(-1);

  const sig = teach && tick ? tick.signals.find((s) => s.name === teach.setup) : undefined;

  const commit = useCallback((dir: Predicted) => {
    setPredicted(dir);
    setDecisionMs(confidencePrompt ? Math.round(performance.now() - startRef.current) : null);
    setPhase("reveal");
  }, [confidencePrompt]);

  // reset the lifecycle whenever a new qualified setup pauses us
  useEffect(() => {
    if (!teach) return;
    if (seenBar.current !== teach.bar) {
      seenBar.current = teach.bar;
      noteSetupSeen();
    }
    setPredicted(null);
    setConfidence(5);
    setDecisionMs(null);
    setRationale("");
    if (confidencePrompt) {
      setPhase("predict");
      startRef.current = performance.now();
      setSecondsLeft(timerOn ? timerSecs : 0);
    } else {
      setPhase("reveal");
    }
  }, [teach, confidencePrompt, timerOn, timerSecs, noteSetupSeen]);

  // decision-pressure countdown — expiry auto-commits a Skip
  useEffect(() => {
    if (phase !== "predict" || !timerOn) return;
    if (secondsLeft <= 0) {
      commit("skip");
      return;
    }
    const id = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [phase, timerOn, secondsLeft, commit]);

  if (!teach || !tick) return null;
  const pv = meta?.instrument.point_value ?? 1;

  const canTrade = Boolean(sig && sig.entry != null && sig.stop != null && sig.target != null && !position);
  const risk = canTrade ? Math.abs(sig!.entry! - sig!.stop!) : 0;
  const rr = canTrade && risk > 0 ? Math.abs(sig!.target! - sig!.entry!) / risk : 0;
  const contracts = risk > 0 ? ((riskPct / 100) * balance) / (risk * pv) : 0;
  const factorsPresent = sig ? FACTORS.filter((f) => sig.factors[f]).length : 0;
  const conf = sig?.confluence?.confidence ?? 0;
  const threshold = sig?.confluence?.threshold ?? 0.65;

  const predictionMatch = predicted && predicted !== "skip" && sig ? predicted === sig.direction : null;

  const buildPrediction = (): Prediction | null => {
    if (!confidencePrompt || !predicted) return null;
    return {
      dir: predicted,
      confidence: predicted === "skip" ? null : confidence,
      decisionMs,
      correct: predicted === "skip" ? null : Boolean(sig && predicted === sig.direction),
      rationale,
    };
  };

  const buildEntryCtx = (): EntryCtx => ({
    confluence: conf,
    threshold,
    factorsPresent,
    factorsTotal: FACTORS.length,
    favorableRegime: sig?.best_regime ?? "",
    regime: tick.regime,
    timingOk: Boolean(sig?.factors.timing),
    entryZoneOk: true,
    riskPct,
    balanceAtEntry: balance,
  });

  const take = () => {
    if (!canTrade || !sig) {
      play();
      return;
    }
    const p: PaperPosition = {
      strategy: sig.name,
      label: sig.label,
      direction: sig.direction,
      entry: sig.entry!,
      stop: sig.stop!,
      target: sig.target!,
      contracts: Number(contracts.toFixed(2)),
      rr,
      openedAt: tick.ohlc.time.toString(),
      openedBar: tick.bar_index,
      regime: tick.regime,
      prediction: buildPrediction(),
      entryCtx: buildEntryCtx(),
      snapshot: {
        bars: useStore.getState().recentBars.slice(-40).map((b) => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close })),
        entry: sig.entry!,
        stop: sig.stop!,
        target: sig.target!,
        direction: sig.direction,
        strategy: sig.name,
        regime: tick.regime,
      },
    };
    takePaper(p);
    play();
  };

  const skip = () => {
    if (sig) {
      const pred = buildPrediction();
      noteSkippedQualified(rr); // R potential of the setup we passed on
      void logMissedSetup({
        symbol: tick.symbol,
        timeframe: tick.timeframe,
        strategy: sig.name,
        direction: sig.direction,
        regime: tick.regime,
        r_potential: Number(rr.toFixed(2)),
        confluence: conf,
        confidence: pred?.confidence ?? null,
        decision_ms: decisionMs,
        predicted_direction: predicted ?? "",
        rationale,
      }).catch(() => undefined);
    }
    play();
  };

  const resume = () => play();
  const directionTone = (d: Direction | Predicted) =>
    d === "long" ? "text-profit" : d === "short" ? "text-loss" : "text-muted";

  return (
    <div className="panel border-2 border-warn/70 p-4 shadow-[0_0_28px_rgba(255,214,0,0.14)]" data-tour="teach">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-warn/20 text-warn">⏸</span>
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-warn">Paused — qualified setup</p>
            <p className="text-sm font-semibold text-text">
              {phase === "predict" ? "What do you see?" : sig ? sig.label : teach.setup}
            </p>
          </div>
        </div>
        {phase === "predict" && timerOn && (
          <span className={`chip ${secondsLeft <= 3 ? "border-loss/60 text-loss" : "border-warn/50 text-warn"}`}>⏱ {secondsLeft}s</span>
        )}
        {phase === "reveal" && sig && (
          <span className={`chip ${sig.direction === "long" ? "border-profit/50 text-profit" : "border-loss/50 text-loss"}`}>
            {sig.direction.toUpperCase()}
          </span>
        )}
      </div>

      {/* ---------- PREDICTION STEP (setup details hidden) ---------- */}
      {phase === "predict" ? (
        <div>
          <div className="relative">
            <div className="pointer-events-none select-none blur-md" aria-hidden="true">
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <Cell label="Entry" v="00000" />
                <Cell label="Stop" v="00000" />
                <Cell label="Target" v="00000" />
                <Cell label="R:R" v="0:0" />
              </div>
              <p className="mt-3 text-xs text-text">why this qualifies — hidden until you commit a read.</p>
            </div>
            <div className="absolute inset-0 grid place-items-center">
              <span className="chip border-line bg-surface2/70 text-muted">setup hidden — call it first</span>
            </div>
          </div>

          <p className="mt-3 text-[11px] uppercase tracking-wider text-muted">Your read</p>
          <div className="mt-1 grid grid-cols-3 gap-2">
            {(["long", "short", "skip"] as Predicted[]).map((d) => (
              <button key={d} onClick={() => commit(d)} className={`btn justify-center ${directionTone(d)}`}>
                {d === "long" ? "▲ Long" : d === "short" ? "▼ Short" : "Skip"}
              </button>
            ))}
          </div>

          <label className="mt-3 block">
            <span className="flex justify-between text-[11px] text-muted">
              <span>Confidence</span>
              <span className="font-mono text-text">{confidence}/10</span>
            </span>
            <input type="range" min={1} max={10} value={confidence} onChange={(e) => setConfidence(Number(e.target.value))} className="mt-1 w-full" />
          </label>
          <p className="mt-2 text-[10px] text-muted">Commit a direction to reveal the setup and score your read. Practice only.</p>
        </div>
      ) : sig ? (
        /* ---------- REVEAL + COMPARE + QUALITY ---------- */
        <>
          {predicted && (
            <div className={`mb-3 rounded-lg border px-3 py-2 text-xs ${predictionMatch ? "border-profit/50 bg-profit/5" : predicted === "skip" ? "border-line bg-surface2/40" : "border-loss/50 bg-loss/5"}`}>
              You said <span className={`font-semibold ${directionTone(predicted)}`}>{predicted.toUpperCase()}</span> · system flagged{" "}
              <span className={`font-semibold ${directionTone(sig.direction)}`}>{sig.direction.toUpperCase()}</span>
              {predicted === "skip" ? " — judgment call" : predictionMatch ? " — match ✓" : " — mismatch ✗"}
              {confidencePrompt && predicted !== "skip" && (
                <span className="ml-1 text-muted">· conf {confidence}/10{decisionMs != null ? ` · ${(decisionMs / 1000).toFixed(1)}s` : ""}</span>
              )}
            </div>
          )}

          <div className="grid grid-cols-4 gap-2 text-center text-xs">
            <Cell label="Entry" v={fmt(sig.entry)} tone="text-warn" />
            <Cell label="Stop" v={fmt(sig.stop)} tone="text-loss" />
            <Cell label="Target" v={fmt(sig.target)} tone="text-profit" />
            <Cell label="R:R" v={rr ? `${rr.toFixed(1)}:1` : "—"} />
          </div>

          {/* setup quality breakdown — real per-factor confluence sub-scores */}
          <div className="mt-3 rounded-lg border border-line bg-surface2/40 p-2.5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Setup quality</p>
              <span className="font-mono text-xs text-text">
                {factorsPresent}/{FACTORS.length} factors · {Math.round(conf * 100)}/{Math.round(threshold * 100)} thr
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {FACTORS.map((f) => {
                const on = sig.factors[f];
                const w = sig.confluence?.score_breakdown?.[f] ?? 0;
                return (
                  <span key={f} className={`chip ${on ? "border-profit/40 text-profit" : "border-line text-muted"}`}>
                    {on ? "✓" : "✕"} {FACTOR_LABEL[f] ?? f}{on ? ` +${w.toFixed(2)}` : ""}
                  </span>
                );
              })}
            </div>
          </div>

          <p className="mt-2 text-xs text-text">
            Regime <span className="text-neon">{REGIME_LABEL[tick.regime] ?? tick.regime}</span> · {sig.evidence}.
            {sig.regime_expectancy_r != null && (
              <> Backtested edge ≈ <span className="font-mono">{fmt(sig.regime_expectancy_r)}R</span> (synthetic — proves logic, not a live edge).</>
            )}
          </p>
          <p className="mt-1 text-[11px] text-muted">
            ≈ {fmt(contracts, 2)} contracts is ~{riskPct}% of your {usd.format(balance)} paper account. Honor the stop.
          </p>

          {/* one-tap rationale captured on Take / Skip */}
          <p className="mt-3 text-[10px] uppercase tracking-wider text-muted">Why? (one tap)</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {RATIONALES.map((r) => (
              <button key={r} onClick={() => setRationale(r)} className={`chip ${rationale === r ? "border-neon/60 text-neon" : "border-line text-muted hover:text-text"}`}>
                {r}
              </button>
            ))}
          </div>

          <div className="mt-3 flex gap-2">
            <button onClick={take} disabled={!canTrade} className="flex-1 rounded-lg bg-profit px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110 disabled:opacity-40">
              {position ? "In a trade" : "Take"}
            </button>
            <button onClick={skip} className="btn flex-1">Skip</button>
            <button onClick={resume} className="btn flex-1">Resume</button>
          </div>
          <p className="mt-2 text-[10px] text-muted">
            Skipping a qualified setup is logged as missed practice ({rr ? `${rr.toFixed(1)}R` : "—"} potential). Not financial advice.
          </p>
        </>
      ) : (
        <p className="text-xs text-muted">A qualified setup appeared but its details scrolled off. Resume to continue.</p>
      )}
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
