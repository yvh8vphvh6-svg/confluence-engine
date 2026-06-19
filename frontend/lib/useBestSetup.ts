"use client";

import { useEffect, useRef, useState } from "react";

import { useStore, type StrategySignalView } from "./store";

// The single genuinely-qualified setup, debounced so the panel stays STABLE and
// only changes when the qualified setup actually changes (no per-bar churn).
export function useBestSetup(debounceMs = 700): StrategySignalView | null {
  const tick = useStore((s) => s.latestTick);
  const [shown, setShown] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const target = tick?.qualified_setup ?? null;

  useEffect(() => {
    if (target === shown) return;
    if (timer.current) clearTimeout(timer.current);
    // promote a new best setup only if it persists for debounceMs;
    // clearing (target === null) applies immediately so stale cards don't linger
    if (target === null) {
      setShown(null);
      return;
    }
    timer.current = setTimeout(() => setShown(target), debounceMs);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [target, shown, debounceMs]);

  if (!tick || !shown) return null;
  return tick.signals.find((s) => s.name === shown) ?? null;
}
