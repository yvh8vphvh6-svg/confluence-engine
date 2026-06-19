"use client";

import { useCallback, useEffect, useState } from "react";

import { getJournal, addJournalNote, addJournalSession, type JournalData } from "../../lib/api";
import { fmt, pct, usd, signColor } from "../../lib/format";

const EMOTIONS = ["disciplined", "calm", "fomo", "revenge", "anxious", "greedy", "bored"];
const MOODS = ["focused", "calm", "tired", "stressed", "distracted", "confident", "anxious"];

export default function JournalPage() {
  const [data, setData] = useState<JournalData | null>(null);
  const [text, setText] = useState("");
  const [emotion, setEmotion] = useState("disciplined");
  const [err, setErr] = useState("");

  // session review form
  const [mood, setMood] = useState("focused");
  const [confidence, setConfidence] = useState(5);
  const [goals, setGoals] = useState("");
  const [sessNotes, setSessNotes] = useState("");
  const [sessMsg, setSessMsg] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await getJournal());
      setErr("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed to load");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submitNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    await addJournalNote({ text, emotion }).catch(() => undefined);
    setText("");
    void load();
  };

  const submitSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setSessMsg("");
    try {
      await addJournalSession({ mood, confidence, goals, notes: sessNotes });
      setGoals(""); setSessNotes(""); setSessMsg("Session logged.");
      void load();
    } catch {
      setSessMsg("Could not save (is the backend up?).");
    }
  };

  const stats = data?.stats;
  const weekly = data?.weekly ?? [];
  const sessions = data?.sessions ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-text">Journal</h1>
        <p className="text-sm text-muted">
          Paper trades auto-log here with full performance metrics. Add session reviews and notes, watch your
          weekly trend and recurring mistakes — discipline is the edge you can actually control.
        </p>
      </header>
      {err && <p className="text-xs text-loss">{err}</p>}

      {/* Headline metrics */}
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Paper trades" value={String(stats?.n ?? 0)} />
        <Stat label="Win rate" value={stats?.n ? pct(stats.win_rate) : "—"} />
        <Stat label="Expectancy (R)" value={stats?.n ? fmt(stats.expectancy_r) : "—"} tone={signColor(stats?.expectancy_r)} />
        <Stat label="Net P&L" value={usd.format(stats?.net_pnl ?? 0)} tone={signColor(stats?.net_pnl)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <Stat label="Wins" value={String(stats?.wins ?? 0)} small />
        <Stat label="Losses" value={String(stats?.losses ?? 0)} small />
        <Stat label="Breakeven" value={String(stats?.breakeven ?? 0)} small />
        <Stat label="Avg win (R)" value={stats?.n ? fmt(stats.avg_win_r) : "—"} tone="text-profit" small />
        <Stat label="Avg loss (R)" value={stats?.n ? fmt(stats.avg_loss_r) : "—"} tone="text-loss" small />
        <Stat label="Profit factor" value={stats?.n ? fmt(stats.profit_factor) : "—"} small />
        <Stat label="Max DD (R)" value={stats?.n ? fmt(stats.max_drawdown_r) : "—"} tone="text-loss" small />
      </div>
      {stats && stats.n > 0 && (
        <p className="text-[11px] text-muted">
          Streak: {stats.streaks.current >= 0 ? `${stats.streaks.current} win` : `${-stats.streaks.current} loss`}
          {Math.abs(stats.streaks.current) === 1 ? "" : "s"} · best win streak {stats.streaks.best_win} · worst loss streak {stats.streaks.best_loss}
          {stats.avg_hold_min != null && ` · avg hold ${fmt(stats.avg_hold_min, 0)} min`}
          {stats.n < 30 && <span className="text-warn"> · small sample ({stats.n}) — treat metrics as provisional</span>}
        </p>
      )}

      {/* Recurring mistakes + tags */}
      {stats && (stats.mistakes.length > 0 || Object.keys(stats.by_mistake).length > 0) && (
        <div className="panel border-warn/30 p-4">
          <p className="panel-head mb-2 text-warn">Recurring patterns &amp; mistake tags</p>
          {stats.mistakes.length > 0 && (
            <ul className="mb-2 space-y-1 text-sm text-text">
              {stats.mistakes.map((m) => <li key={m}>• {m}</li>)}
            </ul>
          )}
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(stats.by_mistake).sort((a, b) => b[1] - a[1]).map(([tag, count]) => (
              <span key={tag} className="chip border-warn/40 text-warn">{tag} · {count}</span>
            ))}
            {Object.keys(stats.by_mistake).length === 0 && <span className="text-xs text-muted">No mistake tags logged on trades yet.</span>}
          </div>
        </div>
      )}

      {/* Weekly review */}
      <div className="panel overflow-hidden">
        <div className="border-b border-line p-3"><p className="panel-head">Weekly review (auto)</p></div>
        {weekly.length === 0 ? (
          <p className="p-4 text-xs text-muted">No closed trades yet — weekly summaries appear once you log trades.</p>
        ) : (
          <div className="max-h-[260px] overflow-y-auto">
            <table className="w-full text-right text-[11px]">
              <thead className="sticky top-0 bg-panel text-[9px] uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-3 py-2 text-left">Week</th>
                  <th className="px-3 py-2">Trades</th>
                  <th className="px-3 py-2">Win%</th>
                  <th className="px-3 py-2">Exp R</th>
                  <th className="px-3 py-2">Δ vs prev</th>
                  <th className="px-3 py-2 text-left">Best strat</th>
                  <th className="px-3 py-2 text-left">Repeated mistake</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {weekly.map((w) => (
                  <tr key={w.week} className="border-t border-line/60">
                    <td className="px-3 py-1.5 text-left text-text">{w.week}</td>
                    <td className="px-3 py-1.5 text-muted">{w.n}</td>
                    <td className="px-3 py-1.5">{w.n >= 5 ? pct(w.win_rate) : "—"}</td>
                    <td className={`px-3 py-1.5 ${signColor(w.expectancy_r)}`}>{fmt(w.expectancy_r)}</td>
                    <td className={`px-3 py-1.5 ${signColor(w.expectancy_delta_vs_prev)}`}>{w.expectancy_delta_vs_prev == null ? "—" : fmt(w.expectancy_delta_vs_prev)}</td>
                    <td className="px-3 py-1.5 text-left text-muted">{w.best_strategy ?? "—"}</td>
                    <td className="px-3 py-1.5 text-left text-warn">{w.repeated_mistake ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* By exit / by strategy */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="panel p-4">
          <p className="panel-head mb-2">Exit reasons</p>
          {stats && Object.keys(stats.by_exit).length ? (
            <ul className="space-y-1 text-sm">
              {Object.entries(stats.by_exit).map(([k, v]) => (
                <li key={k} className="flex justify-between"><span className="text-muted">{k}</span><span className="font-mono text-text">{v}</span></li>
              ))}
            </ul>
          ) : <p className="text-xs text-muted">No trades yet.</p>}
        </div>
        <div className="panel p-4">
          <p className="panel-head mb-2">By emotion (avg R)</p>
          {stats && Object.keys(stats.by_emotion).length ? (
            <ul className="space-y-1 text-sm">
              {Object.entries(stats.by_emotion).map(([k, v]) => (
                <li key={k} className="flex justify-between"><span className="text-muted">{k}</span><span className={`font-mono ${signColor(v.avg_r)}`}>{fmt(v.avg_r)} ({v.n})</span></li>
              ))}
            </ul>
          ) : <p className="text-xs text-muted">Tag your notes/trades with an emotion to see this.</p>}
        </div>
        <div className="panel p-4">
          <p className="panel-head mb-2">By strategy (avg R)</p>
          {stats && Object.keys(stats.by_strategy).length ? (
            <ul className="space-y-1 text-sm">
              {Object.entries(stats.by_strategy).map(([k, v]) => (
                <li key={k} className="flex justify-between"><span className="text-muted">{k}</span><span className={`font-mono ${signColor(v.avg_r)}`}>{fmt(v.avg_r)} ({v.n})</span></li>
              ))}
            </ul>
          ) : <p className="text-xs text-muted">No trades yet.</p>}
        </div>
      </div>

      {/* Session review form */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="panel p-4">
          <p className="panel-head mb-2">Session review</p>
          <form onSubmit={submitSession} className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-[9px] uppercase tracking-wider text-muted">Mood</span>
                <select value={mood} onChange={(e) => setMood(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-black/30 px-2 py-1.5 text-xs">
                  {MOODS.map((m) => <option key={m}>{m}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-[9px] uppercase tracking-wider text-muted">Confidence: {confidence}/10</span>
                <input type="range" min={1} max={10} value={confidence} onChange={(e) => setConfidence(Number(e.target.value))} className="mt-2 w-full" />
              </label>
            </div>
            <label className="block">
              <span className="text-[9px] uppercase tracking-wider text-muted">Goals for the session</span>
              <input value={goals} onChange={(e) => setGoals(e.target.value)} placeholder="e.g. Only A+ setups; max 3 trades"
                className="mt-1 w-full rounded-lg border border-line bg-black/30 px-2 py-1.5 text-xs" />
            </label>
            <label className="block">
              <span className="text-[9px] uppercase tracking-wider text-muted">Notes / reflection</span>
              <textarea value={sessNotes} onChange={(e) => setSessNotes(e.target.value)} placeholder="How did the session go? What did you learn?"
                className="mt-1 h-20 w-full rounded-lg border border-line bg-black/30 px-2 py-1.5 text-xs" />
            </label>
            <div className="flex items-center gap-3">
              <button className="btn">Log session</button>
              {sessMsg && <span className="text-[11px] text-muted">{sessMsg}</span>}
            </div>
          </form>
        </div>

        <div className="panel p-4">
          <p className="panel-head mb-2">Add a note</p>
          <form onSubmit={submitNote} className="space-y-2">
            <textarea value={text} onChange={(e) => setText(e.target.value)}
              placeholder="What did you see? How did you feel? What will you do differently?"
              className="h-20 w-full rounded-lg border border-line bg-black/30 px-3 py-2 text-sm" />
            <div className="flex items-center gap-2">
              <select value={emotion} onChange={(e) => setEmotion(e.target.value)} className="rounded-lg border border-line bg-black/30 px-3 py-1.5 text-xs">
                {EMOTIONS.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
              <button className="btn" disabled={!text.trim()}>Save note</button>
            </div>
          </form>
        </div>
      </div>

      {/* Session log */}
      {sessions.length > 0 && (
        <div className="panel p-4">
          <p className="panel-head mb-2">Session log</p>
          <ul className="space-y-2">
            {sessions.map((s) => (
              <li key={s.id} className="rounded-lg border border-line bg-black/20 p-2 text-sm">
                <div className="flex items-center gap-2 text-[11px] text-muted">
                  <span className="chip border-accent/40 text-accent">{s.mood}</span>
                  <span>confidence {s.confidence}/10</span>
                  <span className="ml-auto">{s.created_at}</span>
                </div>
                {s.goals && <p className="mt-1 text-text"><span className="text-muted">Goals:</span> {s.goals}</p>}
                {s.notes && <p className="mt-0.5 text-text">{s.notes}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Trade log */}
      <div className="panel overflow-hidden">
        <div className="border-b border-line p-3"><p className="panel-head">Paper trade log</p></div>
        <div className="max-h-[360px] overflow-y-auto">
          <table className="w-full text-right text-[11px]">
            <thead className="sticky top-0 bg-panel text-[9px] uppercase tracking-wider text-muted">
              <tr>
                <th className="px-3 py-2 text-left">Strategy</th>
                <th className="px-3 py-2">Dir</th>
                <th className="px-3 py-2">Regime</th>
                <th className="px-3 py-2">R</th>
                <th className="px-3 py-2">P&L</th>
                <th className="px-3 py-2 text-left">Exit</th>
                <th className="px-3 py-2 text-left">Emotion</th>
                <th className="px-3 py-2 text-left">Mistakes</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {(data?.trades ?? []).length === 0 && (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-muted">No paper trades yet. Turn on Manual mode on the dashboard and take a setup.</td></tr>
              )}
              {(data?.trades ?? []).map((t) => (
                <tr key={t.id} className="border-t border-line/60">
                  <td className="px-3 py-1.5 text-left text-text">{t.strategy}</td>
                  <td className={`px-3 py-1.5 ${t.direction === "long" ? "text-profit" : "text-loss"}`}>{t.direction}</td>
                  <td className="px-3 py-1.5 text-muted">{t.regime}</td>
                  <td className={`px-3 py-1.5 ${signColor(t.r_multiple)}`}>{fmt(t.r_multiple)}</td>
                  <td className={`px-3 py-1.5 ${signColor(t.pnl_dollars)}`}>{usd.format(t.pnl_dollars)}</td>
                  <td className="px-3 py-1.5 text-left text-muted">{t.exit_reason}</td>
                  <td className="px-3 py-1.5 text-left text-muted">{t.emotion || "—"}</td>
                  <td className="px-3 py-1.5 text-left text-warn">{t.mistakes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {(data?.notes ?? []).length > 0 && (
        <div className="panel p-4">
          <p className="panel-head mb-2">Notes</p>
          <ul className="space-y-2">
            {(data?.notes ?? []).map((n) => (
              <li key={n.id} className="rounded-lg border border-line bg-black/20 p-2 text-sm">
                <span className="mr-2 chip border-accent/40 text-accent">{n.emotion || "note"}</span>
                <span className="whitespace-pre-wrap">{n.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone, small }: { label: string; value: string; tone?: string; small?: boolean }) {
  return (
    <div className="panel p-4">
      <p className="text-[9px] uppercase tracking-wider text-muted">{label}</p>
      <p className={`mt-1 font-mono font-semibold ${small ? "text-base" : "text-lg"} ${tone ?? "text-text"}`}>{value}</p>
    </div>
  );
}
