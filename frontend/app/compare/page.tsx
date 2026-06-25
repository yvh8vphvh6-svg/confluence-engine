"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";

import { getCompare, markCompare, type ComparePayload } from "../../lib/api";

const BarsChart = dynamic(() => import("../../components/BarsChart"), { ssr: false });

const SYMBOLS = ["MNQ", "MGC"];
const TIMEFRAMES = ["5m", "15m", "1h"];

export default function ComparePage() {
  const [symbol, setSymbol] = useState("MNQ");
  const [timeframe, setTimeframe] = useState("5m");
  const [data, setData] = useState<ComparePayload | null>(null);
  const [err, setErr] = useState("");
  const [synTake, setSynTake] = useState<boolean | null>(null);
  const [realTake, setRealTake] = useState<boolean | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(() => {
    setData(null); setErr(""); setSynTake(null); setRealTake(null); setSaved(false);
    const ctrl = new AbortController();
    getCompare(symbol, timeframe, ctrl.signal)
      .then(setData)
      .catch((e) => !ctrl.signal.aborted && setErr(e instanceof Error ? e.message : "failed to load"));
    return () => ctrl.abort();
  }, [symbol, timeframe]);

  useEffect(() => load(), [load]);

  const save = () => {
    if (synTake === null || realTake === null) return;
    void markCompare({ symbol, timeframe, synthetic_take: synTake, real_take: realTake }).catch(() => undefined);
    setSaved(true);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-text">Synthetic vs Real</h1>
          <p className="text-sm text-muted">Same instrument, same timeframe, same timestamp axis. Would your setup survive real data?</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className="rounded-lg border border-line bg-black/30 px-2 py-1.5 text-xs">
            {SYMBOLS.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)} className="rounded-lg border border-line bg-black/30 px-2 py-1.5 text-xs">
            {TIMEFRAMES.map((t) => <option key={t}>{t}</option>)}
          </select>
          <button onClick={load} className="btn text-[11px]">Reload</button>
        </div>
      </header>

      {err && <p className="panel border-loss/40 p-4 text-xs text-loss">{err}</p>}
      {!err && !data && <p className="panel p-6 text-center text-sm text-muted">Loading charts…</p>}

      {data && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="panel p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="panel-head">{data.synthetic.label}</p>
                <span className="chip border-warn/40 text-warn">synthetic</span>
              </div>
              <BarsChart candles={data.synthetic.candles} overlays={data.synthetic.overlays} height={340} />
            </div>
            <div className="panel p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="panel-head">Recorded real bars</p>
                <span className="chip border-neon/40 text-neon">{data.real.source}</span>
              </div>
              <BarsChart candles={data.real.candles} overlays={data.real.overlays} height={340} />
            </div>
          </div>

          <div className="panel p-4">
            <p className="text-sm font-semibold text-text">Would this setup have appeared on real data?</p>
            <p className="mt-1 text-[11px] text-muted">{data.note}</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Choice label="On synthetic, I would…" take={synTake} onTake={setSynTake} />
              <Choice label="On real, I would…" take={realTake} onTake={setRealTake} />
            </div>
            <div className="mt-3 flex items-center gap-3">
              <button onClick={save} disabled={synTake === null || realTake === null || saved}
                className="rounded-lg bg-neon px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110 disabled:opacity-40">
                {saved ? "Saved ✓" : "Save comparison"}
              </button>
              {saved && <span className="text-[11px] text-muted">Logged — repeat across windows to see where synthetic and real diverge.</span>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Choice({ label, take, onTake }: { label: string; take: boolean | null; onTake: (v: boolean) => void }) {
  return (
    <div className="rounded-lg border border-line bg-surface2/40 p-3">
      <p className="text-[11px] uppercase tracking-wider text-muted">{label}</p>
      <div className="mt-2 flex gap-2">
        <button onClick={() => onTake(true)} className={`chip ${take === true ? "border-profit/60 text-profit" : "border-line text-muted hover:text-text"}`}>Take</button>
        <button onClick={() => onTake(false)} className={`chip ${take === false ? "border-loss/60 text-loss" : "border-line text-muted hover:text-text"}`}>Skip</button>
      </div>
    </div>
  );
}
