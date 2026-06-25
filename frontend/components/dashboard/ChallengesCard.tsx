"use client";

import { useSettings } from "../../lib/settings";
import { useProgression } from "../../lib/useProgression";

export default function ChallengesCard() {
  const { data } = useProgression();
  const reminders = useSettings((s) => s.settings.dailyChallengeReminders);
  if (!data) return null;

  const { challenges, completed } = data.challenges;
  const open = challenges.length - completed;

  return (
    <div className="panel p-4" data-tour="challenges">
      <div className="mb-2 flex items-center justify-between">
        <p className="panel-head">Daily challenges</p>
        {reminders && open > 0 ? (
          <span className="chip border-warn/40 text-warn">{open} to go today</span>
        ) : (
          <span className="chip border-line text-muted">{completed}/{challenges.length} done</span>
        )}
      </div>
      <ul className="space-y-2">
        {challenges.map((c) => {
          const pct = Math.min(100, c.target > 0 ? (c.progress / c.target) * 100 : 0);
          return (
            <li key={c.id} className={`rounded-lg border px-3 py-2 ${c.complete ? "border-profit/40 bg-profit/5" : "border-line bg-surface2/40"}`}>
              <div className="flex items-center justify-between text-xs">
                <span className={c.complete ? "text-profit" : "text-text"}>{c.complete ? "✓ " : ""}{c.text}</span>
                <span className="font-mono text-[10px] text-muted">+{c.xp} XP</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/30">
                  <div className={`h-full rounded-full ${c.complete ? "bg-profit" : "bg-accent"}`} style={{ width: `${pct}%` }} />
                </div>
                <span className="font-mono text-[10px] text-muted">{c.progress}/{c.target}</span>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[10px] text-muted">Refreshes daily · progress tracked from your real trades today.</p>
    </div>
  );
}
