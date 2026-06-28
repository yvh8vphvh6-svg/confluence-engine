"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";

import { logMissedSetup } from "../../lib/api";
import { annotationsFromSetup } from "../../lib/annotations";
import { useSettings } from "../../lib/settings";
import { useStore, type Direction, type PaperPosition, type StrategySignalView } from "../../lib/store";
import type { EntryCtx, Prediction } from "../../lib/quality";
import { useDiscipline } from "../../lib/useDiscipline";
import { play, pause } from "../../lib/stream";
import { fmt, usd, FACTOR_LABEL, REGIME_LABEL } from "../../lib/format";
import { plainSetupSentence } from "../../lib/teach";
import { Gloss } from "../Gloss";

const AnnotatedChart = dynamic(() => import("../AnnotatedChart"), { ssr: false });

const FACTORS = ["base", "structure", "timing", "pa"];
const RATIONALES = ["Setup quality", "Timing", "Risk", "Gut feeling"];
type Predicted = "long" | "short" | "skip";

// Why a tempting wrong strategy choice doesn't qualify on the current structure —
// straight from the engine's per-strategy confluence evaluation (no fabrication).
function whyNot(v: StrategySignalView | undefined, regime: string): string {
  if (!v) return "no signal on this structure";
  if (!v.active) return "not active on this structure";
  if (v.blocked_by_regime) return `filtered out by the ${REGIME_LABEL[regime] ?? regime} regime`;
  const c = v.confluence;
  if (c && !c.execute) {
    const miss = c.missing_factors?.length
      ? ` (missing ${c.missing_factors.map((m) => FACTOR_LABEL[m] ?? m).join(", ")})`
      : "";
    return `confluence didn't clear${miss}`;
  }
  if (v.entry == null) return "no valid entry trigger here";
  return v.reason || "lower confluence than the qualified setup";
}

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
  const pendingOverride = useStore((s) => s.pendingRevengeOverride);
  const recentBars = useStore((s) => s.recentBars);
  const gate = useDiscipline();

  const [phase, setPhase] = useState<"predict" | "reveal">("reveal");
  const [predicted, setPredicted] = useState<Predicted | null>(null);
  const [strategyPick, setStrategyPick] = useState<string | null>(null);
  const [confidence, setConfidence] = useState(5);
  const [decisionMs, setDecisionMs] = useState<number | null>(null);
  const [rationale, setRationale] = useState<string>("");
  const [secondsLeft, setSecondsLeft] = useState(0);
  const startRef = useRef<number>(0);
  const seenBar = useRef<number>(-1);
  const skipRef = useRef<((timedOut?: boolean) => void) | null>(null);

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
    setStrategyPick(null);
    setConfidence(5);
    setDecisionMs(null);
    setRationale("");
    if (confidencePrompt) {
      setPhase("predict");
      startRef.current = performance.now();
      setSecondsLeft(timerOn ? timerSecs : 0);
      // freeze the stream while the user reads the formed setup (stays frozen
      // through reveal until Take/Skip/Resume calls play()). Idempotent if the
      // server already auto-paused.
      pause();
    } else {
      setPhase("reveal");
    }
  }, [teach, confidencePrompt, timerOn, timerSecs, noteSetupSeen]);

  // decision-pressure countdown — expiry auto-logs a skipped decision (E1)
  useEffect(() => {
    if (phase !== "predict" || !timerOn) return;
    if (secondsLeft <= 0) {
      skipRef.current?.(true);
      return;
    }
    const id = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [phase, timerOn, secondsLeft]);

  if (!teach || !tick) return null;
  const pv = meta?.instrument.point_value ?? 1;

  const canTrade = Boolean(sig && sig.entry != null && sig.stop != null && sig.target != null && !position) && gate.canTake;
  const risk = canTrade ? Math.abs(sig!.entry! - sig!.stop!) : 0;
  const rr = canTrade && risk > 0 ? Math.abs(sig!.target! - sig!.entry!) / risk : 0;
  const contracts = risk > 0 ? ((riskPct / 100) * balance) / (risk * pv) : 0;
  const factorsPresent = sig ? FACTORS.filter((f) => sig.factors[f]).length : 0;
  const conf = sig?.confluence?.confidence ?? 0;
  const threshold = sig?.confluence?.threshold ?? 0.65;

  const predictionMatch = predicted && predicted !== "skip" && sig ? predicted === sig.direction : null;

  // strategy-recall question: choices are the engine's per-strategy reads; the
  // "correct" answer is the strategy that actually has the qualifying confluence
  // here (the qualified setup). Honest by construction — teach only fires when a
  // setup genuinely qualifies, so we never invent a correct answer.
  const strategyChoices = tick.signals.map((s) => ({ name: s.name, label: s.label }));
  const correctStratLabel = sig?.label ?? teach.setup;
  const strategyMatch = strategyPick && sig ? strategyPick === sig.name : null;
  const pickedView = strategyPick ? tick.signals.find((s) => s.name === strategyPick) : undefined;

  // Part 1 — annotated answer reveal: focus the recent window and derive marks
  // from the engine's REAL overlays + the qualified signal's levels (no fiction).
  const annBars = recentBars.slice(-60).map((b) => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close }));
  const annLastTime = annBars.length ? annBars[annBars.length - 1].time : tick.ohlc.time;
  const annotations = sig
    ? annotationsFromSetup(
        tick.overlays,
        { name: sig.name, label: sig.label, direction: sig.direction, entry: sig.entry, stop: sig.stop, target: sig.target, evidence: sig.evidence, regime: tick.regime },
        annLastTime,
      )
    : [];
  const wrongPickCaption =
    strategyPick && !strategyMatch && pickedView ? `Why not ${pickedView.label}: ${whyNot(pickedView, tick.regime)}.` : undefined;

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
      wasPostTilt: pendingOverride || gate.consecutiveLosses >= gate.threshold,
      wasRevengeOverride: pendingOverride,
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

  const skip = (timedOut = false) => {
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
        decision_ms: timedOut ? timerSecs * 1000 : decisionMs,
        predicted_direction: timedOut ? "skip" : predicted ?? "",
        rationale: timedOut ? "timer expired" : rationale,
      }).catch(() => undefined);
    }
    play();
  };
  // expose the latest skip() to the countdown effect (declared above the guard)
  skipRef.current = skip;

  const resume = () => play();
  const directionTone = (d: Direction | Predicted) =>
    d === "long" ? "text-profit" : d === "short" ? "text-loss" : "text-muted";

  return (
    <div className="panel border-2 border-warn/70 p-4 shadow-[0_0_28px_rgba(255,214,0,0.14)]" data-tour="teach">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-warn/20 text-warn">⏸</span>
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-warn">Paused — read the setup</p>
            <p className="text-sm font-semibold text-text">
              {phase === "predict" ? "What's on the chart?" : sig ? sig.label : teach.setup}
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

      {/* ---------- PREDICTION STEP: read the formed setup (system call hidden) ---------- */}
      {phase === "predict" ? (
        <div>
          <p className="text-xs text-text">
            The chart is <span className="text-warn">frozen</span>. Read the setup that&apos;s already formed above —
            structure, regime, and where price sits vs VWAP — then call it. The system&apos;s answer is hidden until you commit.
          </p>

          {/* (3) strategy recall — which setup applies on this structure */}
          <p className="mt-3 text-[11px] uppercase tracking-wider text-muted">Which setup best applies here?</p>
          <div className="mt-1 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {strategyChoices.map((c) => (
              <button
                key={c.name}
                onClick={() => setStrategyPick(c.name)}
                className={`chip justify-center ${strategyPick === c.name ? "border-neon/60 text-neon" : "border-line text-muted hover:text-text"}`}
              >
                {c.label}
              </button>
            ))}
          </div>

          {/* (2) direction read — graded against the engine's reasoning, not the next candle */}
          <p className="mt-3 text-[11px] uppercase tracking-wider text-muted">Based on the confluence here — long or short?</p>
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
          <p className="mt-2 text-[10px] text-muted">
            You&apos;re grading your read of the setup that&apos;s already there — not guessing the next candle. Commit a direction to reveal the engine&apos;s reasoning.
          </p>
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

          {/* (3) strategy-recall result — why the qualified setup fits, why a wrong pick doesn't */}
          {strategyPick && (
            <div className={`mb-3 rounded-lg border px-3 py-2 text-xs ${strategyMatch ? "border-profit/50 bg-profit/5" : "border-loss/50 bg-loss/5"}`}>
              You picked <span className="font-semibold text-text">{pickedView?.label ?? strategyPick}</span> · engine qualified{" "}
              <span className="font-semibold text-text">{correctStratLabel}</span>{strategyMatch ? " — match ✓" : " — mismatch ✗"}
              <p className="mt-1 text-muted">
                {correctStratLabel} fits — {REGIME_LABEL[tick.regime] ?? tick.regime} regime, {factorsPresent}/{FACTORS.length} factors; {sig.evidence || sig.reason}.
                {!strategyMatch && <> Not {pickedView?.label ?? strategyPick}: {whyNot(pickedView, tick.regime)}.</>}
              </p>
            </div>
          )}

          {/* PLAIN-ENGLISH WHY — the teacher's read, before any jargon */}
          <div className="mb-3 rounded-lg border border-warn/40 bg-warn/5 p-3">
            <p className="text-[10px] uppercase tracking-wider text-warn">In plain English — why this setup</p>
            <p className="mt-1 text-sm leading-relaxed text-text">
              {plainSetupSentence(sig.name, sig.direction === "short" ? "short" : "long", tick.regime)}
            </p>
          </div>

          {/* (Part 1) annotated answer reveal — marks on the real price structure */}
          <div className="mb-3 rounded-lg border border-line bg-surface2/40 p-2.5">
            <p className="mb-2 text-[10px] uppercase tracking-wider text-muted">On the chart — what justified this setup</p>
            <AnnotatedChart candles={annBars} annotations={annotations} height={260} caption={wrongPickCaption} />
          </div>

          <div className="grid grid-cols-4 gap-2 text-center text-xs">
            <Cell label="Entry" v={fmt(sig.entry)} tone="text-warn" />
            <Cell label="Stop" v={fmt(sig.stop)} tone="text-loss" />
            <Cell label="Target" v={fmt(sig.target)} tone="text-profit" />
            <Cell label="R:R" v={rr ? `${rr.toFixed(1)}:1` : "—"} />
          </div>
          <p className="mt-1 text-[10px] leading-snug text-muted">
            <span className="text-text">Entry</span> = where you&apos;d get in · <span className="text-loss">stop</span> = where you bail if you&apos;re wrong ·{" "}
            <span className="text-profit">target</span> = where you take profit.{" "}
            <Gloss k="rr">R:R {rr ? `${rr.toFixed(1)}:1` : "—"}</Gloss> means you risk 1 to try to make {rr ? rr.toFixed(1) : "—"}.
          </p>
          <p className="mt-2 text-[11px] text-muted">
            ≈ {fmt(contracts, 2)} <Gloss k="contracts">contracts</Gloss> — sized so a full stop-out costs only ~{riskPct}% of your {usd.format(balance)} paper account. Honor the stop.
          </p>

          {/* technical breakdown — kept available, secondary to the plain-English read */}
          <details className="mt-3 rounded-lg border border-line bg-surface2/40">
            <summary className="cursor-pointer px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-muted">
              Show the technical breakdown
            </summary>
            <div className="space-y-3 px-3 pb-3 text-xs">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted">Engine reasoning</p>
                <p className="mt-1 text-text">
                  Reads <span className={`font-semibold ${directionTone(sig.direction)}`}>{sig.direction.toUpperCase()}</span> —{" "}
                  {REGIME_LABEL[tick.regime] ?? tick.regime} regime,{" "}
                  <Gloss k="factors">{factorsPresent}/{FACTORS.length} confluence factors</Gloss>. {sig.evidence}
                </p>
                <p className="mt-1 text-[10px] text-muted">Graded on the engine&apos;s confluence read of the formed setup — not the next candle; this sharpens on realistic data.</p>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted">
                    <Gloss k="confluence">Setup quality</Gloss>
                  </p>
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

              {sig.regime_expectancy_r != null && (
                <p className="text-[11px] text-muted">
                  Backtested edge ≈ <Gloss k="expectancy"><span className="font-mono">{fmt(sig.regime_expectancy_r)}R</span></Gloss>{" "}
                  (synthetic — proves the logic works, not a live money-maker).
                </p>
              )}
            </div>
          </details>

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
              {gate.lockedOut ? "Locked" : gate.cooldownActive ? "Cooldown" : position ? "In a trade" : "Take"}
            </button>
            <button onClick={() => skip()} className="btn flex-1">Skip</button>
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
