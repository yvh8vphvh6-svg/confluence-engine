"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { getJournal, logSessionReview, type Calibration } from "../../lib/api";
import { buildSessionReview, type SessionReviewDraft } from "../../lib/sessionReview";
import { useStore } from "../../lib/store";
import CalibrationCard from "../CalibrationCard";

export default function SessionReview() {
  const session = useStore((s) => s.session);
  const resetSession = useStore((s) => s.resetSession);
  const dailyStop = useStore((s) => s.latestTick?.metrics?.daily_stop_active ?? false);

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<SessionReviewDraft | null>(null);
  const [calibration, setCalibration] = useState<Calibration | null>(null);
  const prevStop = useRef(false);

  const end = useCallback(
    (reason: "manual" | "daily_stop") => {
      const s = useStore.getState();
      const closed = s.session.wins + s.session.losses;
      const sessionTrades = closed > 0 ? s.paperTrades.slice(-closed) : [];
      const d = buildSessionReview(s.session, sessionTrades, reason);
      setDraft(d);
      setOpen(true);
      getJournal()
        .then((j) => {
          setCalibration(j.calibration);
          void logSessionReview({ ...d, calibration: j.calibration.buckets });
        })
        .catch(() => {
          setCalibration(null);
          void logSessionReview({ ...d, calibration: [] });
        });
    },
    [],
  );

  // auto-end when the max daily loss hard stop trips
  useEffect(() => {
    if (dailyStop && !prevStop.current && !open) end("daily_stop");
    prevStop.current = dailyStop;
  }, [dailyStop, open, end]);

  const close = () => {
    resetSession();
    setOpen(false);
    setDraft(null);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => end("manual")}
        className="btn text-[11px]"
        title="Summarise this practice session"
      >
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
              <p className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-text">Session review</p>
              {draft.reason === "daily_stop" && <span className="chip border-loss/50 text-loss">−{`${draft.missed_r}`}… daily stop hit</span>}
            </div>

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

            <div className="mt-4">
              <CalibrationCard calibration={calibration} />
            </div>

            <button onClick={close} className="mt-4 w-full rounded-lg bg-neon px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110">
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
