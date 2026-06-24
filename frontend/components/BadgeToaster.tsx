"use client";

import { useEffect, useState } from "react";

import type { Badge } from "../lib/api";
import { useProgression } from "../lib/useProgression";
import { useReducedMotion } from "../lib/useMotion";

const SEEN_KEY = "ce_badges_seen_v1";

// Watches progression and toasts when a badge unlocks. The first ever load just
// baselines the seen-set (no toast for already-earned badges).
export default function BadgeToaster() {
  const { data } = useProgression();
  const reduced = useReducedMotion();
  const [toast, setToast] = useState<Badge | null>(null);

  useEffect(() => {
    if (!data) return;
    const unlockedIds = data.badges.filter((b) => b.unlocked).map((b) => b.id);
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(SEEN_KEY);
    } catch {
      raw = null;
    }
    if (raw === null) {
      try {
        localStorage.setItem(SEEN_KEY, JSON.stringify(unlockedIds));
      } catch {
        /* ignore */
      }
      return; // baseline only
    }
    let seen: string[] = [];
    try {
      seen = JSON.parse(raw) as string[];
    } catch {
      seen = [];
    }
    const newly = data.badges.find((b) => b.unlocked && !seen.includes(b.id));
    if (newly) {
      setToast(newly);
      try {
        localStorage.setItem(SEEN_KEY, JSON.stringify(unlockedIds));
      } catch {
        /* ignore */
      }
      const id = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(id);
    }
  }, [data]);

  if (!toast) return null;
  return (
    <div
      role="status"
      className={`fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 z-[60] flex items-center gap-3 rounded-xl border border-accent/60 glass-surface px-4 py-3 shadow-2xl shadow-black/50 ${reduced ? "" : "motion-safe:animate-[fadeIn_.3s_ease-out]"}`}
    >
      <span className="text-2xl" aria-hidden="true">{toast.icon}</span>
      <div>
        <p className="font-display text-[10px] uppercase tracking-[0.18em] text-accent">Badge unlocked</p>
        <p className="text-sm font-semibold text-text">{toast.name}</p>
        <p className="text-[11px] text-muted">{toast.description}</p>
      </div>
      <button onClick={() => setToast(null)} aria-label="Dismiss" className="ml-2 text-muted hover:text-text">✕</button>
    </div>
  );
}
