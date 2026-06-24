"use client";

import { useEffect, useState } from "react";

import { getDecisionStats, getJournal, getProgression, type Progression } from "../lib/api";
import { useSettings } from "../lib/settings";
import { computeTraderProfile, type TraderProfile } from "../lib/traderProfile";
import { useReducedMotion } from "../lib/useMotion";
import BadgeGrid from "./BadgeGrid";

const SEEN_KEY = "ce_boot_seen_v1";
const BOOT_LINES = ["init confluence engine", "load market context", "sync trader profile"];

type Stage = "checking" | "boot" | "ready" | "hidden";

export default function BootHero() {
  const reduced = useReducedMotion();
  const displayName = useSettings((s) => s.settings.displayName);
  const [stage, setStage] = useState<Stage>("checking");
  const [lineCount, setLineCount] = useState(0);
  const [profile, setProfile] = useState<TraderProfile | null>(null);
  const [prog, setProg] = useState<Progression | null>(null);

  // decide whether to show (once per session) — runs only on the client so SSR
  // and first paint both render null (no hydration mismatch)
  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem(SEEN_KEY) === "1";
    } catch {
      seen = false;
    }
    setStage(seen ? "hidden" : "boot");
  }, []);

  // pull REAL stored stats once we're showing
  useEffect(() => {
    if (stage !== "boot") return;
    let cancelled = false;
    Promise.all([
      getJournal().catch(() => null),
      getDecisionStats().catch(() => null),
      getProgression().catch(() => null),
    ]).then(([j, d, p]) => {
      if (cancelled) return;
      setProfile(computeTraderProfile(j, d));
      setProg(p);
    });
    return () => {
      cancelled = true;
    };
  }, [stage]);

  // boot line reveal (instant under reduced-motion)
  useEffect(() => {
    if (stage !== "boot") return;
    if (reduced) {
      setLineCount(BOOT_LINES.length);
      return;
    }
    setLineCount(0);
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setLineCount(i);
      if (i >= BOOT_LINES.length) clearInterval(id);
    }, 480);
    return () => clearInterval(id);
  }, [stage, reduced]);

  const dismiss = () => {
    try {
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
    setStage("hidden");
  };

  if (stage === "checking" || stage === "hidden") return null;

  const booting = lineCount < BOOT_LINES.length || profile === null || prog === null;

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-background/90 px-4 backdrop-blur-md">
      <div className="panel w-full max-w-lg p-6 motion-safe:animate-[fadeIn_.4s_ease-out]">
        <div className="flex items-center justify-between">
          <p className="font-display text-xs uppercase tracking-[0.25em] text-accent">Confluence Engine</p>
          <button onClick={dismiss} className="text-[11px] text-muted underline hover:text-text">Skip</button>
        </div>

        {/* boot log */}
        <ul className="mt-4 space-y-1 font-mono text-xs">
          {BOOT_LINES.map((l, i) => {
            const shown = i < lineCount;
            const last = i === lineCount - 1 && booting;
            return (
              <li key={l} className={shown ? "text-text" : "text-muted/40"}>
                <span className="text-neon">{shown ? "✓" : "·"}</span> {l}
                {last && <span className="ml-1 animate-pulse text-neon">▮</span>}
              </li>
            );
          })}
        </ul>

        {/* trader profile hero — REAL XP / tier / streak / badges from progression */}
        {!booting && profile && prog && (
          <div className="mt-5 max-h-[60vh] overflow-y-auto border-t border-line/60 pt-5 motion-safe:animate-[fadeIn_.4s_ease-out]">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-muted">{displayName} · trader tier</p>
                <p className="font-display text-2xl font-bold text-text">{prog.xp.tier.tier}</p>
              </div>
              <div className="text-right">
                <p className="font-mono text-sm text-text">{prog.xp.total} XP</p>
                <p className="font-mono text-[11px] text-muted">
                  tier {prog.xp.tier.index + 1}/{prog.xp.tier.count}
                  {prog.streak.current > 0 ? ` · 🔥 ${prog.streak.current}d` : ""}
                </p>
              </div>
            </div>

            {/* XP bar to next tier */}
            <div className="mt-3">
              <div className="mb-1 flex justify-between text-[10px] text-muted">
                <span>{prog.xp.tier.next_tier ? `next: ${prog.xp.tier.next_tier}` : "max tier"}</span>
                <span className="font-mono">
                  {prog.xp.tier.to_next != null ? `${prog.xp.tier.to_next} XP to go` : "maxed"}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full border border-line bg-black/30">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-neon to-accent transition-[width] duration-700"
                  style={{ width: `${prog.xp.tier.pct}%` }}
                />
              </div>
            </div>

            {/* real stat tiles */}
            <div className="mt-4 grid grid-cols-3 gap-2">
              {profile.tiles.map((t) => (
                <div key={t.label} className="rounded-lg border border-line/70 bg-surface2/50 p-2.5 text-center">
                  <p className="text-[8px] uppercase tracking-wider text-muted">{t.label}</p>
                  <p className="mt-1 font-mono text-base font-semibold text-text">{t.value}</p>
                </div>
              ))}
            </div>

            {/* achievement badges */}
            <p className="mt-4 text-[10px] uppercase tracking-wider text-muted">Badges</p>
            <div className="mt-1">
              <BadgeGrid badges={prog.badges} />
            </div>

            {!profile.hasData && (
              <p className="mt-3 text-center text-[10px] text-muted">
                No practice logged yet — take some paper trades and your real XP, tier and badges fill in here.
              </p>
            )}

            <button
              onClick={dismiss}
              className="mt-5 w-full rounded-lg bg-neon px-4 py-2.5 text-sm font-semibold text-black transition hover:brightness-110"
            >
              Enter training camp →
            </button>
          </div>
        )}

        <p className="mt-4 text-center text-[9px] text-muted">
          Simulation / synthetic data. Stats are computed from your own practice — never invented.
        </p>
      </div>
    </div>
  );
}
