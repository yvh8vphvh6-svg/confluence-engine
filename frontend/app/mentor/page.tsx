"use client";

import { useCallback, useEffect, useState } from "react";

import { getMentorStudent, postMentorFeedback, type MentorStudent } from "../../lib/api";
import { fmt, signColor, REGIME_LABEL } from "../../lib/format";

export default function MentorPage() {
  const [self, setSelf] = useState(false);
  const [student, setStudent] = useState<MentorStudent | null>(null);
  const [err, setErr] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [overall, setOverall] = useState("");
  const [saved, setSaved] = useState(false);

  const load = useCallback(() => {
    setStudent(null); setErr(""); setNotes({}); setOverall(""); setSaved(false);
    const ctrl = new AbortController();
    getMentorStudent(self, ctrl.signal).then(setStudent).catch((e) => !ctrl.signal.aborted && setErr(e instanceof Error ? e.message : "failed"));
    return () => ctrl.abort();
  }, [self]);
  useEffect(() => load(), [load]);

  const save = () => {
    if (!student) return;
    void postMentorFeedback({
      student_ref: student.is_example ? "sample" : "self",
      per_trade: notes,
      overall,
    }).catch(() => undefined);
    setSaved(true);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-text">Mentor Mode</h1>
          <p className="text-sm text-muted">Review a blotter and leave structured feedback — per trade and overall.</p>
        </div>
        <div className="flex shrink-0 rounded-lg border border-line p-0.5 text-[11px]">
          <button onClick={() => setSelf(false)} className={`rounded-md px-2.5 py-1 font-medium transition ${!self ? "bg-neon/15 text-neon" : "text-muted hover:text-text"}`}>Sample student</button>
          <button onClick={() => setSelf(true)} className={`rounded-md px-2.5 py-1 font-medium transition ${self ? "bg-neon/15 text-neon" : "text-muted hover:text-text"}`}>Self-review</button>
        </div>
      </header>

      {err && <p className="panel border-loss/40 p-4 text-xs text-loss">{err}</p>}
      {!err && !student && <p className="panel p-6 text-center text-sm text-muted">Loading blotter…</p>}

      {student && (
        <>
          <div className="panel p-4">
            <div className="flex items-center justify-between">
              <p className="panel-head">{student.name}</p>
              {student.is_example
                ? <span className="chip border-warn/40 text-warn">sample student</span>
                : <span className="chip border-neon/40 text-neon">your trades</span>}
            </div>
            {student.trades.length === 0 ? (
              <p className="mt-3 text-xs text-muted">No trades to review yet — take some paper trades, then self-review here.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {student.trades.map((t, i) => (
                  <div key={i} className="rounded-lg border border-line bg-surface2/40 p-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="text-text">{t.strategy} <span className={t.direction === "long" ? "text-profit" : "text-loss"}>{t.direction}</span> · {REGIME_LABEL[t.regime] ?? t.regime}</span>
                      <span className="flex items-center gap-2 text-muted">
                        <span>{t.exit_reason}</span>
                        {t.mistakes && <span className="chip border-warn/40 text-warn">{t.mistakes}</span>}
                        <span className={`font-mono ${signColor(t.r_multiple)}`}>{t.r_multiple >= 0 ? "+" : ""}{fmt(t.r_multiple)}R</span>
                      </span>
                    </div>
                    <input
                      value={notes[String(i)] ?? ""}
                      onChange={(e) => setNotes((n) => ({ ...n, [String(i)]: e.target.value }))}
                      placeholder="Feedback on this trade…"
                      className="mt-2 w-full rounded-lg border border-line bg-black/30 px-2 py-1.5 text-xs"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="panel p-4">
            <p className="panel-head mb-2">Overall feedback</p>
            <textarea value={overall} onChange={(e) => setOverall(e.target.value)} rows={3}
              placeholder="What's the one habit to work on next?"
              className="w-full rounded-lg border border-line bg-black/30 px-3 py-2 text-xs" />
            <button onClick={save} disabled={saved || (!overall && Object.keys(notes).length === 0)}
              className="mt-3 rounded-lg bg-neon px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110 disabled:opacity-40">
              {saved ? "Feedback saved ✓" : "Save feedback"}
            </button>
            {student.is_example && <p className="mt-2 text-[10px] text-muted">This is a labeled sample student — feedback is stored for your own practice as a reviewer.</p>}
          </div>
        </>
      )}
    </div>
  );
}
