"use client";

import { useEffect } from "react";

import { logPaperTrade } from "../../lib/api";
import { tradeLogPayload, useStore } from "../../lib/store";

// Headless: auto-closes the user's open paper position when a streamed bar hits
// the stop or target, and persists every closed paper trade to the journal.
export default function ManualController() {
  const tick = useStore((s) => s.latestTick);

  useEffect(() => {
    if (!tick) return;
    const { paperPosition: p, closePaper } = useStore.getState();
    if (!p) return;
    const { high, low } = tick.ohlc;
    let exit: number | null = null;
    let reason = "";
    if (p.direction === "long") {
      if (low <= p.stop) {
        exit = p.stop;
        reason = "stop";
      } else if (high >= p.target) {
        exit = p.target;
        reason = "target";
      }
    } else {
      if (high >= p.stop) {
        exit = p.stop;
        reason = "stop";
      } else if (low <= p.target) {
        exit = p.target;
        reason = "target";
      }
    }
    if (exit == null) return;
    const t = closePaper(exit, reason, tick.ohlc.time.toString(), tick.bar_index);
    if (t)
      logPaperTrade(tradeLogPayload(t, tick.symbol, tick.timeframe))
        .then((r) => useStore.getState().setLastClosedId(r.id))
        .catch(() => undefined);
  }, [tick]);

  return null;
}
