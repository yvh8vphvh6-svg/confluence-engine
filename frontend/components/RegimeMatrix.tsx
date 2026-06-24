"use client";

import { fmt, REGIME_LABEL } from "../lib/format";
import { useProgression } from "../lib/useProgression";

const STRAT_SHORT: Record<string, string> = {
  ORB: "ORB",
  FVG_RETEST: "FVG",
  OB_RETEST: "OB",
  BOS_CONTINUATION: "BOS",
  BREAKOUT_RETEST: "Brkout",
  VWAP_REVERSION: "VWAP",
  EMA_TREND_PULLBACK: "EMA",
  LIQUIDITY_SWEEP: "Sweep",
};

// Per-strategy expectancy x regime — teaches when NOT to use a strategy.
// Cells gate at the project's n>=100/cell minimum.
export default function RegimeMatrix() {
  const { data } = useProgression();
  const m = data?.regime_matrix;

  if (!m || m.strategies.length === 0) {
    return (
      <div className="panel p-4">
        <p className="panel-head mb-1">Regime awareness</p>
        <p className="text-xs text-muted">Take closed trades to build your per-regime expectancy. Cells unlock at {m?.min_sample ?? 100} trades each.</p>
      </div>
    );
  }

  return (
    <div className="panel overflow-x-auto p-4">
      <p className="panel-head mb-2">Regime awareness — expectancy (R) by strategy × regime</p>
      <table className="w-full text-right text-[11px]">
        <thead className="text-[9px] uppercase tracking-wider text-muted">
          <tr>
            <th className="px-2 py-1 text-left">Strategy</th>
            {m.regimes.map((rg) => (
              <th key={rg} className="px-2 py-1">{REGIME_LABEL[rg] ?? rg}</th>
            ))}
          </tr>
        </thead>
        <tbody className="font-mono">
          {m.strategies.map((strat) => (
            <tr key={strat} className="border-t border-line/60">
              <td className="px-2 py-1 text-left font-sans text-text">{STRAT_SHORT[strat] ?? strat}</td>
              {m.regimes.map((rg) => {
                const cell = m.cells[strat]?.[rg];
                if (!cell || !cell.sufficient) {
                  return <td key={rg} className="px-2 py-1 text-muted" title={`n=${cell?.n ?? 0} (need ${m.min_sample})`}>n&lt;{m.min_sample}</td>;
                }
                const e = cell.expectancy_r ?? 0;
                return (
                  <td key={rg} className={`px-2 py-1 ${e > 0 ? "text-profit" : e < 0 ? "text-loss" : "text-muted"}`}>
                    {e > 0 ? "+" : ""}{fmt(e)}R
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[10px] text-muted">Green = edge, red = avoid. Cells show &quot;n&lt;{m.min_sample}&quot; until they clear the sample gate. Synthetic data.</p>
    </div>
  );
}
