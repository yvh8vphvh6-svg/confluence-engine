"use client";

import { useCallback, useEffect, useState } from "react";

import { getContext, type MarketContext } from "../../lib/api";
import { fmt, REGIME_LABEL, REGIME_COLOR } from "../../lib/format";

const SYMS = ["MNQ", "MGC"];
const TFS = ["5m", "15m", "30m", "1h"];

export default function ContextPage() {
  const [symbol, setSymbol] = useState("MNQ");
  const [timeframe, setTimeframe] = useState("15m");
  const [ctx, setCtx] = useState<MarketContext | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setErr("");
    try { setCtx(await getContext(symbol, timeframe)); }
    catch (e) { setErr(e instanceof Error ? e.message : "failed"); }
  }, [symbol, timeframe]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text">Market Context</h1>
          <p className="text-sm text-muted">A pre-session read: session, levels, prior-day, overnight, and a transparent bias. Synthetic data — illustrative, not a forecast.</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className="rounded-lg border border-line bg-black/30 px-2 py-1.5 text-xs">{SYMS.map((x) => <option key={x}>{x}</option>)}</select>
          <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)} className="rounded-lg border border-line bg-black/30 px-2 py-1.5 text-xs">{TFS.map((x) => <option key={x}>{x}</option>)}</select>
          <button onClick={load} className="btn">Refresh</button>
        </div>
      </header>
      {err && <p className="text-xs text-loss">{err}</p>}

      {ctx && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card label="Session"><p className="text-sm font-semibold text-text">{ctx.session}</p><p className="text-[11px] text-muted">{ctx.next_event}</p></Card>
            <Card label="Regime"><p className="text-sm font-semibold" style={{ color: REGIME_COLOR[ctx.regime] }}>{REGIME_LABEL[ctx.regime] ?? ctx.regime}</p></Card>
            <Card label="Bias">
              <p className={`text-sm font-semibold ${ctx.bias === "bullish" ? "text-profit" : ctx.bias === "bearish" ? "text-loss" : "text-warn"}`}>{ctx.bias.toUpperCase()}</p>
            </Card>
          </div>

          <div className="panel p-4">
            <p className="panel-head mb-2">Bias reasoning</p>
            <ul className="space-y-1 text-sm text-text">
              {ctx.bias_reasons.map((r) => <li key={r}>• {r}</li>)}
            </ul>
            {ctx.invalidation && <p className="mt-2 text-xs text-warn">Invalidated by: {ctx.invalidation}</p>}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="panel p-4">
              <p className="panel-head mb-2">Key levels</p>
              <dl className="space-y-1 text-sm">
                <Lvl k="Last close" v={ctx.last_close} />
                <Lvl k="VWAP" v={ctx.key_levels.vwap} />
                <Lvl k="Prior-day high" v={ctx.key_levels.pdh} />
                <Lvl k="Prior-day low" v={ctx.key_levels.pdl} />
                <Lvl k="Opening range high" v={ctx.key_levels.or_high} />
                <Lvl k="Opening range low" v={ctx.key_levels.or_low} />
              </dl>
            </div>
            <div className="panel p-4">
              <p className="panel-head mb-2">Prior day &amp; overnight</p>
              <dl className="space-y-1 text-sm">
                <Lvl k="Prior high" v={ctx.prior_day.high} />
                <Lvl k="Prior low" v={ctx.prior_day.low} />
                <Lvl k="Prior close" v={ctx.prior_day.close} />
                {ctx.overnight ? (
                  <>
                    <Lvl k="Overnight high" v={ctx.overnight.high} />
                    <Lvl k="Overnight low" v={ctx.overnight.low} />
                    <div className="flex justify-between"><dt className="text-muted">Overnight move</dt><dd className={`font-mono ${ctx.overnight.change_pts >= 0 ? "text-profit" : "text-loss"}`}>{ctx.overnight.change_pts >= 0 ? "+" : ""}{ctx.overnight.change_pts} pts</dd></div>
                  </>
                ) : <p className="text-xs text-muted">No pre-RTH data for the current day yet.</p>}
              </dl>
            </div>
          </div>
          <p className="text-center text-[11px] text-warn">{ctx.disclaimer}</p>
        </>
      )}
    </div>
  );
}

function Card({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="panel p-4"><p className="text-[9px] uppercase tracking-wider text-muted">{label}</p><div className="mt-1">{children}</div></div>;
}
function Lvl({ k, v }: { k: string; v: number | null }) {
  return <div className="flex justify-between"><dt className="text-muted">{k}</dt><dd className="font-mono text-text">{v == null ? "—" : fmt(v)}</dd></div>;
}
