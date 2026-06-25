"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { getJournal, logCooldownEvent, logSessionReview, type Calibration, type Correlation } from "../../lib/api";
import { buildSessionReview, type SessionReviewDraft } from "../../lib/sessionReview";
import { useStore } from "../../lib/store";
import CalibrationCard from "../CalibrationCard";
import DisciplineInsights from "./DisciplineInsights";

export default function SessionReview() {
  const resetSession = useStore((s) => s.resetSession);
  // the user's OWN paper-account lockout (max daily loss in R), not the engine sim
  const lockedOut = useStore((s) => s.lockedOut);

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<SessionReviewDraft | null>(null);
  const [calibration, setCalibration] = useState<Calibration | null>(null);
  const [emotion, setEmotion] = useState<Correlation | null>(null);
  const [speed, setSpeed] = useState<Correlation | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const prevLock = useRef(false);

  const end = useCallback((reason: "manual" | "daily_stop") => {
    const s = useStore.getState();
    const closed = s.session.wins + s.session.losses;
    const sessionTrades = closed > 0 ? s.paperTrades.slice(-closed) : [];
    const d = buildSessionReview(s.session, sessionTrades, reason);
    setDraft(d);
    setAcknowledged(false);
    setOpen(true);
    getJournal()
      .then((j) => {
        setCalibration(j.calibration);
        setEmotion(j.emotion_correlation);
        setSpeed(j.decision_speed);
        void logSessionReview({ ...d, calibration: j.calibration.buckets });
      })
      .catch(() => {
        setCalibration(null);
        setEmotion(null);
        setSpeed(null);
        void logSessionReview({ ...d, calibration: [] });
      });
  }, []);

  // forced end + lockout when the max daily loss hard stop trips (D)
  useEffect(() => {
    if (lockedOut && !prevLock.current && !open) {
      end("daily_stop");
      void logCooldownEvent({ type: "max_loss", length_min: 0, ended_early: null }).catch(() => undefined);
    }
    prevLock.current = lockedOut;
  }, [lockedOut, open, end]);

  const close = () => {
    resetSession();
    setOpen(false);
    setDraft(null);
  };

  const needsAck = draft?.reason === "daily_stop" && !acknowledged;

  return (
    <>
      <button type="button" onClick={() => end("manual")} className="btn text-[11px]" title="Summarise this practice session">
        End session
      </button>

      {open && draft && (
        <div className="fixed inset-0 z-[64] grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={close}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Session review"
            onClick={(e) => e.stopPropagation()}
            className="relative max-h-[86vh] w-[min(34rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-line glass-surface p-5 shadow-2xl shadow-black/60 before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-accent/70 before:to-transparent"
          >
            <div className="flex items-center justify-between">
              <p className="font-display text-sm text-text">Session review</p>
              {draft.reason === "daily_stop" && <span className="chip border-loss/50 text-loss">daily stop hit</span>}
            </div>

            {draft.reason === "daily_stop" && (
              <div className="mt-3 rounded-lg border border-loss/40 bg-loss/5 p-3 text-xs text-text">
                Daily loss limit hit. Session over — this is the rule that keeps live accounts alive. Stopping cleanly here is the
                disciplined move, and it counts toward your Iron Discipline badge.
              </div>
            )}

            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <Tile label="Setups seen" v={String(draft.setups_seen)} />
              <Tile label="Taken" v={String(draft.taken)} />
              <Tile label="W / L" v={`${draft.wins} / ${draft.losses}`} />
              <Tile label="Avg quality" v={draft.avg_quality != null ? `${draft.avg_quality}/10` : "—"} />
              <Tile label="Skipped qual." v={String(draft.skipped_qualified)} />
              <Tile label="Missed R" v={draft.missed_r > 0 ? `−${draft.missed_r}R` : "0"} tone="text-loss" />
            </div>

            <p className="mt-4 text-[10px] uppercase tracking-wider text-muted">Focus next session</p>
            <ul className="mt-1 space-y-1.5">
              {draft.focuses.map((f) => (
                <li key={f} className="rounded-lg border border-line bg-surface2/40 px-3 py-1.5 text-xs text-text">• {f}</li>
              ))}
            </ul>

            <div className="mt-4 space-y-2">
              <CalibrationCard calibration={calibration} />
              <DisciplineInsights emotion={emotion} speed={speed} />
            </div>

            {needsAck ? (
              <label className="mt-4 flex items-start gap-2 rounded-lg border border-warn/40 bg-warn/5 p-3 text-xs text-text">
                <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} className="mt-0.5" />
                <span>I understand — the daily stop protects the account. I&apos;ll come back fresh rather than chase the loss.</span>
              </label>
            ) : null}

            <button
              onClick={close}
              disabled={needsAck}
              className="mt-4 w-full rounded-lg bg-neon px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110 disabled:opacity-40"
            >
              Start fresh session
            </button>
            <p className="mt-2 text-center text-[10px] text-muted">Generated from this session&apos;s real records — no invented numbers.</p>
          </div>
        </div>
      )}
    </>
  );
}

function Tile({ label, v, tone = "text-text" }: { label: string; v: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface2/40 p-2">
      <p className="text-[9px] uppercase tracking-wider text-muted">{label}</p>
      <p className={`mt-0.5 font-mono text-sm font-semibold ${tone}`}>{v}</p>
    </div>
  );
}
