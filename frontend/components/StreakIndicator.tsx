"use client";

import { useProgression } from "../lib/useProgression";

// Small top-bar streak chip. Hidden until there's a streak to show.
export default function StreakIndicator() {
  const { data } = useProgression();
  const cur = data?.streak.current ?? 0;
  if (cur <= 0) return null;
  return (
    <span
      className="flex items-center gap-1 rounded-full border border-warn/40 bg-warn/10 px-2 py-1 text-[11px] font-medium text-warn"
      title={`Best streak ${data?.streak.best ?? cur} days`}
    >
      <span aria-hidden="true">🔥</span> {cur}d
    </span>
  );
}
