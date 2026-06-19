"use client";

import { useStore } from "../../lib/store";

export default function StatusBar() {
  const connection = useStore((s) => s.connection);
  const stream = useStore((s) => s.stream);
  const error = useStore((s) => s.error);
  const tick = useStore((s) => s.latestTick);

  const live = connection === "connected" && stream === "ready";
  const label =
    stream === "building"
      ? "Building timeline…"
      : live
        ? "Stream live"
        : connection === "error"
          ? "Stream error"
          : "Connecting…";
  const dot = stream === "building" ? "bg-warn" : live ? "bg-profit" : connection === "error" ? "bg-loss" : "bg-warn";

  return (
    <div className="flex items-center gap-3 rounded-lg border border-line bg-black/20 px-3 py-2" title={error || label}>
      <span className={`h-2.5 w-2.5 rounded-full ${dot} ${live || stream === "building" ? "animate-pulse" : ""}`} />
      <div>
        <p className="text-xs font-medium text-text">{label}</p>
        <p className="text-[10px] text-muted">
          {tick ? `${tick.playing ? "playing" : "paused"} · ${tick.metrics.elapsed_seconds.toFixed(0)}s sim time` : "awaiting data"}
        </p>
      </div>
    </div>
  );
}
