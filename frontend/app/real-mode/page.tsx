"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getMarketBars, type MarketBars } from "../../lib/api";
import { useSettings } from "../../lib/settings";
import { fmt } from "../../lib/format";

const BarsChart = dynamic(() => import("../../components/BarsChart"), { ssr: false });

const SYMBOLS = ["MNQ", "MGC"];
const TIMEFRAMES = ["5m", "15m", "1h"];
const START_BARS = 120; // history shown before the cursor

type Pos = { dir: 1 | -1; entry: number; stop: number; target: number; openedCursor: number };
type Account = { trades: number; wins: number; realizedR: number };

export default function RealModePage() {
  const source = useSettings((s) => s.settings.marketSource);
  const [symbol, setSymbol] = useState("MNQ");
  const [timeframe, setTimeframe] = useState("5m");
  const [data, setData] = useState<MarketBars | null>(null);
  const [err, setErr] = useState("");

  const [cursor, setCursor] = useState(START_BARS);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const [acct, setAcct] = useState<Account>({ trades: 0, wins: 0, realizedR: 0 });
  const [stopPts, setStopPts] = useState(20);
  const [tpPts, setTpPts] = useState(40);

  const load = useCallback(() => {
    setData(null); setErr(""); setPlaying(false); setPos(null);
    setAcct({ trades: 0, wins: 0, realizedR: 0 }); setCursor(START_BARS);
    const ctrl = new AbortController();
    getMarketBars(symbol, timeframe, source, ctrl.signal)
      .then(setData)
      .catch((e) => !ctrl.signal.aborted && setErr(e instanceof Error ? e.message : "failed to load"));
    return () => ctrl.abort();
  }, [symbol, timeframe, source]);

  useEffect(() => load(), [load]);

  const bars = useMemo(() => data?.bars ?? [], [data]);
  const atEnd = cursor >= bars.length - 1;
  const last = bars[Math.min(cursor, bars.length - 1)];

  // resolve an open position against the bar the cursor just advanced onto
  const resolveAt = useCallback((idx: number) => {
    setPos((p) => {
      const b = bars[idx];
      if (!p || !b) return p;
      let exit: number | null = null;
      if (p.dir > 0) exit = b.low <= p.stop ? p.stop : b.high >= p.target ? p.target : null;
      else exit = b.high >= p.stop ? p.stop : b.low <= p.target ? p.target : null;
      if (exit == null) return p;
      const risk = Math.abs(p.entry - p.stop);
      const r = risk > 0 ? ((exit - p.entry) * p.dir) / risk : 0;
      setAcct((a) => ({ trades: a.trades + 1, wins: a.wins + (r > 0 ? 1 : 0), realizedR: Number((a.realizedR + r).toFixed(3)) }));
      return null;
    });
  }, [bars]);

  const advance = useCallback(() => {
    setCursor((c) => {
      const nc = Math.min(c + 1, bars.length - 1);
      if (nc !== c) resolveAt(nc);
      return nc;
    });
  }, [bars.length, resolveAt]);

  // play loop
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!playing) return;
    timer.current = setInterval(() => {
      setCursor((c) => {
        const nc = Math.min(c + 1, bars.length - 1);
        if (nc !== c) resolveAt(nc);
        if (nc >= bars.length - 1) setPlaying(false);
        return nc;
      });
    }, 700);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [playing, bars.length, resolveAt]);

  const place = (dir: 1 | -1) => {
    if (!last || pos) return;
    const entry = last.close;
    setPos({ dir, entry, stop: dir > 0 ? entry - stopPts : entry + stopPts, target: dir > 0 ? entry + tpPts : entry - tpPts, openedCursor: cursor });
  };
  const closeNow = () => {
    if (!pos || !last) return;
    const risk = Math.abs(pos.entry - pos.stop);
    const r = risk > 0 ? ((last.close - pos.entry) * pos.dir) / risk : 0;
    setAcct((a) => ({ trades: a.trades + 1, wins: a.wins + (r > 0 ? 1 : 0), realizedR: Number((a.realizedR + r).toFixed(3)) }));
    setPos(null);
  };

  const visible = useMemo(() => bars.slice(0, cursor + 1), [bars, cursor]);
  const unrealR = pos && last ? ((last.close - pos.entry) * pos.dir) / Math.max(1e-9, Math.abs(pos.entry - pos.stop)) : 0;
  const winRate = acct.trades ? Math.round((acct.wins / acct.trades) * 100) : 0;
  const isLive = data?.kind === "live";

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-text">Real Mode <span className="text-xs font-normal text-muted">— the capstone</span></h1>
          <p className="text-sm text-muted">Real market data, your own reads. No auto-pause, no coach — just you and the chart.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`chip ${isLive ? "border-neon/50 text-neon" : "border-warn/50 text-warn"}`}>
            {isLive ? "LIVE data" : "REPLAY data"}
          </span>
          <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className="rounded-lg border border-line bg-black/30 px-2 py-1.5 text-xs">
            {SYMBOLS.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)} className="rounded-lg border border-line bg-black/30 px-2 py-1.5 text-xs">
            {TIMEFRAMES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
      </header>

      <p className="rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-center text-[11px] text-warn">
        Simulation only — Real Mode uses real DATA but places PAPER trades. No broker, no real orders, ever.
        {data?.note ? ` · ${data.note}` : ""}
      </p>

      {err && <p className="panel border-loss/40 p-4 text-xs text-loss">{err} — switch source in Settings or try another instrument.</p>}
      {!err && !data && <p className="panel p-6 text-center text-sm text-muted">Loading real bars…</p>}

      {data && bars.length > 0 && (
        <>
          <div className="panel p-3">
            <BarsChart candles={visible} overlays={data.overlays} trade={pos ? { entry: pos.entry, stop: pos.stop, target: pos.target } : null} height={380} />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button onClick={() => { setPlaying(false); setCursor(START_BARS); setPos(null); }} className="btn text-[11px]">⏮ Reset</button>
              <button onClick={advance} disabled={atEnd} className="btn text-[11px]">Step ▶</button>
              <button onClick={() => setPlaying((p) => !p)} disabled={atEnd} className="btn text-[11px]">{playing ? "⏸ Pause" : "▶ Play"}</button>
              <span className="text-[11px] text-muted">bar {cursor + 1}/{bars.length}{atEnd ? " · end of window" : ""}</span>
            </div>
            <p className="mt-1 text-[10px] text-muted">Overlays are structure zones from the loaded window. Trades resolve forward on stop/target.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="panel p-4">
              <p className="panel-head mb-2">Manual paper trade</p>
              {pos ? (
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className={`chip ${pos.dir > 0 ? "border-profit/50 text-profit" : "border-loss/50 text-loss"}`}>{pos.dir > 0 ? "LONG" : "SHORT"}</span>
                    <span className="text-muted">entry {fmt(pos.entry)} · stop {fmt(pos.stop)} · target {fmt(pos.target)}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-line bg-black/20 px-3 py-2">
                    <span className="text-muted">Unrealized</span>
                    <span className={`font-mono text-base font-semibold ${unrealR >= 0 ? "text-profit" : "text-loss"}`}>{unrealR >= 0 ? "+" : ""}{unrealR.toFixed(2)}R</span>
                  </div>
                  <button onClick={closeNow} className="btn w-full border-loss/50 text-loss hover:border-loss">Close at {last ? fmt(last.close) : "—"}</button>
                  <p className="text-[10px] text-muted">Auto-closes on stop/target as you Step/Play forward.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Stop (pts)" value={stopPts} onChange={setStopPts} />
                    <Field label="Target (pts)" value={tpPts} onChange={setTpPts} />
                  </div>
                  <p className="text-[10px] text-muted">Entry ≈ {last ? fmt(last.close) : "—"} (current bar close) · R:R {stopPts > 0 ? (tpPts / stopPts).toFixed(1) : "—"}:1</p>
                  <div className="flex gap-2">
                    <button onClick={() => place(1)} disabled={atEnd || stopPts <= 0 || tpPts <= 0} className="btn flex-1 border-profit/50 text-profit hover:border-profit disabled:opacity-40">▲ Buy</button>
                    <button onClick={() => place(-1)} disabled={atEnd || stopPts <= 0 || tpPts <= 0} className="btn flex-1 border-loss/50 text-loss hover:border-loss disabled:opacity-40">▼ Sell</button>
                  </div>
                </div>
              )}
            </div>

            <div className="panel p-4">
              <p className="panel-head mb-2">Real-mode account (R)</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <Stat label="Realized" v={`${acct.realizedR >= 0 ? "+" : ""}${acct.realizedR}R`} tone={acct.realizedR >= 0 ? "text-profit" : "text-loss"} />
                <Stat label="Trades" v={String(acct.trades)} />
                <Stat label="Win rate" v={acct.trades ? `${winRate}%` : "—"} />
              </div>
              <p className="mt-3 text-[10px] text-muted">Tracked locally for this session. The capstone is reading real structure with the discipline you built on synthetic data.</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="text-[9px] uppercase tracking-wider text-muted">{label}</span>
      <input type="number" min={0} step="0.25" value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value)))}
        className="mt-1 w-full rounded-lg border border-line bg-black/30 px-2 py-1 font-mono text-xs" />
    </label>
  );
}

function Stat({ label, v, tone = "text-text" }: { label: string; v: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface2/40 p-2">
      <p className="text-[9px] uppercase tracking-wider text-muted">{label}</p>
      <p className={`mt-0.5 font-mono text-sm font-semibold ${tone}`}>{v}</p>
    </div>
  );
}
