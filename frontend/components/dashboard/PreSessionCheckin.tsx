"use client";

import { addJournalSession } from "../../lib/api";
import { useSettings } from "../../lib/settings";
import { useStore } from "../../lib/store";

// Pre-session emotional check-in (B1). One tap, stored on the session record and
// denormalized onto this session's trades for the correlation view. Gated behind
// the "Emotional check-ins" setting; dismissible — never blocks.
const MOODS: { key: string; icon: string }[] = [
  { key: "Focused", icon: "🎯" },
  { key: "Frustrated", icon: "😤" },
  { key: "Tired", icon: "🥱" },
  { key: "Excited", icon: "⚡" },
];

export default function PreSessionCheckin() {
  const enabled = useSettings((s) => s.settings.emotionalCheckins);
  const answered = useStore((s) => s.preSessionAnswered);
  const setState = useStore((s) => s.setPreEmotionalState);
  const dismiss = useStore((s) => s.dismissPreSession);

  if (!enabled || answered) return null;

  const pick = (mood: string) => {
    setState(mood);
    void addJournalSession({ pre_emotional_state: mood, mood }).catch(() => undefined);
  };

  return (
    <div className="panel p-4" data-tour="checkin">
      <div className="flex items-center justify-between">
        <p className="panel-head">Pre-session check-in</p>
        <button type="button" onClick={dismiss} className="text-[11px] text-muted underline hover:text-text">
          Skip
        </button>
      </div>
      <p className="mt-1 text-sm text-text">How are you feeling?</p>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {MOODS.map((m) => (
          <button key={m.key} type="button" onClick={() => pick(m.key)} className="btn justify-center">
            <span aria-hidden="true" className="mr-1">{m.icon}</span> {m.key}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-muted">
        One tap — logged with this session so you can see how state correlates with results. Practice only.
      </p>
    </div>
  );
}
