"use client";

import { useEffect, useState } from "react";

import { getSocialLeaderboard, type TraderRank } from "../../lib/api";

export default function LeaderboardPage() {
  const [rows, setRows] = useState<TraderRank[] | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    const ctrl = new AbortController();
    getSocialLeaderboard(ctrl.signal)
      .then((d) => setRows(d.entries))
      .catch((e) => !ctrl.signal.aborted && setErr(e instanceof Error ? e.message : "failed to load"));
    return () => ctrl.abort();
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header>
        <h1 className="font-display text-xl font-semibold text-text">Trader Leaderboard</h1>
        <p className="text-sm text-muted">Ranked by rolling-50-trade expectancy. Your row is real; everyone else is a labeled example.</p>
      </header>

      {err && <p className="panel border-loss/40 p-4 text-xs text-loss">{err}</p>}
      {!err && !rows && <p className="panel p-6 text-center text-sm text-muted">Loading…</p>}

      {rows && (
        <div className="panel overflow-x-auto p-2">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wider text-muted">
              <tr>
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Trader</th>
                <th className="px-3 py-2 text-right">Rolling-50 expectancy</th>
                <th className="px-3 py-2 text-right">Trades</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name} className={`border-t border-line/60 ${r.is_user ? "bg-neon/10" : ""}`}>
                  <td className="px-3 py-2 font-mono text-muted">{r.rank}</td>
                  <td className="px-3 py-2">
                    <span className={r.is_user ? "font-semibold text-neon" : "text-text"}>{r.name}</span>
                    {r.is_example && <span className="ml-2 chip border-warn/40 text-warn">example</span>}
                    {r.is_user && <span className="ml-2 chip border-neon/50 text-neon">you</span>}
                    <span className="ml-2 text-[11px] text-muted">{r.blurb}</span>
                  </td>
                  <td className={`px-3 py-2 text-right font-mono ${r.rolling_expectancy_r == null ? "text-muted" : r.rolling_expectancy_r >= 0 ? "text-profit" : "text-loss"}`}>
                    {r.rolling_expectancy_r == null ? "—" : `${r.rolling_expectancy_r >= 0 ? "+" : ""}${r.rolling_expectancy_r.toFixed(2)}R`}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-muted">{r.n_trades}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[10px] text-muted">Sample rows are illustrative teaching profiles — not real rival traders. Only your row uses real numbers.</p>
    </div>
  );
}
