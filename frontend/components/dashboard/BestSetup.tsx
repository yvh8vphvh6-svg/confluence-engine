"use client";

import { useStore } from "../../lib/store";
import { useBestSetup } from "../../lib/useBestSetup";
import { fmt, REGIME_LABEL } from "../../lib/format";

export default function BestSetup() {
  const tick = useStore((s) => s.latestTick);
  const openInspector = useStore((s) => s.openInspector);
  const best = useBestSetup();
  const also = (tick?.also_firing ?? []).filter((n) => n !== best?.name);

  const rr =
    best && best.entry != null && best.stop != null && best.target != null && best.entry !== best.stop
      ? Math.abs(best.target - best.entry) / Math.abs(best.entry - best.stop)
      : null;

  return (
    <div className="panel p-4" data-tour="best-setup">
      <div className="mb-3 flex items-center justify-between">
        <p className="panel-head">Best setup now</p>
        <div className="flex items-center gap-2">
          <span
            className={`chip ${
              tick?.data_source === "live" ? "border-profit/50 text-profit" : "border-line text-muted"
            }`}
            title="Data provenance"
          >
            {tick?.data_source === "live" ? "LIVE DATA" : "SYNTHETIC"}
          </span>
          {tick && (
            <span className="chip" style={{ borderColor: "#27304a" }}>
              {REGIME_LABEL[tick.regime] ?? tick.regime}
            </span>
          )}
        </div>
      </div>

      {!best ? (
        <div className="grid min-h-[96px] place-items-center rounded-lg border border-dashed border-line text-sm text-muted">
          No qualified setup — the disciplined move is to wait.
        </div>
      ) : (
        <button
          onClick={() => openInspector(best)}
          className={`w-full rounded-lg border p-3 text-left transition hover:border-neon/50 ${
            best.recommended ? "border-profit/50 bg-profit/5" : "border-warn/40 bg-warn/5"
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-base font-semibold text-text">{best.label}</p>
              <p className="text-[11px] text-muted">{best.family} · click for rule stack</p>
            </div>
            <span
              className={`chip ${
                best.direction === "long" ? "border-profit/50 text-profit" : "border-loss/50 text-loss"
              }`}
            >
              {best.direction}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-4 gap-2 text-center text-xs">
            <div>
              <p className="text-[9px] uppercase text-muted">Entry</p>
              <p className="font-mono text-warn">{fmt(best.entry)}</p>
            </div>
            <div>
              <p className="text-[9px] uppercase text-muted">Stop</p>
              <p className="font-mono text-loss">{fmt(best.stop)}</p>
            </div>
            <div>
              <p className="text-[9px] uppercase text-muted">Target</p>
              <p className="font-mono text-profit">{fmt(best.target)}</p>
            </div>
            <div>
              <p className="text-[9px] uppercase text-muted">R:R</p>
              <p className="font-mono text-text">{rr ? `${rr.toFixed(1)}:1` : "—"}</p>
            </div>
          </div>
          <div className="mt-2">
            {best.recommended ? (
              <span className="chip border-profit/50 text-profit">recommended · passed gate in regime</span>
            ) : (
              <span className="chip border-warn/40 text-warn">not enough evidence yet</span>
            )}
            <span className="ml-2 text-[10px] text-muted">{best.evidence}</span>
          </div>
        </button>
      )}

      {also.length > 0 && (
        <p className="mt-2 text-[10px] text-muted">
          also firing: {also.join(", ")} — collapsed to avoid simultaneous-entry overload
        </p>
      )}
    </div>
  );
}
