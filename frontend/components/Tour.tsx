"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";

import { useStore } from "../lib/store";

type Step = { target: string; title: string; text: string };

const STEPS: Step[] = [
  { target: "nav", title: "Your three modes", text: "Practice (you're here), Backtest, and Real Chart — plus the Learn lessons and reference tabs. Switch any time." },
  { target: "controls", title: "Set up the sim", text: "Pick the instrument and timeframe, choose which strategies are armed, and control replay speed (0.25×–8×)." },
  { target: "chart", title: "The chart paces itself", text: "Synthetic candles stream bar by bar. When a genuinely qualified setup appears it AUTO-PAUSES and zooms in so you can actually study it — no firehose." },
  { target: "best-setup", title: "The one setup that matters", text: "Instead of a signal every second, this shows the single qualified setup right now — stable, with its evidence." },
  { target: "trade", title: "Trade it yourself", text: "Place a market Buy or Sell at ANY time with your own stop, target and size. Your position is drawn on the chart and tracked here; it auto-closes at your stop or target." },
  { target: "coach", title: "Your coach", text: "On qualified setups and your own trades, the coach explains the why and the risk in plain English. It never promises profit." },
  { target: "paper", title: "Your paper account", text: "Your trades have their own balance, win rate and expectancy — separate from the engine's auto-sim. Everything logs to your Journal." },
  { target: "metrics", title: "Engine performance", text: "The engine's own live stats and the real risk controls (−2R daily stop, loss-streak cooldown)." },
];

export default function Tour() {
  const open = useStore((s) => s.tourOpen);
  const setOpen = useStore((s) => s.setTourOpen);
  const setLearnOpen = useStore((s) => s.setLearnOpen);
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const step = STEPS[idx];

  const measure = useCallback(() => {
    if (!open) return;
    const el = document.querySelector(`[data-tour="${step.target}"]`) as HTMLElement | null;
    if (!el) {
      setRect(null);
      return;
    }
    setRect(el.getBoundingClientRect());
  }, [open, step]);

  // scroll target into view on step change, then measure
  useEffect(() => {
    if (!open) return;
    const el = document.querySelector(`[data-tour="${step.target}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    const t = setTimeout(measure, 320);
    return () => clearTimeout(t);
  }, [open, idx, step, measure]);

  useLayoutEffect(() => {
    if (!open) return;
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, measure]);

  if (!open) return null;

  const close = () => {
    setOpen(false);
    setIdx(0);
    try {
      localStorage.setItem("ce_tour_seen_v1", "1");
    } catch {
      /* ignore */
    }
  };

  const isLast = idx === STEPS.length - 1;
  const pad = 8;
  const highlight = rect
    ? {
        top: Math.max(rect.top - pad, 4),
        left: Math.max(rect.left - pad, 4),
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
      }
    : null;

  // tooltip placement: below the target if room, else above; fallback centered
  const ttWidth = 320;
  let ttTop = window.innerHeight / 2 - 80;
  let ttLeft = window.innerWidth / 2 - ttWidth / 2;
  if (highlight) {
    const below = highlight.top + highlight.height + 12;
    ttTop = below + 180 < window.innerHeight ? below : Math.max(highlight.top - 188, 12);
    ttLeft = Math.min(Math.max(highlight.left, 12), window.innerWidth - ttWidth - 12);
  }

  return (
    <div className="fixed inset-0 z-[70]">
      {/* spotlight: a hole over the target with a dark surround */}
      {highlight ? (
        <div
          className="pointer-events-none absolute rounded-xl ring-2 ring-neon transition-all duration-200"
          style={{
            top: highlight.top,
            left: highlight.left,
            width: highlight.width,
            height: highlight.height,
            boxShadow: "0 0 0 9999px rgba(5,8,15,0.78)",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/75" />
      )}

      {/* tooltip card */}
      <div
        className="absolute panel p-4"
        style={{ top: ttTop, left: ttLeft, width: ttWidth }}
      >
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-[0.2em] text-neon">
            Tour · {idx + 1}/{STEPS.length}
          </span>
          <button onClick={close} className="text-muted hover:text-text" aria-label="Skip tour">Skip</button>
        </div>
        <h3 className="text-base font-semibold text-text">{step.title}</h3>
        <p className="mt-1 text-sm leading-6 text-muted">{step.text}</p>
        <div className="mt-4 flex items-center gap-2">
          <button onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0} className="btn disabled:opacity-40">
            Back
          </button>
          {isLast ? (
            <>
              <button
                onClick={() => { close(); setLearnOpen(true); }}
                className="btn flex-1"
              >
                Open lessons
              </button>
              <button
                onClick={close}
                className="flex-1 rounded-lg bg-neon px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110"
              >
                Start practicing
              </button>
            </>
          ) : (
            <button
              onClick={() => setIdx((i) => Math.min(STEPS.length - 1, i + 1))}
              className="flex-1 rounded-lg bg-neon px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110"
            >
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
