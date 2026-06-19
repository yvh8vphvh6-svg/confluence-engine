"use client";

import { useEffect, useMemo, useState } from "react";

import type { QuizCard } from "../lib/quizzes";

type Tracked = Record<string, { attempts: number; score: number }>;

export default function MCQuiz({ cards, storageKey }: { cards: QuizCard[]; storageKey: string }) {
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [tracked, setTracked] = useState<Tracked>({});

  useEffect(() => {
    try {
      setTracked(JSON.parse(localStorage.getItem(storageKey) || "{}"));
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  const card = cards[idx];
  const choose = (i: number) => {
    if (picked !== null) return;
    setPicked(i);
    const next: Tracked = { ...tracked };
    const t = (next[card.tag] ??= { attempts: 0, score: 0 });
    t.attempts += 1;
    t.score += card.options[i].score;
    setTracked(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const advance = () => {
    setPicked(null);
    setIdx((i) => (i + 1) % cards.length);
  };

  const weakest = useMemo(() => {
    const rows = Object.entries(tracked)
      .filter(([, v]) => v.attempts > 0)
      .map(([tag, v]) => ({ tag, avg: v.score / v.attempts, attempts: v.attempts }))
      .sort((a, b) => a.avg - b.avg);
    return rows;
  }, [tracked]);

  return (
    <div className="space-y-4">
      <div className="panel p-5">
        <div className="mb-2 flex items-center justify-between">
          <span className="chip border-accent/40 text-accent">{card.tag}</span>
          <span className="text-[10px] text-muted">{idx + 1}/{cards.length}</span>
        </div>
        <p className="text-sm font-medium text-text">{card.prompt}</p>
        <div className="mt-3 space-y-2">
          {card.options.map((o, i) => {
            const isPicked = picked === i;
            const reveal = picked !== null;
            const tone = !reveal
              ? "border-line hover:border-neon/50"
              : o.best
                ? "border-profit/60 bg-profit/10"
                : isPicked
                  ? "border-loss/50 bg-loss/10"
                  : "border-line opacity-70";
            return (
              <button
                key={i}
                onClick={() => choose(i)}
                disabled={reveal}
                className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition ${tone}`}
              >
                <span className="text-text">{o.text}</span>
                {reveal && (
                  <span className={`shrink-0 font-mono text-xs ${o.score >= 8 ? "text-profit" : o.score <= 2 ? "text-loss" : "text-muted"}`}>
                    {o.score}/10{o.best ? " ★" : ""}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {picked !== null && (
          <div className="mt-3 rounded-lg border border-line bg-black/20 p-3">
            <p className="text-sm text-text">{card.explanation}</p>
            <button onClick={advance} className="btn mt-3">Next →</button>
          </div>
        )}
      </div>

      {weakest.length > 0 && (
        <div className="panel p-4">
          <p className="panel-head mb-2">Your patterns (this device)</p>
          <ul className="space-y-1 text-xs">
            {weakest.map((r) => (
              <li key={r.tag} className="flex items-center justify-between">
                <span className="text-muted">{r.tag}</span>
                <span className={`font-mono ${r.avg >= 8 ? "text-profit" : r.avg <= 4 ? "text-loss" : "text-warn"}`}>
                  {r.avg.toFixed(1)}/10 avg · {r.attempts}×
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] text-muted">Lowest scores first — those are the habits to work on. Education only; not financial advice.</p>
        </div>
      )}
    </div>
  );
}
