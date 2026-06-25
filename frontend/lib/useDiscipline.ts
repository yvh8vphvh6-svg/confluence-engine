"use client";

import { useEffect, useState } from "react";

import { useSettings } from "./settings";
import { useStore } from "./store";

// Single source of truth for the discipline gate. Everything derives from the
// user's OWN paper session (loss streak, paper P&L → lockout) — never the engine
// auto-sim. A 1s tick keeps the cooldown countdown live.
export type DisciplineGate = {
  consecutiveLosses: number;
  threshold: number;
  tiltActive: boolean; // losses >= threshold, no cooldown running yet
  cooldownActive: boolean;
  cooldownRemainingMs: number;
  cooldownMinutes: number;
  lockedOut: boolean;
  revengeGuard: boolean;
  pendingOverride: boolean;
  canTake: boolean; // false while locked out or in an active cooldown
};

export function useDiscipline(): DisciplineGate {
  const lossStreak = useStore((s) => s.session.lossStreak);
  const tiltCooldownUntil = useStore((s) => s.tiltCooldownUntil);
  const lockedOut = useStore((s) => s.lockedOut);
  const pendingOverride = useStore((s) => s.pendingRevengeOverride);
  const threshold = useSettings((s) => s.settings.tiltThresholdLosses);
  const cooldownMinutes = useSettings((s) => s.settings.cooldownMinutes);
  const revengeGuard = useSettings((s) => s.settings.revengeGuard);

  // starts at 0 so SSR + first paint match; real clock kicks in after mount
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const cooldownRemainingMs = Math.max(0, tiltCooldownUntil - now);
  const cooldownActive = now > 0 && tiltCooldownUntil > 0 && cooldownRemainingMs > 0;
  const tiltActive = lossStreak >= threshold && !cooldownActive && !lockedOut;
  const canTake = !lockedOut && !cooldownActive;

  return {
    consecutiveLosses: lossStreak,
    threshold,
    tiltActive,
    cooldownActive,
    cooldownRemainingMs,
    cooldownMinutes,
    lockedOut,
    revengeGuard,
    pendingOverride,
    canTake,
  };
}
