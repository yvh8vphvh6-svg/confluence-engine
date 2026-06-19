"use client";

import { useEffect } from "react";

import { logPaperTrade } from "../../lib/api";
import { useStore } from "../../lib/store";

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
      logPaperTrade({
        symbol: tick.symbol,
        timeframe: tick.timeframe,
        strategy: t.strategy,
        direction: t.direction,
        regime: t.regime,
        entry_price: t.entry,
        exit_price: t.exit,
        stop: t.stop,
        target: t.target,
        contracts: t.contracts,
        r_multiple: t.r_multiple,
        pnl_dollars: t.pnl_dollars,
        exit_reason: t.exit_reason,
        opened_at: t.opened_at,
        closed_at: t.closed_at,
      }).catch(() => undefined);
  }, [tick]);

  return null;
}
