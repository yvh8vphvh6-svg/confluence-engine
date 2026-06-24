"use client";

import type { Badge } from "../lib/api";

export default function BadgeGrid({ badges }: { badges: Badge[] }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {badges.map((b) => (
        <div
          key={b.id}
          title={b.description}
          className={`rounded-lg border p-2.5 text-center transition ${
            b.unlocked ? "border-accent/60 bg-accent/10" : "border-line bg-surface2/40"
          }`}
        >
          <div className={`text-2xl ${b.unlocked ? "" : "opacity-40 grayscale"}`} aria-hidden="true">{b.icon}</div>
          <p className={`mt-1 text-[11px] font-semibold ${b.unlocked ? "text-text" : "text-muted"}`}>{b.name}</p>
          <p className="text-[9px] text-muted">{b.unlocked ? "unlocked" : b.progress_label}</p>
        </div>
      ))}
    </div>
  );
}
