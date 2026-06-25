"use client";

import { useEffect, useMemo, useState } from "react";

import { logPaperTrade, MISTAKE_TAGS } from "../../lib/api";
import { useSettings } from "../../lib/settings";
import { tradeLogPayload, useStore, type Direction, type PaperPosition } from "../../lib/store";
import { useBestSetup } from "../../lib/useBestSetup";
import { useDiscipline } from "../../lib/useDiscipline";
import { fmt, usd, signColor } from "../../lib/format";

function roundTick(v: number, tick: number): number {
  return Math.round(v / tick) * tick;
}

export default function TradePanel() {
  const manualMode = useStore((s) => s.manualMode);
  const setManualMode = useStore((s) => s.setManualMode);
  const tick = useStore((s) => s.latestTick);
  const meta = useStore((s) => s.meta);
  const position = useStore((s) => s.paperPosition);
  const balance = useStore((s) => s.paperBalance);
  const takePaper = useStore((s) => s.takePaper);
  const closePaper = useStore((s) => s.closePaper);
  const pendingOverride = useStore((s) => s.pendingRevengeOverride);
  const best = useBestSetup();
  const gate = useDiscipline();

  const pv = meta?.instrument.point_value ?? 1;
  const tickSize = meta?.instrument.tick_size ?? 0.25;
  const price = tick?.ohlc.close ?? 0;
  const atr = tick?.indicators.atr_14 ?? 0;

  // order form state (stop / target in POINTS from entry; size in contracts)
  const [stopPts, setStopPts] = useState<number>(0);
  const [tpPts, setTpPts] = useState<number>(0);
  const [size, setSize] = useState<number>(1);
  const [touched, setTouched] = useState(false);

  // close-time tagging (honest self-review)
  const CLOSE_EMOTIONS = ["disciplined", "calm", "fomo", "revenge", "anxious", "greedy", "bored"];
  const [closeEmotion, setCloseEmotion] = useState("disciplined");
  const [closeMistakes, setCloseMistakes] = useState<string[]>([]);
  const toggleMistake = (m: string) =>
    setCloseMistakes((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));

  // seed sensible ATR-based defaults once price/atr are known
  useEffect(() => {
    if (touched || !atr) return;
    const s = Math.max(tickSize * 4, roundTick(atr * 1.5, tickSize));
    setStopPts(Number(s.toFixed(2)));
    setTpPts(Number((s * 2).toFixed(2)));
  }, [atr, tickSize, touched]);

  // suggested risk-based size from the current stop (risk % from Settings)
  const riskFraction = useSettings((s) => s.settings.riskPerTradePct) / 100;
  const riskPerContract = stopPts * pv;
  const suggestedSize = riskPerContract > 0 ? (riskFraction * balance) / riskPerContract : 0;
  useEffect(() => {
    if (touched || !suggestedSize) return;
    setSize(Number(suggestedSize.toFixed(2)));
  }, [suggestedSize, touched]);

  const valid = Boolean(tick) && stopPts > 0 && tpPts > 0 && size > 0 && gate.canTake;

  const place = (direction: Direction) => {
    if (!tick || stopPts <= 0 || tpPts <= 0 || size <= 0 || !gate.canTake) return;
    const entry = roundTick(price, tickSize);
    const stop = direction === "long" ? entry - stopPts : entry + stopPts;
    const target = direction === "long" ? entry + tpPts : entry - tpPts;
    const rr = stopPts > 0 ? tpPts / stopPts : 0;
    const p: PaperPosition = {
      strategy: "Manual",
      label: "Manual order",
      direction,
      entry: Number(entry.toFixed(4)),
      stop: Number(stop.toFixed(4)),
      target: Number(target.toFixed(4)),
      contracts: Number(size.toFixed(2)),
      rr,
      openedAt: tick.ohlc.time.toString(),
      openedBar: tick.bar_index,
      regime: tick.regime,
      // manual order: no prediction; grade quality against the live confluence
      prediction: null,
      wasPostTilt: pendingOverride || gate.consecutiveLosses >= gate.threshold,
      wasRevengeOverride: pendingOverride,
      entryCtx: {
        confluence: tick.confluence?.confidence ?? 0.6,
        threshold: tick.confluence?.threshold ?? 0.65,
        factorsPresent: Object.values(tick.confluence?.score_breakdown ?? {}).filter((v) => v > 0).length,
        factorsTotal: 4,
        favorableRegime: tick.regime,
        regime: tick.regime,
        timingOk: (tick.confluence?.score_breakdown?.timing ?? 0) > 0,
        entryZoneOk: true,
        riskPct: riskFraction * 100,
        balanceAtEntry: balance,
      },
      snapshot: {
        bars: useStore.getState().recentBars.slice(-40).map((b) => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close })),
        entry: Number(entry.toFixed(4)),
        stop: Number(stop.toFixed(4)),
        target: Number(target.toFixed(4)),
        direction,
        strategy: "Manual",
        regime: tick.regime,
      },
    };
    takePaper(p);
  };

  const useSuggestion = () => {
    if (!best || best.entry == null || best.stop == null || best.target == null) return;
    const sp = Math.abs(best.entry - best.stop);
    const tp = Math.abs(best.target - best.entry);
    setStopPts(Number(sp.toFixed(2)));
    setTpPts(Number(tp.toFixed(2)));
    setTouched(true);
  };

  const closeNow = () => {
    if (!position || !tick) return;
    const t = closePaper(price, "manual", tick.ohlc.time.toString(), tick.bar_index);
    if (t)
      logPaperTrade(tradeLogPayload(t, tick.symbol, tick.timeframe, { emotion: closeEmotion, mistakes: closeMistakes }))
        .then((r) => useStore.getState().setLastClosedId(r.id))
        .catch(() => undefined);
    setCloseMistakes([]); setCloseEmotion("disciplined");
  };

  const unreal = useMemo(() => {
    if (!position || !tick) return 0;
    const dir = position.direction === "long" ? 1 : -1;
    return (tick.ohlc.close - position.entry) * dir * pv * position.contracts;
  }, [position, tick, pv]);

  return (
    <div className="panel p-4" data-tour="trade">
      <div className="mb-3 flex items-center justify-between">
        <p className="panel-head">Manual trading {tick ? `· ${tick.symbol} ${tick.timeframe}` : ""}</p>
        <span
          className={`chip ${position ? "border-warn/60 text-warn" : "border-line text-muted"}`}
        >
          {position ? "IN A TRADE" : "FLAT"}
        </span>
      </div>

      {!manualMode ? (
        <div className="rounded-lg border border-dashed border-line p-4 text-center text-xs text-muted">
          Manual trading is off.{" "}
          <button className="text-neon underline" onClick={() => setManualMode(true)}>
            Enable manual mode
          </button>{" "}
          to place your own paper trades any time.
        </div>
      ) : position ? (
        // ---------- managing an open paper position ----------
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-text">{position.label}</span>
            <span className={`chip ${position.direction === "long" ? "border-profit/50 text-profit" : "border-loss/50 text-loss"}`}>
              {position.direction.toUpperCase()}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center text-xs">
            <Cell label="Entry" v={fmt(position.entry)} tone="text-warn" />
            <Cell label="Stop" v={fmt(position.stop)} tone="text-loss" />
            <Cell label="Target" v={fmt(position.target)} tone="text-profit" />
            <Cell label="Size" v={fmt(position.contracts, 2)} />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-line bg-black/20 px-3 py-2 text-sm">
            <span className="text-muted">Unrealized P&L</span>
            <span className={`font-mono text-base font-semibold ${signColor(unreal)}`}>{usd.format(unreal)}</span>
          </div>
          <div className="rounded-lg border border-line bg-black/20 p-2">
            <div className="flex items-center justify-between">
              <span className="text-[9px] uppercase tracking-wider text-muted">How did you feel?</span>
              <select value={closeEmotion} onChange={(e) => setCloseEmotion(e.target.value)}
                className="rounded border border-line bg-black/30 px-2 py-0.5 text-[11px]">
                {CLOSE_EMOTIONS.map((e) => <option key={e}>{e}</option>)}
              </select>
            </div>
            <p className="mt-2 text-[9px] uppercase tracking-wider text-muted">Mistake tags (optional, be honest)</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {MISTAKE_TAGS.map((m) => (
                <button key={m} onClick={() => toggleMistake(m)}
                  className={`chip ${closeMistakes.includes(m) ? "border-warn/60 text-warn" : "border-line text-muted"}`}>
                  {m}
                </button>
              ))}
            </div>
          </div>
          <button onClick={closeNow} className="btn w-full border-loss/50 text-loss hover:border-loss">
            Close position at {fmt(price)}
          </button>
          <p className="text-[10px] text-muted">Auto-closes if price hits your stop or target. Simulation only — no real order is sent.</p>
        </div>
      ) : (
        // ---------- placing a new order ----------
        <div className="space-y-3">
          {best && best.entry != null && (
            <div className="flex items-center justify-between rounded-lg border border-line bg-black/20 px-3 py-1.5 text-[11px]">
              <span className="text-muted">
                Suggestion: <span className="text-text">{best.label}</span> {best.direction}
                {best.recommended ? <span className="ml-1 text-profit">· recommended</span> : <span className="ml-1 text-warn">· low evidence</span>}
              </span>
              <button onClick={useSuggestion} className="text-neon underline">Use</button>
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            <Field label="Stop (pts)" value={stopPts} onChange={(v) => { setStopPts(v); setTouched(true); }} />
            <Field label="Target (pts)" value={tpPts} onChange={(v) => { setTpPts(v); setTouched(true); }} />
            <Field label="Size (ct)" value={size} onChange={(v) => { setSize(v); setTouched(true); }} />
          </div>
          <p className="text-[10px] text-muted">
            Market fill ≈ {fmt(price)}. Risk/contract {usd.format(riskPerContract)} ·
            {(riskFraction * 100).toFixed(2)}%-risk size ≈ {fmt(suggestedSize, 2)} ct · R:R {stopPts > 0 ? (tpPts / stopPts).toFixed(1) : "—"}:1
          </p>
          {!gate.canTake && (
            <p className="rounded-lg border border-warn/40 bg-warn/5 px-2 py-1.5 text-[11px] text-warn">
              {gate.lockedOut
                ? "Entries locked — daily loss limit hit for this session. Review and start fresh."
                : "Entries paused during your cooldown — observe only (or use “Take anyway” above)."}
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => place("long")}
              disabled={!valid}
              className="btn flex-1 border-profit/50 text-profit hover:border-profit disabled:opacity-40"
            >
              ▲ Buy (market)
            </button>
            <button
              onClick={() => place("short")}
              disabled={!valid}
              className="btn flex-1 border-loss/50 text-loss hover:border-loss disabled:opacity-40"
            >
              ▼ Sell (market)
            </button>
          </div>
          <p className="text-[10px] text-muted">
            Trade freely any time — you don&apos;t need a &quot;qualified setup&quot;. Simulation / paper only; not financial advice.
          </p>
        </div>
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

function Field({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="text-[9px] uppercase tracking-wider text-muted">{label}</span>
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        min={0}
        step="0.25"
        onChange={(e) => onChange(Math.max(0, Number(e.target.value)))}
        className="mt-1 w-full rounded-lg border border-line bg-black/30 px-2 py-1 font-mono text-xs"
      />
    </label>
  );
}
