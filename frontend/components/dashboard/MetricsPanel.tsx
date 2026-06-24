"use client";

import { useStore } from "../../lib/store";
import { usd, fmt, pctRaw, signColor } from "../../lib/format";
import TiltCard from "../TiltCard";
import ConfluenceGauge from "./ConfluenceGauge";
import EquityCurve from "./EquityCurve";

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <TiltCard className="p-2.5">
      <p className="text-[9px] uppercase tracking-wider text-muted">{label}</p>
      <p className={`mt-1 stat-value ${tone ?? "text-text"}`}>{value}</p>
    </TiltCard>
  );
}

export default function MetricsPanel() {
  const tick = useStore((s) => s.latestTick);
  const m = tick?.metrics;

  return (
    <div className="space-y-4" data-tour="metrics">
      <div className="panel p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="panel-head">Live performance</p>
          {m && (
            <span className={`chip ${m.sufficient_sample ? "border-profit/40 text-profit" : "border-warn/40 text-warn"}`}>
              {m.sufficient_sample ? `n=${m.trades}` : `n=${m.trades} · thin`}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Equity" value={m ? usd.format(m.equity) : "—"} />
          <Stat label="Cumulative P&L" value={m ? usd.format(m.cumulative_pnl) : "—"} tone={signColor(m?.cumulative_pnl)} />
          <Stat label="Expectancy (R)" value={m ? fmt(m.expectancy_r) : "—"} tone={signColor(m?.expectancy_r)} />
          <Stat label="Win rate" value={m ? pctRaw(m.win_rate) : "—"} />
          <Stat label="Profit factor" value={m ? fmt(m.profit_factor) : "—"} tone={m && (m.profit_factor ?? 0) > 1 ? "text-profit" : "text-loss"} />
          <Stat label="Sharpe" value={m ? fmt(m.sharpe) : "—"} />
          <Stat label="Max DD" value={m ? pctRaw(m.max_drawdown_pct) : "—"} tone="text-loss" />
          <Stat label="Daily P&L" value={m ? usd.format(m.daily_pnl) : "—"} tone={signColor(m?.daily_pnl)} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
          {m?.daily_stop_active && (
            <span className="chip border-loss/40 text-loss">−2R daily stop active</span>
          )}
          {m && m.cooldown_bars_remaining > 0 && (
            <span className="chip border-warn/40 text-warn">cooldown {m.cooldown_bars_remaining} bars</span>
          )}
          {m && m.consecutive_losses > 0 && (
            <span className="chip border-line text-muted">{m.consecutive_losses} loss streak</span>
          )}
          {m?.open_positions ? <span className="chip border-neon/40 text-neon">position open</span> : null}
        </div>
      </div>

      <div className="panel p-4">
        <p className="panel-head mb-3">Confluence (live signal)</p>
        <ConfluenceGauge conf={tick?.confluence ?? null} />
      </div>

      <div className="panel p-4">
        <p className="panel-head mb-2">Equity curve (R)</p>
        <EquityCurve curve={m?.equity_curve_r ?? [0]} />
        <p className="mt-1 text-[10px] text-muted">
          {m ? `final ${fmt(m.equity_curve_r.at(-1) ?? 0)} R over ${m.trades} trades` : "—"}
        </p>
      </div>
    </div>
  );
}
