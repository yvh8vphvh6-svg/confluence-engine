"use client";

import { useStore } from "../../lib/store";
import { usd, fmt, signColor } from "../../lib/format";

export default function PositionCard() {
  const tick = useStore((s) => s.latestTick);
  const p = tick?.position;

  return (
    <div className="panel p-4">
      <p className="panel-head mb-3">Open position</p>
      {p ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-text">
              {p.symbol} · {p.strategy}
            </span>
            <span className={`chip ${p.direction === "long" ? "border-profit/40 text-profit" : "border-loss/40 text-loss"}`}>
              {p.side} / {p.direction}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div>
              <p className="text-[9px] uppercase text-muted">Entry</p>
              <p className="font-mono text-warn">{fmt(p.entry_price)}</p>
            </div>
            <div>
              <p className="text-[9px] uppercase text-muted">Stop</p>
              <p className="font-mono text-loss">{fmt(p.stop)}</p>
            </div>
            <div>
              <p className="text-[9px] uppercase text-muted">Target</p>
              <p className="font-mono text-profit">{fmt(p.target)}</p>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-line pt-2 text-xs">
            <span className="text-muted">Unrealized</span>
            <span className={`font-mono ${signColor(p.unrealized_pnl)}`}>
              {usd.format(p.unrealized_pnl)} · {fmt(p.unrealized_r)}R
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {p.partial_taken && <span className="chip border-line text-muted">partial taken</span>}
            {p.trailing && <span className="chip border-neon/40 text-neon">trailing</span>}
            <span className="chip border-line text-muted">{p.bars_held} bars · {fmt(p.contracts, 2)} ct</span>
          </div>
        </div>
      ) : (
        <div className="grid min-h-[120px] place-items-center rounded-lg border border-dashed border-line text-sm text-muted">
          {tick ? "Flat — scanning for confluence" : "Waiting for stream…"}
        </div>
      )}
    </div>
  );
}
