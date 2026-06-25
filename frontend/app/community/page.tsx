"use client";

import { useCallback, useEffect, useState } from "react";

import { contributeCommunity, getCommunity, type CommunityChallenge } from "../../lib/api";

function Bar({ pct, tone }: { pct: number; tone: string }) {
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-black/30">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

export default function CommunityPage() {
  const [data, setData] = useState<CommunityChallenge | null>(null);
  const [err, setErr] = useState("");
  const [shared, setShared] = useState(false);

  const load = useCallback(() => {
    setErr(""); setShared(false);
    const ctrl = new AbortController();
    getCommunity(ctrl.signal).then(setData).catch((e) => !ctrl.signal.aborted && setErr(e instanceof Error ? e.message : "failed"));
    return () => ctrl.abort();
  }, []);
  useEffect(() => load(), [load]);

  const contribute = () => {
    if (!data) return;
    void contributeCommunity({ challenge_id: data.challenge_id, progress: data.user_raw }).catch(() => undefined);
    setShared(true);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header>
        <h1 className="font-display text-xl font-semibold text-text">Community Challenge</h1>
        <p className="text-sm text-muted">Your real weekly progress, alongside an illustrative community pace.</p>
      </header>

      {err && <p className="panel border-loss/40 p-4 text-xs text-loss">{err}</p>}
      {!err && !data && <p className="panel p-6 text-center text-sm text-muted">Loading…</p>}

      {data && (
        <>
          <div className="panel p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-text">{data.title}</p>
              <span className="chip border-line text-muted">{data.week}</span>
            </div>
            <p className="mt-3 text-[11px] uppercase tracking-wider text-muted">Your progress (real)</p>
            <div className="mt-1 flex items-center gap-2">
              <Bar pct={(data.user_progress / data.target) * 100} tone={data.user_complete ? "bg-profit" : "bg-neon"} />
              <span className="shrink-0 font-mono text-xs text-text">{data.user_progress}/{data.target}</span>
            </div>
            {data.user_complete && <p className="mt-1 text-[11px] text-profit">Challenge complete this week — nice.</p>}

            <p className="mt-4 text-[11px] uppercase tracking-wider text-muted">Community pace</p>
            <div className="mt-1 flex items-center gap-2">
              <Bar pct={data.community.avg_progress * 100} tone="bg-accent" />
              <span className="shrink-0 font-mono text-xs text-muted">{Math.round(data.community.avg_progress * 100)}%</span>
            </div>
            <p className="mt-1 text-[10px] text-warn">{data.community.note} · ~{data.community.participants} (sample)</p>

            <button onClick={contribute} disabled={shared}
              className="mt-4 rounded-lg bg-neon px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110 disabled:opacity-40">
              {shared ? "Contribution recorded ✓" : "Submit my progress"}
            </button>
          </div>
          <p className="text-[10px] text-muted">The community bar is a labeled sample aggregate — not real participants. Your bar is computed from your real trades this ISO week.</p>
        </>
      )}
    </div>
  );
}
