"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";

import { getRealChart, type RealChart } from "../../lib/api";
import { fmt } from "../../lib/format";

const RealChartView = dynamic(() => import("../../components/RealChartView"), { ssr: false });

const SYMBOLS = ["MNQ", "MGC"];
const TIMEFRAMES = ["1m", "5m", "15m", "30m", "1h"];

export default function RealChartPage() {
  const [symbol, setSymbol] = useState("MNQ");
  const [timeframe, setTimeframe] = useState("5m");
  const [data, setData] = useState<RealChart | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getRealChart(symbol, timeframe));
    } catch (e) {
      setData({ connected: false, reason: e instanceof Error ? e.message : "request failed", how_to_connect: "" });
    } finally {
      setLoading(false);
    }
  }, [symbol, timeframe]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text">Real Chart</h1>
          <p className="text-sm text-muted">
            Actual market data through the pluggable adapter — separate from the synthetic Practice/Backtest charts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className="rounded-lg border border-line bg-black/30 px-2 py-1.5 text-xs">
            {SYMBOLS.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)} className="rounded-lg border border-line bg-black/30 px-2 py-1.5 text-xs">
            {TIMEFRAMES.map((t) => <option key={t}>{t}</option>)}
          </select>
          <button onClick={load} className="btn">Refresh</button>
        </div>
      </header>

      {loading && <div className="panel grid min-h-[200px] place-items-center text-sm text-muted">Loading real data…</div>}

      {!loading && data && data.connected && (
        <div className="panel min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-4">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-text">{data.symbol} <span className="text-muted">{data.timeframe}</span></h2>
              <span className="chip border-warn/50 text-warn">DELAYED</span>
              <span className="chip border-line text-muted">{data.source}</span>
            </div>
            {data.last_price != null && <span className="font-mono text-lg text-text">{fmt(data.last_price)}</span>}
          </div>
          <div className="bg-background p-2"><RealChartView candles={data.candles} /></div>
          <p className="border-t border-line p-3 text-[11px] text-warn">{data.note}</p>
        </div>
      )}

      {!loading && data && !data.connected && (
        <div className="panel border-warn/30 p-6">
          <p className="panel-head mb-2 text-warn">Not connected to a real market-data provider</p>
          <p className="text-sm text-text">{data.reason}</p>
          {data.how_to_connect && <p className="mt-3 text-xs text-muted">{data.how_to_connect}</p>}
          <p className="mt-3 text-[11px] text-muted">
            This view never shows fabricated prices. When a provider is reachable it displays real (delayed)
            data; otherwise it tells you it isn&apos;t connected. The synthetic Practice/Backtest charts are
            unaffected and clearly labelled SYNTHETIC.
          </p>
          <button onClick={load} className="btn mt-4">Retry</button>
        </div>
      )}
    </div>
  );
}
