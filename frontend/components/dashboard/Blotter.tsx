"use client";

import { useMemo } from "react";

import { useStore } from "../../lib/store";
import { usd, fmt, signColor } from "../../lib/format";

export default function Blotter() {
  const trades = useStore((s) => s.latestTick?.recent_trades ?? []);
  const rows = useMemo(() => [...trades].reverse(), [trades]);

  const exportCsv = () => {
    const header = "strategy,direction,entry_time,exit_time,entry,exit,r_multiple,pnl,exit_reason,regime";
    const lines = rows.map((t) =>
      [t.strategy, t.direction, t.entry_time, t.exit_time, t.entry_price, t.exit_price, t.r_multiple, t.pnl_dollars, t.exit_reason, t.regime_at_entry].join(","),
    );
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "trades.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="panel flex flex-col p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="panel-head">Trade blotter (recent)</p>
        <button className="btn" onClick={exportCsv} disabled={!rows.length}>
          Export CSV
        </button>
      </div>
      <div className="max-h-[220px] overflow-y-auto">
        <table className="w-full text-right text-[11px]">
          <thead className="sticky top-0 bg-panel text-[9px] uppercase tracking-wider text-muted">
            <tr>
              <th className="px-2 py-1.5 text-left">Strategy</th>
              <th className="px-2 py-1.5">Dir</th>
              <th className="px-2 py-1.5">R</th>
              <th className="px-2 py-1.5">P&L</th>
              <th className="px-2 py-1.5 text-left">Exit</th>
              <th className="px-2 py-1.5 text-left">Regime</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-2 py-4 text-center text-muted">
                  No closed trades yet.
                </td>
              </tr>
            )}
            {rows.map((t, i) => (
              <tr key={`${t.entry_time}-${i}`} className="border-t border-line/60">
                <td className="px-2 py-1.5 text-left text-text">{t.strategy}</td>
                <td className={`px-2 py-1.5 ${t.direction === "long" ? "text-profit" : "text-loss"}`}>{t.direction}</td>
                <td className={`px-2 py-1.5 ${signColor(t.r_multiple)}`}>{fmt(t.r_multiple)}</td>
                <td className={`px-2 py-1.5 ${signColor(t.pnl_dollars)}`}>{usd.format(t.pnl_dollars)}</td>
                <td className="px-2 py-1.5 text-left text-muted">{t.exit_reason}</td>
                <td className="px-2 py-1.5 text-left text-muted">{t.regime_at_entry}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
