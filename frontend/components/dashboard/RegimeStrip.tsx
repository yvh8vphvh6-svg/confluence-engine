"use client";

import { REGIME_COLOR, REGIME_LABEL } from "../../lib/format";
import { useStore } from "../../lib/store";

const REGIMES = ["trending", "ranging", "high_vol", "low_vol"];

export default function RegimeStrip() {
  const tick = useStore((s) => s.latestTick);
  const current = tick?.regime;
  return (
    <div className="flex items-center gap-2 border-t border-line px-4 py-2">
      <span className="text-[10px] uppercase tracking-wider text-muted">Regime</span>
      <div className="flex flex-1 gap-1">
        {REGIMES.map((r) => {
          const on = r === current;
          return (
            <div
              key={r}
              className="flex-1 rounded px-2 py-1 text-center text-[10px] transition"
              style={{
                background: on ? REGIME_COLOR[r] + "22" : "transparent",
                color: on ? REGIME_COLOR[r] : "#8A93A8",
                border: `1px solid ${on ? REGIME_COLOR[r] + "66" : "#27304a"}`,
              }}
            >
              {REGIME_LABEL[r]}
            </div>
          );
        })}
      </div>
    </div>
  );
}
