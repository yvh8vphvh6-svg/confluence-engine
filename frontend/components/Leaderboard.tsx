"use client";

import { useEffect, useMemo, useState } from "react";

import { getLeaderboard, type LeaderboardRow } from "../lib/api";
import { fmt, pct, pctRaw, signColor } from "../lib/format";

export default function Leaderboard({ compact = false, limit }: { compact?: boolean; limit?: number }) {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [ready, setReady] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    const ctrl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const load = async () => {
      try {
        const data = await getLeaderboard(ctrl.signal);
        setReady(data.ready);
        setRows(data.rows);
        setErr("");
        if (!data.ready) timer = setTimeout(load, 4000); // poll while sweep populates
      } catch (e) {
        if (!ctrl.signal.aborted) setErr(e instanceof Error ? e.message : "failed to load");
      }
    };
    void load();
    return () => {
      ctrl.abort();
      if (timer) clearTimeout(timer);
    };
  }, []);

  const data = useMemo(() => {
    const ranked = [...rows].sort((a, b) => (b.expectancy_r ?? -9) - (a.expectancy_r ?? -9));
    return limit ? ranked.slice(0, limit) : ranked;
  }, [rows, limit]);

  return (
    <div className="panel tilt3d p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="panel-head">Leaderboard · expectancy (R)</p>
        {!ready && <span className="chip border-warn/40 text-warn">computing backtests…</span>}
      </div>
      {err && <p className="text-xs text-loss">{err}</p>}
      {ready && data.length === 0 && !err && <p className="text-xs text-muted">No runs yet.</p>}
      <div className={compact ? "max-h-[320px] overflow-y-auto" : ""}>
        <table className="w-full text-right text-[11px]">
          <thead className="sticky top-0 bg-panel text-[9px] uppercase tracking-wider text-muted">
            <tr>
              <th className="px-2 py-1.5 text-left">Strategy</th>
              <th className="px-2 py-1.5">Sym</th>
              <th className="px-2 py-1.5">TF</th>
              <th className="px-2 py-1.5">Exp R</th>
              {!compact && <th className="px-2 py-1.5">PF</th>}
              <th className="px-2 py-1.5">Win</th>
              <th className="px-2 py-1.5">n</th>
              <th className="px-2 py-1.5">Gate</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {data.map((r, i) => (
              <tr key={`${r.strategy}-${r.symbol}-${r.timeframe}-${i}`} className="border-t border-line/60">
                <td className="px-2 py-1.5 text-left text-text">{r.strategy}</td>
                <td className="px-2 py-1.5 text-muted">{r.symbol}</td>
                <td className="px-2 py-1.5 text-muted">{r.timeframe}</td>
                <td className={`px-2 py-1.5 ${signColor(r.expectancy_r)}`}>{fmt(r.expectancy_r)}</td>
                {!compact && (
                  <td className={`px-2 py-1.5 ${(r.profit_factor ?? 0) > 1 ? "text-profit" : "text-loss"}`}>{fmt(r.profit_factor)}</td>
                )}
                <td className="px-2 py-1.5">{r.sufficient_sample ? pct(r.win_rate) : "—"}</td>
                <td className={`px-2 py-1.5 ${r.sufficient_sample ? "text-text" : "text-warn"}`}>{r.n_trades}</td>
                <td className="px-2 py-1.5">
                  {r.sufficient_sample ? (
                    <span className={`chip ${r.promote ? "border-profit/40 text-profit" : "border-loss/40 text-loss"}`}>
                      {r.promote ? "pass" : "hold"}
                    </span>
                  ) : (
                    <span className="chip border-warn/40 text-warn">n&lt;100</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[10px] text-muted">
        Gate = Monte-Carlo p95 drawdown &lt;15% AND n≥100. Synthetic data — proves engine correctness, not a live edge.
      </p>
    </div>
  );
}
