"use client";

import { useEffect, useState } from "react";

import { getSuccessStories, type SuccessStories } from "../../lib/api";

export default function SuccessPage() {
  const [data, setData] = useState<SuccessStories | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    const ctrl = new AbortController();
    getSuccessStories(ctrl.signal).then(setData).catch((e) => !ctrl.signal.aborted && setErr(e instanceof Error ? e.message : "failed"));
    return () => ctrl.abort();
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header>
        <h1 className="font-display text-xl font-semibold text-text">Success Stories</h1>
        <p className="text-sm text-muted">Your real milestones, plus illustrative example arcs to aim at.</p>
      </header>

      {err && <p className="panel border-loss/40 p-4 text-xs text-loss">{err}</p>}
      {!err && !data && <p className="panel p-6 text-center text-sm text-muted">Loading…</p>}

      {data && (
        <>
          <div className="panel p-4">
            <p className="panel-head mb-2">Your milestones (real)</p>
            {data.has_real ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {data.milestones.map((m) => (
                  <div key={m.label} className="rounded-lg border border-line bg-surface2/40 p-2.5 text-center">
                    <p className="text-[9px] uppercase tracking-wider text-muted">{m.label}</p>
                    <p className="mt-1 font-mono text-base font-semibold text-text">{m.value}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted">No milestones yet — take some paper trades and your real numbers show up here.</p>
            )}
            <p className="mt-2 text-[10px] text-muted">{data.note}</p>
          </div>

          <div className="space-y-2">
            <p className="panel-head">Illustrative examples</p>
            {data.examples.map((e) => (
              <div key={e.name} className="panel p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-text">{e.name}</p>
                  <span className="chip border-warn/40 text-warn">illustrative</span>
                </div>
                <p className="mt-1 text-xs text-text">{e.story}</p>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted">Example arcs are illustrative teaching aids — not real people or accounts. Only your milestones use real numbers.</p>
        </>
      )}
    </div>
  );
}
