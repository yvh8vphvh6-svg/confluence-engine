"use client";

import { useState } from "react";

import { logPaperTrade, setTradeFeeling } from "../../lib/api";
import { fmt, signColor, usd } from "../../lib/format";
import { useSettings } from "../../lib/settings";
import { tradeLogPayload, useStore } from "../../lib/store";

const FEELINGS: { key: string; label: string }[] = [
  { key: "good", label: "Good" },
  { key: "neutral", label: "Neutral" },
  { key: "bad", label: "Bad" },
];

function Bar({ label, score, reason }: { label: string; score: number; reason: string }) {
  const pct = Math.max(0, Math.min(100, score * 10));
  const tone = score >= 7 ? "bg-profit" : score >= 4 ? "bg-warn" : "bg-loss";
  return (
    <div>
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-text">{label}</span>
        <span className="font-mono text-muted">{score}/10</span>
      </div>
      <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-black/30">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-0.5 text-[10px] text-muted">{reason}</p>
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

// Centered, scroll-independent overlay for the taken trade. While a teach-flow
// position is OPEN it pops a centered card so the user can close immediately —
// no scrolling to the trade panel — or let it run; when the position CLOSES it
// swaps to the dim-backdrop result scorecard with a "Next" button. A small
// non-blocking pill keeps the close action reachable while watching it play out.
export default function PostTradeCard() {
  const result = useStore((s) => s.lastClosed);
  const dismiss = useStore((s) => s.dismissPostTrade);
  const lastClosedId = useStore((s) => s.lastClosedId);
  const setFeeling = useStore((s) => s.setLastClosedFeeling);
  const checkinsOn = useSettings((s) => s.settings.emotionalCheckins);

  // live open-position context (so closing never requires scrolling)
  const position = useStore((s) => s.paperPosition);
  const tick = useStore((s) => s.latestTick);
  const meta = useStore((s) => s.meta);
  const closePaper = useStore((s) => s.closePaper);
  const setLastClosedId = useStore((s) => s.setLastClosedId);

  const [letRun, setLetRun] = useState<string | null>(null);
  const posKey = position ? `${position.strategy}|${position.openedAt}` : null;

  const pickFeeling = (f: string) => {
    setFeeling(f);
    if (lastClosedId != null) void setTradeFeeling(lastClosedId, f).catch(() => undefined);
  };

  const closeNow = () => {
    if (!position || !tick) return;
    const t = closePaper(tick.ohlc.close, "manual", tick.ohlc.time.toString(), tick.bar_index);
    if (t)
      logPaperTrade(tradeLogPayload(t, tick.symbol, tick.timeframe))
        .then((r) => setLastClosedId(r.id))
        .catch(() => undefined);
  };

  // ---------- RESULT: centered, dim-backdrop scorecard ----------
  if (result && result.quality) {
    const t = result;
    const q = result.quality;
    const won = t.r_multiple > 0;
    const lesson =
      won && q.total < 6
        ? "A win with low marks got lucky — the process, not this result, is what repeats."
        : !won && q.total >= 7
          ? "A loss with high marks is still a good trade. Keep taking it."
          : won
            ? "Good result on a sound process — exactly what you want to repeat."
            : "A weak process and a loss — fix the marked-down dimension next time.";

    return (
      <div className="fixed inset-0 z-[62] grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={dismiss}>
        <div
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="Trade result"
          className="relative max-h-[86vh] w-[min(26rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl border border-line glass-surface p-4 shadow-2xl shadow-black/60 motion-safe:animate-[fadeIn_.2s_ease-out] before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-accent/70 before:to-transparent"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-display text-[10px] uppercase tracking-[0.2em] text-accent">Post-trade</p>
              <p className="text-sm text-text">
                {t.strategy} {t.direction} ·{" "}
                <span className={won ? "text-profit" : t.r_multiple < 0 ? "text-loss" : "text-muted"}>
                  {t.r_multiple >= 0 ? "+" : ""}{t.r_multiple.toFixed(2)}R
                </span>
              </p>
            </div>
            <div className="text-right">
              <span className={`font-mono text-2xl font-bold ${q.total >= 7 ? "text-profit" : q.total >= 4 ? "text-warn" : "text-loss"}`}>{q.total}</span>
              <span className="text-xs text-muted">/10</span>
            </div>
          </div>

          <p className="mt-2 rounded-lg border border-line bg-surface2/40 px-2.5 py-1.5 text-xs text-text">{q.summary}</p>

          <div className="mt-3 space-y-2.5">
            <Bar label="Setup confluence" score={q.setup} reason={q.reasons.setup} />
            <Bar label="Risk" score={q.risk} reason={q.reasons.risk} />
            <Bar label="Execution" score={q.execution} reason={q.reasons.execution} />
            <Bar label="Outcome" score={q.outcome} reason={q.reasons.outcome} />
          </div>

          {/* labeled educational heuristic — NOT a precise measurement */}
          <div className="mt-3 rounded-lg border border-line bg-black/20 p-2.5">
            <p className="text-[10px] uppercase tracking-wider text-muted">Why it {won ? "won" : "lost"} — teaching model (not exact)</p>
            <ul className="mt-1.5 space-y-1.5">
              {t.wonLostFactors.map((f) => (
                <li key={f.label}>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text">{f.label}</span>
                    <span className="font-mono text-muted">{Math.round(f.score * 100)}%</span>
                  </div>
                  <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-black/30">
                    <div className={`h-full rounded-full ${f.label === "Variance" ? "bg-muted" : "bg-accent"}`} style={{ width: `${Math.round(f.score * 100)}%` }} />
                  </div>
                  <p className="text-[10px] text-muted">{f.note}</p>
                </li>
              ))}
            </ul>
          </div>

          <p className="mt-3 text-[11px] text-text">{lesson}</p>

          {/* optional one-tap feeling check-in — gated by the setting, never blocks */}
          {checkinsOn && (
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-[10px] uppercase tracking-wider text-muted">How did that go?</span>
              <div className="flex gap-1.5">
                {FEELINGS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => pickFeeling(f.key)}
                    className={`chip ${t.postTradeFeeling === f.key ? "border-neon/60 text-neon" : "border-line text-muted hover:text-text"}`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* defensive: if a position is somehow still open, close it from here */}
          {position && (
            <button onClick={closeNow} className="mt-3 w-full rounded-lg border border-loss/50 px-4 py-2 text-sm font-semibold text-loss transition hover:border-loss">
              Close remaining position
            </button>
          )}

          <button onClick={dismiss} className="mt-3 w-full rounded-lg bg-neon px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110">
            Next
          </button>
        </div>
      </div>
    );
  }

  // ---------- OPEN teach-flow position: centered close / let-it-run ----------
  if (position && position.strategy !== "Manual") {
    const pv = meta?.instrument.point_value ?? 1;
    const close = tick?.ohlc.close ?? position.entry;
    const dir = position.direction === "long" ? 1 : -1;
    const risk = Math.abs(position.entry - position.stop);
    const unreal = (close - position.entry) * dir * pv * position.contracts;
    const unrealR = risk > 0 ? ((close - position.entry) * dir) / risk : 0;

    // watching mode → small non-blocking pill (close still reachable, no scroll)
    if (letRun === posKey) {
      return (
        <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-[55] flex -translate-x-1/2 items-center gap-3 rounded-full border border-line glass-surface px-4 py-2 shadow-2xl shadow-black/50">
          <span className="text-[11px] text-muted">Trade live</span>
          <span className={`font-mono text-sm font-semibold ${signColor(unreal)}`}>{unrealR >= 0 ? "+" : ""}{unrealR.toFixed(2)}R</span>
          <button onClick={() => setLetRun(null)} className="chip border-line text-muted hover:text-text">Show</button>
          <button onClick={closeNow} className="chip border-loss/50 text-loss">Close</button>
        </div>
      );
    }

    return (
      <div className="fixed inset-0 z-[62] grid place-items-center bg-black/45 p-4 backdrop-blur-[1px]" onClick={() => setLetRun(posKey)}>
        <div
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="Open trade"
          className="relative w-[min(24rem,calc(100vw-1.5rem))] rounded-2xl border border-line glass-surface p-4 shadow-2xl shadow-black/60 motion-safe:animate-[fadeIn_.2s_ease-out] before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-accent/70 before:to-transparent"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-display text-[10px] uppercase tracking-[0.2em] text-accent">Trade live</p>
              <p className="text-sm text-text">
                {position.label}{" "}
                <span className={position.direction === "long" ? "text-profit" : "text-loss"}>{position.direction.toUpperCase()}</span>
              </p>
            </div>
            <div className="text-right">
              <span className={`font-mono text-2xl font-bold ${signColor(unreal)}`}>{unrealR >= 0 ? "+" : ""}{unrealR.toFixed(2)}R</span>
              <p className={`font-mono text-[11px] ${signColor(unreal)}`}>{usd.format(unreal)}</p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
            <Cell label="Entry" v={fmt(position.entry)} tone="text-warn" />
            <Cell label="Stop" v={fmt(position.stop)} tone="text-loss" />
            <Cell label="Target" v={fmt(position.target)} tone="text-profit" />
          </div>

          <p className="mt-3 text-[11px] text-muted">
            It auto-closes at your stop or target as the chart plays — or close it now to see the result.
          </p>

          <div className="mt-3 flex gap-2">
            <button onClick={closeNow} className="flex-1 rounded-lg bg-loss px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110">
              Close position
            </button>
            <button onClick={() => setLetRun(posKey)} className="btn flex-1">
              Let it run ▸
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
