"use client";

import { useCallback, useEffect, useState } from "react";

import { getProgression, type Progression } from "./api";
import { useStore } from "./store";

// Shared progression fetcher. Re-fetches whenever a paper trade closes (XP,
// streak, badges and challenge progress all derive from the trade records).
export function useProgression(): { data: Progression | null; refresh: () => void } {
  const [data, setData] = useState<Progression | null>(null);
  const tradesN = useStore((s) => s.paperTrades.length);

  const refresh = useCallback(() => {
    const ctrl = new AbortController();
    getProgression(ctrl.signal).then(setData).catch(() => undefined);
    return () => ctrl.abort();
  }, []);

  useEffect(() => refresh(), [refresh, tradesN]);

  return { data, refresh };
}
