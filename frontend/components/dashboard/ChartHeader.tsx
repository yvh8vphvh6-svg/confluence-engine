"use client";

import { useStore, type OverlayKind } from "../../lib/store";
import { REGIME_LABEL, REGIME_COLOR, fmt } from "../../lib/format";
import { setAutoPause as sendAutoPause } from "../../lib/stream";

const OVERLAYS: OverlayKind[] = ["FVG", "OB", "ORB", "BOS"];

export default function ChartHeader() {
  const tick = useStore((s) => s.latestTick);
  const toggles = useStore((s) => s.overlayToggles);
  const toggleOverlay = useStore((s) => s.toggleOverlay);
  const autoPause = useStore((s) => s.autoPause);
  const setAutoPause = useStore((s) => s.setAutoPause);
  const ind = tick?.indicators;

  const toggleAutoPause = () => {
    const next = !autoPause;
    setAutoPause(next);
    sendAutoPause(next);
  };
  const change = tick && tick.ohlc.open ? ((tick.ohlc.close - tick.ohlc.open) / tick.ohlc.open) * 100 : 0;

  return (
    <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-text">
              {tick?.symbol ?? "—"} <span className="text-muted">{tick?.timeframe}</span>
            </h2>
            {tick && (
              <span
                className="chip"
                style={{ color: REGIME_COLOR[tick.regime], borderColor: REGIME_COLOR[tick.regime] + "66" }}
              >
                {REGIME_LABEL[tick.regime]}
              </span>
            )}
            {ind?.in_killzone && <span className="chip border-warn/40 text-warn">killzone</span>}
            {ind?.atr_expanded && <span className="chip border-loss/40 text-loss">vol expanded</span>}
          </div>
          <p className="mt-1 text-[10px] text-muted">
            {ind
              ? `ATR ${fmt(ind.atr_14)} · ADX ${fmt(ind.adx_14, 0)} · RSI ${fmt(ind.rsi_14, 0)} · VWAP ${fmt(ind.vwap)}`
              : "synthetic OHLCV stream"}
          </p>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-2xl font-semibold text-text">{fmt(tick?.ohlc.close)}</span>
          <span className={`text-sm ${change >= 0 ? "text-profit" : "text-loss"}`}>
            {change >= 0 ? "+" : ""}
            {change.toFixed(2)}%
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          onClick={toggleAutoPause}
          title="Pause and teach on each qualified setup"
          className={`chip ${autoPause ? "border-neon/60 bg-neon/10 text-neon" : "border-line text-muted"}`}
        >
          {autoPause ? "⏸ Auto-pause: ON" : "Auto-pause: OFF"}
        </button>
        <span className="mx-1 h-3 w-px bg-line" />
        <span className="mr-1 text-[10px] uppercase tracking-wider text-muted">Overlays</span>
        {OVERLAYS.map((k) => (
          <button
            key={k}
            onClick={() => toggleOverlay(k)}
            className={`chip ${toggles[k] ? "border-neon/50 text-neon" : "text-muted"}`}
          >
            {k}
          </button>
        ))}
      </div>
    </div>
  );
}
