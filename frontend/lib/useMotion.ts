"use client";

import { useSettings } from "./settings";
import { useMediaQuery } from "./useMediaQuery";

// Resolves the effective "reduced motion" state: the Settings preference wins,
// falling back to the OS setting when it's "system".
export function useReducedMotion(): boolean {
  const pref = useSettings((s) => s.settings.reducedMotion);
  const osReduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  if (pref === "on") return true;
  if (pref === "off") return false;
  return osReduced;
}
