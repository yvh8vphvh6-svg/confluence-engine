"use client";

import { useSettings } from "../../lib/settings";
import { useProgression } from "../../lib/useProgression";

export default function ChallengesCard() {
  const { data } = useProgression();
  const reminders = useSettings((s) => s.settings.dailyChallengeReminders);
  if (!data) return null;

  const { challenges, completed } = data.challenges;
  const open = challenges.length - completed;
  if (challenges.length === 0) return null;

  // one focal challenge (the first still open, else the first), the rest condensed
  const active = challenges.find((c) => !c.complete) ?? challenges[0];
  const rest = challenges.filter((c) => c.id !== active.id);
  const pct = Math.min(100, active.target > 0 ? (active.progress / active.target) * 100 : 0);
  // empty/in-progress bars stay neutral grey; full saturation only once complete
  const fill = active.complete ? "bg-profit/70" : "bg-muted/40";

  return (
    <div className="panel p-4" data-tour="challenges">
      <div className="mb-2 flex items-center justify-between">
        <p className="panel-head">Daily challenges</p>
        {reminders && open > 0 ? (
          <span className="chip border-warn/40 text-warn">{open} to go</span>
        ) : (
          <span className="chip border-line text-muted">{completed}/{challenges.length} done</span>
        )}
      </div>

      {/* focal: the active challenge, expanded */}
      <div className={`rounded-lg border p-3 ${active.complete ? "border-profit/40 bg-profit/5" : "border-line bg-surface2/40"}`}>
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm text-text">{active.complete ? "✓ " : ""}{active.text}</p>
          <span className="shrink-0 font-mono text-[10px] text-muted">+{active.xp} XP</span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/30">
            <div className={`h-full rounded-full ${fill}`} style={{ width: `${pct}%` }} />
          </div>
          <span className="shrink-0 font-mono text-[11px] text-muted">{active.progress}/{active.target}</span>
        </div>
      </div>

      {/* the rest, condensed to one line each */}
      {rest.length > 0 && (
        <ul className="mt-2 space-y-1">
          {rest.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 px-1 text-[11px]">
              <span className={c.complete ? "text-profit/80" : "text-muted"}>
                {c.complete ? "✓" : "○"} {c.text}
              </span>
              <span className="shrink-0 font-mono text-[10px] text-muted">{c.progress}/{c.target}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-2 text-[10px] text-muted">Refreshes daily · tracked from your real trades today.</p>
    </div>
  );
}
