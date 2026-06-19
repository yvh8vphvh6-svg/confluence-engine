"use client";

import { useEffect, useState } from "react";

import { LESSONS } from "../lib/lessons";
import { useStore } from "../lib/store";

const SEEN_KEY = "ce_onboarded_v1";
const DONE_KEY = "ce_lessons_done_v1";

function CapIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M2 8l10-4 10 4-10 4L2 8z" strokeLinejoin="round" />
      <path d="M6 10v4c0 1.5 2.7 3 6 3s6-1.5 6-3v-4" strokeLinecap="round" />
    </svg>
  );
}

export default function OnboardingModal() {
  const open = useStore((s) => s.learnOpen);
  const setOpen = useStore((s) => s.setLearnOpen);
  const [done, setDone] = useState<string[]>([]);
  const [view, setView] = useState<string>("list"); // "list" | lessonId

  // load completion (the interactive Tour is the first-visit experience now;
  // the lessons modal opens from the Learn nav button or the tour hand-off)
  useEffect(() => {
    try {
      setDone(JSON.parse(localStorage.getItem(DONE_KEY) || "[]"));
    } catch {
      /* ignore */
    }
  }, []);

  const persist = (ids: string[]) => {
    setDone(ids);
    try {
      localStorage.setItem(DONE_KEY, JSON.stringify(ids));
    } catch {
      /* ignore */
    }
  };

  if (!open) return null;

  const firstIncomplete = LESSONS.find((l) => !done.includes(l.id));
  const isUnlocked = (id: string, idx: number) =>
    done.includes(id) || idx === 0 || done.includes(LESSONS[idx - 1].id);

  const close = () => {
    setOpen(false);
    setView("list");
  };

  const complete = (id: string) => {
    const ids = done.includes(id) ? done : [...done, id];
    persist(ids);
    const idx = LESSONS.findIndex((l) => l.id === id);
    const next = LESSONS[idx + 1];
    if (next) setView(next.id);
    else setView("list");
  };

  const lesson = LESSONS.find((l) => l.id === view) || null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4" onClick={close}>
      <div
        className="panel max-h-[88vh] w-full max-w-md overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {lesson ? (
          // ---------------- lesson detail ----------------
          <div>
            <div className="mb-3 flex items-start justify-between">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-neon/15 text-neon">
                  <CapIcon />
                </span>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-muted">{lesson.minutes} min lesson</p>
                  <h2 className="text-lg font-semibold text-text">{lesson.title}</h2>
                </div>
              </div>
              <button className="btn" onClick={close}>✕</button>
            </div>
            <div className="space-y-3">
              {lesson.body.map((p, i) => (
                <p key={i} className="text-sm leading-6 text-text">{p}</p>
              ))}
              {lesson.points && (
                <ul className="space-y-2">
                  {lesson.points.map((pt) => (
                    <li key={pt.term} className="rounded-lg border border-line bg-black/20 p-2.5 text-sm">
                      <span className="font-semibold text-neon">{pt.term}</span>
                      <span className="text-muted"> — {pt.desc}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="mt-5 flex gap-2">
              <button className="btn flex-1" onClick={() => setView("list")}>Back to lessons</button>
              {(() => { const li = LESSONS.findIndex((x) => x.id === lesson.id); const hasNext = li < LESSONS.length - 1; return (
              <button
                className="flex-1 rounded-lg bg-neon px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110"
                onClick={() => complete(lesson.id)}
              >
                {done.includes(lesson.id) ? (hasNext ? "Next lesson" : "Back to lessons") : (hasNext ? "Mark complete & next" : "Mark complete & finish")}
              </button>); })()}
            </div>
          </div>
        ) : (
          // ---------------- welcome / list ----------------
          <div>
            <div className="mb-4 flex items-start justify-between">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-neon/15 text-neon">
                <CapIcon />
              </span>
              <button className="text-muted hover:text-text" onClick={close} aria-label="Close">✕</button>
            </div>
            <h1 className="text-2xl font-semibold text-text">Welcome to Training Camp</h1>
            <p className="mt-2 text-sm text-muted">
              Learn the basics of futures trading through a series of short, interactive lessons that explain
              every panel and control in the app.
            </p>

            <ul className="mt-5 space-y-1">
              {LESSONS.map((l, idx) => {
                const completed = done.includes(l.id);
                const unlocked = isUnlocked(l.id, idx);
                return (
                  <li key={l.id}>
                    <button
                      onClick={() => unlocked && setView(l.id)}
                      disabled={!unlocked}
                      className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition ${
                        unlocked ? "hover:bg-white/[0.04]" : "cursor-not-allowed opacity-60"
                      }`}
                    >
                      <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[11px] ${
                        completed ? "border-neon bg-neon/15 text-neon" : unlocked ? "border-neon/50 text-neon" : "border-line text-muted"
                      }`}>
                        {completed ? "✓" : unlocked ? idx + 1 : "🔒"}
                      </span>
                      <span className="flex-1">
                        <span className="block text-sm font-medium text-text">Lesson {idx + 1}</span>
                        <span className="block text-xs text-muted">{l.title}</span>
                      </span>
                      <span className="text-xs italic text-muted">{l.minutes} min</span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <p className="mt-3 text-sm font-medium italic text-text">And more!</p>
            <p className="text-xs text-muted">{LESSONS.length} total lessons and free trading practice.</p>

            <p className="mt-4 rounded-lg border border-warn/30 bg-warn/5 p-3 text-[11px] leading-5 text-warn">
              The data used for Training Camp is simulated, not real. Unlike an actual performance record,
              simulated results do not represent actual trading. No representation is being made that any
              account will or is likely to achieve profit or losses similar to those shown. Not financial advice.
            </p>

            <div className="mt-5 space-y-2">
              <button
                className="w-full rounded-lg bg-neon px-4 py-2.5 text-sm font-semibold text-black transition hover:brightness-110"
                onClick={() => setView((firstIncomplete || LESSONS[0]).id)}
              >
                Get started
              </button>
              <button className="btn w-full" onClick={close}>Back to Dashboard</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
