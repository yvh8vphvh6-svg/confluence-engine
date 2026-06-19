"use client";

import { useEffect, useState } from "react";

import { getJournal, getDecisionStats } from "../../lib/api";

type Metrics = {
  trades: number;
  expectancy: number | null;
  sessions: number;
  decisions: number;
  accuracy: number;     // 0..1
  drills: number;       // scenario + psychology answers
};

type Req = { label: string; ok: (m: Metrics) => boolean; progress: (m: Metrics) => string };

type Level = { name: string; blurb: string; reqs: Req[] };

const LEVELS: Level[] = [
  {
    name: "Beginner", blurb: "Learn the map: glossary, lessons, and the tour.",
    reqs: [{ label: "Open the app", ok: () => true, progress: () => "✓" }],
  },
  {
    name: "Apprentice", blurb: "You've started practicing and reflecting.",
    reqs: [
      { label: "Answer 10 scenario / psychology cards", ok: (m) => m.drills >= 10, progress: (m) => `${Math.min(m.drills, 10)}/10` },
      { label: "Log 5 paper trades", ok: (m) => m.trades >= 5, progress: (m) => `${Math.min(m.trades, 5)}/5` },
    ],
  },
  {
    name: "Intermediate", blurb: "You can read setups and manage risk.",
    reqs: [
      { label: "Make 20 training decisions", ok: (m) => m.decisions >= 20, progress: (m) => `${Math.min(m.decisions, 20)}/20` },
      { label: "Decision accuracy ≥ 45%", ok: (m) => m.accuracy >= 0.45, progress: (m) => `${Math.round(m.accuracy * 100)}%` },
      { label: "Log 20 paper trades", ok: (m) => m.trades >= 20, progress: (m) => `${Math.min(m.trades, 20)}/20` },
    ],
  },
  {
    name: "Advanced", blurb: "Consistent process across more reps.",
    reqs: [
      { label: "Decision accuracy ≥ 55%", ok: (m) => m.accuracy >= 0.55, progress: (m) => `${Math.round(m.accuracy * 100)}%` },
      { label: "50 training decisions", ok: (m) => m.decisions >= 50, progress: (m) => `${Math.min(m.decisions, 50)}/50` },
      { label: "Log 50 paper trades", ok: (m) => m.trades >= 50, progress: (m) => `${Math.min(m.trades, 50)}/50` },
      { label: "Write 3 session reviews", ok: (m) => m.sessions >= 3, progress: (m) => `${Math.min(m.sessions, 3)}/3` },
    ],
  },
  {
    name: "Expert", blurb: "Large sample, positive expectancy, disciplined.",
    reqs: [
      { label: "Decision accuracy ≥ 60%", ok: (m) => m.accuracy >= 0.6, progress: (m) => `${Math.round(m.accuracy * 100)}%` },
      { label: "Log 100 paper trades", ok: (m) => m.trades >= 100, progress: (m) => `${Math.min(m.trades, 100)}/100` },
      { label: "Positive expectancy (R)", ok: (m) => (m.expectancy ?? -1) > 0, progress: (m) => `${(m.expectancy ?? 0).toFixed(2)}R` },
      { label: "10 session reviews", ok: (m) => m.sessions >= 10, progress: (m) => `${Math.min(m.sessions, 10)}/10` },
    ],
  },
];

function levelComplete(lv: Level, m: Metrics) {
  return lv.reqs.every((r) => r.ok(m));
}

export default function ProgressPage() {
  const [m, setM] = useState<Metrics | null>(null);

  useEffect(() => {
    let drills = 0;
    try {
      for (const key of ["ce_scenarios_v1", "ce_psychology_v1"]) {
        const t = JSON.parse(localStorage.getItem(key) || "{}");
        drills += Object.values(t).reduce((a: number, v: any) => a + (v?.attempts || 0), 0);
      }
    } catch { /* ignore */ }
    Promise.all([getJournal().catch(() => null), getDecisionStats().catch(() => null)]).then(([j, d]) => {
      setM({
        trades: j?.stats.n ?? 0,
        expectancy: j?.stats.expectancy_r ?? null,
        sessions: j?.sessions.length ?? 0,
        decisions: d?.n ?? 0,
        accuracy: d?.accuracy ?? 0,
        drills,
      });
    });
  }, []);

  if (!m) return <p className="p-4 text-sm text-muted">Loading…</p>;

  // current level = highest fully-complete level (levels are cumulative in spirit)
  let current = 0;
  for (let i = 0; i < LEVELS.length; i++) {
    if (levelComplete(LEVELS[i], m)) current = i;
    else break;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-text">Progression</h1>
        <p className="text-sm text-muted">
          Skill levels with concrete, data-driven unlock requirements — earned from your decisions, journaled
          trades, reviews and drills (tracked on this device / backend). No shortcuts, no fake stats.
        </p>
      </header>

      <div className="panel p-4">
        <p className="text-[10px] uppercase tracking-wider text-muted">Current level</p>
        <p className="text-2xl font-semibold text-neon">{LEVELS[current].name}</p>
        <p className="text-xs text-muted">{LEVELS[current].blurb}</p>
        <div className="mt-3 flex gap-1">
          {LEVELS.map((lv, i) => (
            <div key={lv.name} className={`h-1.5 flex-1 rounded ${i <= current ? "bg-neon" : "bg-line"}`} />
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {LEVELS.map((lv, i) => {
          const done = levelComplete(lv, m);
          const isNext = i === current + 1;
          return (
            <div key={lv.name} className={`panel p-4 ${isNext ? "border-neon/40" : ""}`}>
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-text">{i + 1}. {lv.name}</h2>
                <span className={`chip ${done ? "border-profit/50 text-profit" : isNext ? "border-neon/50 text-neon" : "border-line text-muted"}`}>
                  {done ? "unlocked" : isNext ? "in progress" : "locked"}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted">{lv.blurb}</p>
              <ul className="mt-2 space-y-1">
                {lv.reqs.map((r) => {
                  const ok = r.ok(m);
                  return (
                    <li key={r.label} className="flex items-center justify-between rounded-lg border border-line bg-black/20 px-3 py-1.5 text-xs">
                      <span className={ok ? "text-text" : "text-muted"}>{ok ? "✓" : "○"} {r.label}</span>
                      <span className={`font-mono ${ok ? "text-profit" : "text-muted"}`}>{r.progress(m)}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
