"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";

import { useStore } from "../lib/store";

type Step = { target: string; title: string; text: string };

const STEPS: Step[] = [
  { target: "nav", title: "Welcome to Training Camp",
    text: "Up top are your modes — Practice (you're here), Backtest, Real Chart, Real Mode — plus the Learn lessons and the Train / Track / Social menus. The trader profile you saw on launch (tier, XP, streak) is all earned from real practice." },
  { target: "controls", title: "Set up the sim",
    text: "Pick the instrument and timeframe, arm strategies, and set the difficulty (chart clarity, Novice→Master) and replay speed." },
  { target: "chart", title: "The chart paces itself",
    text: "Synthetic candles stream bar by bar and AUTO-PAUSE when a genuinely qualified setup forms. News windows and the current difficulty are marked right on it." },
  { target: "chart", title: "Predict before the reveal",
    text: "When it pauses, you read the setup that just formed and pick which strategy fits — your call first, the engine's after. That prediction rep is where the skill builds." },
  { target: "best-setup", title: "The one setup that matters",
    text: "No firehose of signals — just the single qualified setup right now, with the evidence behind it." },
  { target: "trade", title: "Take it or skip it — with a reason",
    text: "Place your own Buy/Sell with a stop, target and size, or skip. Logging WHY you acted is the point; the position auto-closes at your stop or target." },
  { target: "coach", title: "Your coach",
    text: "Tap the coach for a plain-English read of the why and the risk on a setup or your trade. It never promises profit." },
  { target: "paper", title: "Post-trade scorecard",
    text: "Every closed trade gets a quality score and a plain why-it-won-or-lost, tracked in your own paper account — separate from the engine's auto-sim." },
  { target: "metrics", title: "Engine performance & guards",
    text: "The engine's live stats plus the real risk controls — the −2R daily stop and the loss-streak cooldown." },
  { target: "checkin", title: "Psychology & discipline",
    text: "Pre-session mood check-ins, a tilt cooldown after a loss streak, and a max-loss lockout that ends the session. Deeper drills live under Train → Psychology." },
  { target: "challenges", title: "Daily challenges",
    text: "Small daily goals that pay XP and keep you practicing with intent." },
  { target: "track", title: "Progression & your patterns",
    text: "Under Track: your XP, tier, streak and badges (that launch profile, grown), plus the Pattern Library of your tagged setups — and the strategy×regime matrix under Learn → Strategies." },
  { target: "real-mode", title: "Real Mode",
    text: "When synthetic feels easy, replay real recorded bars with the same discipline. Paper trades only — never real orders." },
  { target: "social", title: "Social",
    text: "Leaderboard, head-to-head duels, strategy sharing, mentor mode and success stories." },
  { target: "settings", title: "Make it yours",
    text: "Themes, motion, density, coach and discipline thresholds, and more. You can replay this tour from here any time." },
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
