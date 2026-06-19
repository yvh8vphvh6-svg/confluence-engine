"use client";

import { useEffect, useMemo, useState } from "react";

import { getJournal, type JournalData, type JournalTrade } from "../../lib/api";
import { fmt, pct, pctRaw, usd, signColor } from "../../lib/format";
import EquityCurve from "../../components/dashboard/EquityCurve";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function PerformancePage() {
  const [data, setData] = useState<JournalData | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    const ctrl = new AbortController();
    getJournal(ctrl.signal).then(setData).catch((e) => !ctrl.signal.aborted && setErr(String(e)));
    return () => ctrl.abort();
  }, []);

  const chrono = useMemo<JournalTrade[]>(() => [...(data?.trades ?? [])].reverse(), [data]);
  const s = data?.stats;

  const equity = useMemo(() => {
    const c: number[] = [0];
    chrono.forEach((t) => c.push(c[c.length - 1] + (t.r_multiple || 0)));
    return c;
  }, [chrono]);

  const rDist = useMemo(() => {
    const buckets = [-3, -2, -1, 0, 1, 2, 3];
    const counts = new Array(buckets.length + 1).fill(0);
    chrono.forEach((t) => {
      const r = t.r_multiple || 0;
      let bi = buckets.findIndex((b) => r < b);
      if (bi === -1) bi = buckets.length;
      counts[bi]++;
    });
    const labels = ["<-3", "-3..-2", "-2..-1", "-1..0", "0..1", "1..2", "2..3", ">3"];
    return labels.map((l, i) => ({ label: l, n: counts[i] }));
  }, [chrono]);

  const byHour = useMemo(() => {
    const m: Record<number, { n: number; r: number }> = {};
    chrono.forEach((t) => {
      const h = new Date(Number(t.opened_at || 0) * 1000).getUTCHours();
      const e = (m[h] ??= { n: 0, r: 0 }); e.n++; e.r += t.r_multiple || 0;
    });
    return m;
  }, [chrono]);

  const byWeekday = useMemo(() => {
    const m: Record<number, { n: number; r: number }> = {};
    chrono.forEach((t) => {
      const d = new Date(Number(t.opened_at || 0) * 1000).getUTCDay();
      const e = (m[d] ??= { n: 0, r: 0 }); e.n++; e.r += t.r_multiple || 0;
    });
    return m;
  }, [chrono]);

  const byDate = useMemo(() => {
    const m: Record<string, number> = {};
    chrono.forEach((t) => {
      const d = new Date(Number(t.opened_at || 0) * 1000).toISOString().slice(0, 10);
      m[d] = (m[d] || 0) + (t.r_multiple || 0);
    });
    return Object.entries(m).sort();
  }, [chrono]);

  const rolling = useMemo(() => {
    const W = 10, out: number[] = [];
    for (let i = 0; i < chrono.length; i++) {
      const win = chrono.slice(Math.max(0, i - W + 1), i + 1);
      out.push((win.filter((t) => (t.r_multiple || 0) > 0).length / win.length) * 100);
    }
    return out;
  }, [chrono]);

  if (err) return <p className="p-4 text-sm text-loss">Couldn&apos;t load journal: {err}</p>;
  if (!s) return <p className="p-4 text-sm text-muted">Loading…</p>;

  if (s.n === 0) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Header />
        <div className="panel grid min-h-[160px] place-items-center p-8 text-center text-sm text-muted">
          No paper trades yet — take some trades in Practice (or the decision drills log to the journal). Stats
          appear here once you have trades. We never show invented numbers.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Header />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        <Stat label="Trades" v={`${s.n}`} />
        <Stat label="W / L / BE" v={`${s.wins}/${s.losses}/${s.breakeven}`} />
        <Stat label="Win rate" v={pct(s.win_rate)} />
        <Stat label="Expectancy" v={`${fmt(s.expectancy_r)}R`} tone={signColor(s.expectancy_r)} />
        <Stat label="Profit factor" v={fmt(s.profit_factor)} tone={(s.profit_factor ?? 0) > 1 ? "text-profit" : "text-loss"} />
        <Stat label="Net P&L" v={usd.format(s.net_pnl)} tone={signColor(s.net_pnl)} />
        <Stat label="Avg win" v={`${fmt(s.avg_win_r)}R`} tone="text-profit" />
        <Stat label="Avg loss" v={`${fmt(s.avg_loss_r)}R`} tone="text-loss" />
        <Stat label="Max DD" v={`${fmt(s.max_drawdown_r)}R`} tone="text-loss" />
        <Stat label="Streak" v={`${s.streaks.current > 0 ? "+" : ""}${s.streaks.current}`} tone={signColor(s.streaks.current)} />
        <Stat label="Best win streak" v={`${s.streaks.best_win}`} />
        <Stat label="Avg hold" v={s.avg_hold_min != null ? `${fmt(s.avg_hold_min, 0)}m` : "—"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Equity curve (R)">
          <EquityCurve curve={equity} />
        </Panel>
        <Panel title="Rolling win rate (10-trade)">
          <LineChart values={rolling} mid={50} suffix="%" />
        </Panel>
        <Panel title="R-distribution">
          <Histogram bars={rDist} />
        </Panel>
        <Panel title="Drawdown (R)">
          <LineChart values={drawdown(equity)} mid={0} />
        </Panel>
        <Panel title="By time of day (avg R)">
          <Bars items={HOURS.filter((h) => byHour[h]).map((h) => ({ label: `${h}h`, value: byHour[h].r / byHour[h].n }))} />
        </Panel>
        <Panel title="By day of week (avg R)">
          <Bars items={[1, 2, 3, 4, 5].filter((d) => byWeekday[d]).map((d) => ({ label: WD[d], value: byWeekday[d].r / byWeekday[d].n }))} />
        </Panel>
      </div>

      <Panel title="Win/loss calendar (net R per day)">
        <div className="flex flex-wrap gap-1">
          {byDate.map(([d, r]) => (
            <div key={d} title={`${d}: ${fmt(r)}R`}
              className="h-7 w-7 rounded text-center text-[8px] leading-7"
              style={{ background: r > 0 ? `rgba(0,230,118,${Math.min(0.2 + r / 6, 0.9)})` : r < 0 ? `rgba(255,23,68,${Math.min(0.2 - r / 6, 0.9)})` : "#1a1f2e", color: "#0b0f19" }}>
              {d.slice(8)}
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Per-strategy breakdown">
          <table className="w-full text-right text-[11px]">
            <thead className="text-[9px] uppercase tracking-wider text-muted">
              <tr><th className="px-2 py-1 text-left">Strategy</th><th>n</th><th>Win%</th><th>Avg R</th></tr>
            </thead>
            <tbody className="font-mono">
              {Object.entries(s.by_strategy).sort((a, b) => b[1].avg_r - a[1].avg_r).map(([k, v]) => (
                <tr key={k} className="border-t border-line/60">
                  <td className="px-2 py-1 text-left text-text">{k}</td>
                  <td>{v.n}</td><td>{pctRaw(v.win_rate * 100)}</td>
                  <td className={signColor(v.avg_r)}>{fmt(v.avg_r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel title="Mistake tags">
          {Object.keys(s.by_mistake).length === 0 ? (
            <p className="text-xs text-muted">No mistakes tagged yet — tag them when you close a trade.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {Object.entries(s.by_mistake).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                <li key={k} className="flex justify-between"><span className="text-loss">{k}</span><span className="font-mono text-text">{v}×</span></li>
              ))}
            </ul>
          )}
          {s.mistakes.length > 0 && (
            <ul className="mt-3 space-y-1">
              {s.mistakes.map((m) => <li key={m} className="text-[11px] text-warn">• {m}</li>)}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function drawdown(equity: number[]): number[] {
  let peak = -Infinity;
  return equity.map((v) => { peak = Math.max(peak, v); return v - peak; });
}

function Header() {
  return (
    <header>
      <h1 className="text-xl font-semibold text-text">Performance</h1>
      <p className="text-sm text-muted">
        Your paper-trading record — wins/losses, expectancy, profit factor, drawdown, streaks, per-strategy and
        mistake breakdowns, and visual reports. Computed from your own logged trades; never invented.
      </p>
    </header>
  );
}

function Stat({ label, v, tone }: { label: string; v: string; tone?: string }) {
  return (
    <div className="panel p-2.5">
      <p className="text-[9px] uppercase tracking-wider text-muted">{label}</p>
      <p className={`mt-1 font-mono text-sm font-semibold ${tone ?? "text-text"}`}>{v}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="panel p-4">
      <p className="panel-head mb-2">{title}</p>
      {children}
    </div>
  );
}

function Bars({ items }: { items: { label: string; value: number }[] }) {
  if (!items.length) return <p className="text-xs text-muted">No data.</p>;
  const max = Math.max(...items.map((i) => Math.abs(i.value)), 0.5);
  return (
    <div className="space-y-1">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-2 text-[10px]">
          <span className="w-8 shrink-0 text-muted">{it.label}</span>
          <div className="relative h-3 flex-1 rounded bg-black/30">
            <div className="absolute top-0 h-3 rounded" style={{
              left: it.value < 0 ? `${50 - (Math.abs(it.value) / max) * 50}%` : "50%",
              width: `${(Math.abs(it.value) / max) * 50}%`,
              background: it.value >= 0 ? "#00E676" : "#FF1744",
            }} />
            <div className="absolute left-1/2 top-0 h-3 w-px bg-line" />
          </div>
          <span className={`w-10 shrink-0 text-right font-mono ${it.value >= 0 ? "text-profit" : "text-loss"}`}>{fmt(it.value)}</span>
        </div>
      ))}
    </div>
  );
}

function Histogram({ bars }: { bars: { label: string; n: number }[] }) {
  const max = Math.max(...bars.map((b) => b.n), 1);
  return (
    <div className="flex h-28 items-end gap-1">
      {bars.map((b) => (
        <div key={b.label} className="flex flex-1 flex-col items-center gap-1">
          <div className="w-full rounded-t" style={{
            height: `${(b.n / max) * 90}%`,
            background: b.label.includes("-") && !b.label.includes("..") ? "#FF1744" : b.label.startsWith("-") || b.label.startsWith("<") ? "#FF1744" : "#00E676",
          }} />
          <span className="text-[8px] text-muted">{b.label}</span>
        </div>
      ))}
    </div>
  );
}

function LineChart({ values, mid = 0, suffix = "" }: { values: number[]; mid?: number; suffix?: string }) {
  if (values.length < 2) return <p className="text-xs text-muted">Need more trades.</p>;
  const W = 320, H = 90, pad = 4;
  const min = Math.min(mid, ...values), max = Math.max(mid, ...values);
  const sx = (i: number) => pad + ((W - 2 * pad) * i) / (values.length - 1);
  const sy = (v: number) => H - pad - ((H - 2 * pad) * (v - min)) / (max - min || 1);
  let d = `M ${sx(0)} ${sy(values[0])}`;
  values.forEach((v, i) => (d += ` L ${sx(i)} ${sy(v)}`));
  const up = values[values.length - 1] >= mid;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[90px] w-full" preserveAspectRatio="none">
      <line x1="0" y1={sy(mid)} x2={W} y2={sy(mid)} stroke="#27304a" strokeDasharray="3 3" />
      <path d={d} fill="none" stroke={up ? "#00E676" : "#FF1744"} strokeWidth="1.6" />
    </svg>
  );
}
