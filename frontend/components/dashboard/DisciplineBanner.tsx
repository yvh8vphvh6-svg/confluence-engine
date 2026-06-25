"use client";

import { useEffect, useRef, useState } from "react";

import { logCooldownEvent } from "../../lib/api";
import { useSettings } from "../../lib/settings";
import { useStore } from "../../lib/store";

// Tilt detection + cooldown + max-loss lockout (C + D). Calm, supportive copy —
// no flashing/pulsing (safe under reduced motion: nothing here animates). Drives
// the Take gate via store state (tiltCooldownUntil / lockedOut).
export default function DisciplineBanner() {
  const lossStreak = useStore((s) => s.session.lossStreak);
  const tiltCooldownUntil = useStore((s) => s.tiltCooldownUntil);
  const lockedOut = useStore((s) => s.lockedOut);
  const startCooldown = useStore((s) => s.startTiltCooldown);
  const endCooldown = useStore((s) => s.endTiltCooldown);
  const armOverride = useStore((s) => s.armRevengeOverride);

  const threshold = useSettings((s) => s.settings.tiltThresholdLosses);
  const minutes = useSettings((s) => s.settings.cooldownMinutes);
  const revengeGuard = useSettings((s) => s.settings.revengeGuard);

  const [now, setNow] = useState(0);
  const [confirmOverride, setConfirmOverride] = useState(false);
  const loggedRef = useRef(false);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remaining = Math.max(0, tiltCooldownUntil - now);
  const cooling = now > 0 && tiltCooldownUntil > 0 && remaining > 0;

  // reset the once-per-cooldown log guard whenever a new cooldown begins
  useEffect(() => {
    if (tiltCooldownUntil > 0) loggedRef.current = false;
    setConfirmOverride(false);
  }, [tiltCooldownUntil]);

  // natural expiry → log a completed cooldown exactly once, then clear
  useEffect(() => {
    if (now > 0 && tiltCooldownUntil > 0 && remaining <= 0 && !loggedRef.current) {
      loggedRef.current = true;
      void logCooldownEvent({ type: "tilt", length_min: minutes, ended_early: false }).catch(() => undefined);
      endCooldown();
    }
  }, [now, tiltCooldownUntil, remaining, minutes, endCooldown]);

  const endEarly = () => {
    loggedRef.current = true;
    void logCooldownEvent({ type: "tilt", length_min: minutes, ended_early: true }).catch(() => undefined);
    endCooldown();
  };
  const takeAnyway = () => {
    if (revengeGuard && !confirmOverride) {
      setConfirmOverride(true);
      return;
    }
    loggedRef.current = true;
    void logCooldownEvent({ type: "tilt", length_min: minutes, ended_early: true }).catch(() => undefined);
    armOverride();
  };

  const tiltActive = lossStreak >= threshold && !cooling && !lockedOut;

  if (lockedOut) {
    return (
      <div className="panel border-loss/50 p-4" role="status" data-tour="discipline">
        <p className="panel-head text-loss">Daily loss limit hit</p>
        <p className="mt-1 text-sm text-text">
          Session over — this is the rule that keeps live accounts alive. Step away, then review and start a fresh session when you&apos;re ready.
        </p>
        <p className="mt-1 text-[11px] text-muted">
          New entries are locked for this session. Stopping cleanly at your limit is the disciplined move — it earns discipline XP.
        </p>
      </div>
    );
  }

  if (cooling) {
    const secs = Math.ceil(remaining / 1000);
    const mm = Math.floor(secs / 60);
    const ss = secs % 60;
    return (
      <div className="panel border-warn/50 p-4" role="status" data-tour="discipline">
        <div className="flex items-center justify-between">
          <p className="panel-head text-warn">Cooldown — observe only</p>
          <span className="chip border-warn/50 font-mono text-warn">⏳ {mm}:{String(ss).padStart(2, "0")}</span>
        </div>
        <p className="mt-1 text-sm text-text">
          Stepping back after a run of losses. New entries are paused — keep watching the chart; the read sharpens when you&apos;re calm.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" onClick={endEarly} className="btn text-[11px]">End early</button>
          <button type="button" onClick={takeAnyway} className={`btn text-[11px] ${confirmOverride ? "border-loss/50 text-loss" : ""}`}>
            {confirmOverride ? "Confirm — take anyway" : "Take anyway"}
          </button>
        </div>
        {confirmOverride && (
          <p className="mt-1 text-[10px] text-loss">Overriding a cooldown is a revenge-trade pattern — it earns no XP and breaks your streak.</p>
        )}
        <p className="mt-1 text-[10px] text-muted">Completing the cooldown earns discipline XP; ending it early forgoes it.</p>
      </div>
    );
  }

  if (tiltActive) {
    return (
      <div className="panel border-warn/40 p-4" role="status" data-tour="discipline">
        <p className="panel-head text-warn">{lossStreak} losses in a row</p>
        <p className="mt-1 text-sm text-text">Strong traders step back here. A short break resets your focus — the setups will still be there.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" onClick={() => startCooldown(minutes)} className="btn border-warn/50 text-[11px] text-warn">
            Take {minutes} minutes
          </button>
        </div>
        <p className="mt-1 text-[10px] text-muted">Taking the cooldown earns discipline XP. Trading through it is your call.</p>
      </div>
    );
  }

  return null;
}
