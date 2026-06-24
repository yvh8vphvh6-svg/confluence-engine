"use client";

import { useStore } from "../../lib/store";

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

export default function PostTradeCard() {
  const t = useStore((s) => s.lastClosed);
  const dismiss = useStore((s) => s.dismissPostTrade);
  if (!t || !t.quality) return null;

  const q = t.quality;
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
    <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-50 w-[min(26rem,calc(100vw-1.5rem))] max-h-[78vh] -translate-x-1/2 overflow-y-auto rounded-2xl border border-line glass-surface p-4 shadow-2xl shadow-black/50 motion-safe:animate-[fadeIn_.3s_ease-out] before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-accent/70 before:to-transparent">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-display text-[10px] uppercase tracking-[0.2em] text-accent">Post-trade</p>
          <p className="text-sm font-semibold text-text">
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
      <button onClick={dismiss} className="mt-3 w-full rounded-lg bg-neon px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110">
        Got it
      </button>
    </div>
  );
}
