"use client";

import { useCallback, useEffect, useState } from "react";

import {
  getStrategies, getJournal, addJournalNote,
  getCustomStrategies, saveCustomStrategy, deleteCustomStrategy,
  type StrategyInfo, type JournalData, type CustomStrategy,
} from "../../lib/api";
import { STRATEGY_DOCS } from "../../lib/strategyLibrary";
import { fmt, pct, signColor, REGIME_LABEL } from "../../lib/format";

// A forced pre-trade checklist — disciplined process, not signals.
const PRE_TRADE = [
  "I can name the strategy and the regime it fits",
  "Price is in a killzone / acceptable time-of-day",
  "Entry trigger is actually present (not anticipated)",
  "Stop is at structure, sized to a fixed risk",
  "Target / R:R is defined before entry",
  "No revenge / FOMO — this is a planned setup",
];

const REVIEW_PROMPTS = [
  "Did the setup match the playbook conditions?",
  "Did I follow my stop & target, or move them?",
  "What was my emotional state at entry & exit?",
  "What would I repeat? What would I change?",
];

type Tab = "test" | "build";

export default function StrategyLabPage() {
  const [tab, setTab] = useState<Tab>("test");
  const [strategies, setStrategies] = useState<StrategyInfo[]>([]);
  const [journal, setJournal] = useState<JournalData | null>(null);
  const [customs, setCustoms] = useState<(CustomStrategy & { id: number })[]>([]);
  const [err, setErr] = useState("");

  const reload = useCallback(async () => {
    try {
      const [s, j, c] = await Promise.all([
        getStrategies().catch(() => null),
        getJournal().catch(() => null),
        getCustomStrategies().catch(() => null),
      ]);
      if (s) setStrategies(s.strategies);
      if (j) setJournal(j);
      if (c) setCustoms(c.strategies);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "failed to load");
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-text">Strategy Lab</h1>
        <p className="text-sm text-muted">
          Test a strategy with a forced process — conditions, a pre-trade checklist, and a post-trade review —
          and see its real per-strategy dashboard. Or define your own and track it through the journal.
        </p>
      </header>
      {err && <p className="text-xs text-loss">{err}</p>}

      <div className="panel flex gap-2 p-2">
        <button onClick={() => setTab("test")} className={`chip ${tab === "test" ? "border-neon/60 text-neon" : "text-muted"}`}>Test &amp; review</button>
        <button onClick={() => setTab("build")} className={`chip ${tab === "build" ? "border-neon/60 text-neon" : "text-muted"}`}>Custom builder</button>
      </div>

      {tab === "test"
        ? <TestTab strategies={strategies} journal={journal} onSaved={reload} />
        : <BuildTab customs={customs} journal={journal} onChanged={reload} />}
    </div>
  );
}

// ---------------- Test & review ----------------
function TestTab({ strategies, journal, onSaved }: {
  strategies: StrategyInfo[];
  journal: JournalData | null;
  onSaved: () => void;
}) {
  const [sel, setSel] = useState<string>("");
  const active = strategies.find((s) => s.name === sel) ?? strategies[0];
  const name = active?.name ?? "";
  const doc = name ? STRATEGY_DOCS[name] : undefined;

  const [checks, setChecks] = useState<Record<number, boolean>>({});
  const [review, setReview] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");

  useEffect(() => { setChecks({}); setReview(""); setSavedMsg(""); }, [name]);

  const passed = PRE_TRADE.filter((_, i) => checks[i]).length;
  const allChecked = passed === PRE_TRADE.length;

  const saveReview = async () => {
    if (!review.trim()) return;
    setSaving(true);
    try {
      const checklist = PRE_TRADE.map((c, i) => `${checks[i] ? "✓" : "○"} ${c}`).join("\n");
      await addJournalNote({
        text: `[Strategy review — ${active?.label ?? name}]\nChecklist: ${passed}/${PRE_TRADE.length}\n${checklist}\n\n${review.trim()}`,
        emotion: "",
        trade_id: null,
      });
      setReview(""); setChecks({}); setSavedMsg("Saved to journal notes.");
      onSaved();
    } catch {
      setSavedMsg("Could not save (is the backend up?).");
    } finally {
      setSaving(false);
    }
  };

  const jStrat = name ? journal?.stats.by_strategy[name] : undefined;

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <div className="panel h-fit p-3">
        <p className="panel-head mb-2">Pick a strategy</p>
        <div className="space-y-1">
          {strategies.map((s) => (
            <button key={s.name} onClick={() => setSel(s.name)}
              className={`block w-full rounded-lg border px-2 py-1.5 text-left text-xs ${name === s.name ? "border-neon/50 text-neon" : "border-line text-muted hover:text-text"}`}>
              {s.label}
            </button>
          ))}
          {strategies.length === 0 && <p className="text-xs text-muted">Loading strategies…</p>}
        </div>
      </div>

      <div className="space-y-4">
        {active && (
          <div className="panel p-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-base font-semibold text-text">{active.label}</h2>
                <p className="text-[11px] uppercase tracking-wider text-muted">{active.name} · {active.family}</p>
              </div>
              <span className="chip border-line text-muted">best: {REGIME_LABEL[active.best_regime] ?? active.best_regime}</span>
            </div>

            {/* Conditions checklist (from the playbook) */}
            {doc && (
              <div className="mt-3">
                <p className="panel-head mb-1">Setup conditions — must all be true</p>
                <ul className="space-y-1">
                  {doc.works.map((w, i) => (
                    <li key={i} className="rounded-lg border border-line bg-black/20 px-3 py-1.5 text-xs text-text">✓ {w}</li>
                  ))}
                </ul>
                <p className="mt-2 text-[10px] text-muted">Invalidating conditions: {doc.fails.join(" · ")}</p>
              </div>
            )}
          </div>
        )}

        {/* Forced pre-trade checklist */}
        <div className="panel p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="panel-head">Forced pre-trade checklist</p>
            <span className={`chip ${allChecked ? "border-profit/50 text-profit" : "border-warn/40 text-warn"}`}>{passed}/{PRE_TRADE.length}</span>
          </div>
          <ul className="space-y-1">
            {PRE_TRADE.map((c, i) => (
              <li key={i}>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-black/20 px-3 py-1.5 text-xs">
                  <input type="checkbox" checked={!!checks[i]} onChange={(e) => setChecks((p) => ({ ...p, [i]: e.target.checked }))} />
                  <span className={checks[i] ? "text-text" : "text-muted"}>{c}</span>
                </label>
              </li>
            ))}
          </ul>
          {!allChecked && <p className="mt-2 text-[11px] text-warn">If you can&apos;t tick every box, the disciplined choice is to pass.</p>}
        </div>

        {/* Post-trade review template */}
        <div className="panel p-4">
          <p className="panel-head mb-2">Post-trade review</p>
          <ul className="mb-2 space-y-0.5 text-[11px] text-muted">
            {REVIEW_PROMPTS.map((p, i) => <li key={i}>• {p}</li>)}
          </ul>
          <textarea value={review} onChange={(e) => setReview(e.target.value)} placeholder="Write your honest review…"
            className="h-28 w-full rounded-lg border border-line bg-black/30 px-2 py-1.5 text-xs" />
          <div className="mt-2 flex items-center gap-3">
            <button onClick={saveReview} disabled={saving || !review.trim()}
              className="rounded-lg bg-neon px-4 py-1.5 text-sm font-semibold text-black hover:brightness-110 disabled:opacity-40">
              {saving ? "Saving…" : "Save review to journal"}
            </button>
            {savedMsg && <span className="text-[11px] text-muted">{savedMsg}</span>}
          </div>
        </div>

        {/* Per-strategy dashboard */}
        {active && (
          <div className="panel p-4">
            <p className="panel-head mb-2">Per-strategy dashboard — {active.label}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Backtested trades" v={active.total_trades.toString()} />
              <Stat label="Best run Exp R" v={active.best_run ? fmt(active.best_run.expectancy_r) : "—"} tone={active.best_run?.expectancy_r} />
              <Stat label="Best run win%" v={active.best_run?.sufficient_sample ? pct(active.best_run.win_rate) : "—"} />
              <Stat label="Best run gate" v={active.best_run?.sufficient_sample ? (active.best_run.promote ? "pass" : "hold") : "n<100"} />
            </div>

            <p className="mt-4 text-[10px] uppercase tracking-wider text-muted">Your journaled trades on this strategy</p>
            {jStrat ? (
              <div className="mt-1 grid grid-cols-3 gap-2">
                <Stat label="Your trades" v={jStrat.n.toString()} />
                <Stat label="Your avg R" v={fmt(jStrat.avg_r)} tone={jStrat.avg_r} />
                <Stat label="Your win%" v={jStrat.n >= 5 ? pctRaw(jStrat.win_rate) : "n<5"} />
              </div>
            ) : (
              <p className="mt-1 text-xs text-muted">No journaled trades tagged to this strategy yet — log paper trades to build your own sample.</p>
            )}
            <p className="mt-3 text-[10px] text-muted">Backtest stats are synthetic-data estimates. Your stats need a real sample before they mean anything.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------- Custom builder ----------------
const EMPTY: CustomStrategy = {
  name: "", family: "custom", description: "", conditions: [],
  entry_trigger: "", stop_logic: "", target_rr: 2, sizing: "", timeframes: [], notes: "",
};

function BuildTab({ customs, journal, onChanged }: {
  customs: (CustomStrategy & { id: number })[];
  journal: JournalData | null;
  onChanged: () => void;
}) {
  const [form, setForm] = useState<CustomStrategy>(EMPTY);
  const [conditionsText, setConditionsText] = useState("");
  const [tfText, setTfText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const edit = (c: CustomStrategy) => {
    setForm({ ...c });
    setConditionsText(c.conditions.join("\n"));
    setTfText(c.timeframes.join(", "));
    setMsg("");
  };

  const save = async () => {
    if (!form.name.trim()) { setMsg("Give it a name."); return; }
    setBusy(true); setMsg("");
    try {
      await saveCustomStrategy({
        ...form,
        name: form.name.trim(),
        conditions: conditionsText.split("\n").map((s) => s.trim()).filter(Boolean),
        timeframes: tfText.split(",").map((s) => s.trim()).filter(Boolean),
        target_rr: Number(form.target_rr) || 0,
      });
      setForm(EMPTY); setConditionsText(""); setTfText(""); setMsg("Saved.");
      onChanged();
    } catch {
      setMsg("Could not save (is the backend up?).");
    } finally { setBusy(false); }
  };

  const remove = async (name: string) => {
    setBusy(true);
    try { await deleteCustomStrategy(name); onChanged(); } finally { setBusy(false); }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="panel space-y-3 p-4">
        <p className="panel-head">Define a strategy</p>
        <Input label="Name" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="e.g. London sweep + FVG" />
        <Input label="Family / style" value={form.family ?? ""} onChange={(v) => setForm((f) => ({ ...f, family: v }))} placeholder="smc / breakout / mean-reversion" />
        <Area label="Description — what & why it has an edge" value={form.description ?? ""} onChange={(v) => setForm((f) => ({ ...f, description: v }))} />
        <Area label="Setup conditions (one per line)" value={conditionsText} onChange={setConditionsText} placeholder={"HTF bias is up\nPrice swept Asian low\nFVG left on the reclaim"} />
        <Input label="Entry trigger" value={form.entry_trigger} onChange={(v) => setForm((f) => ({ ...f, entry_trigger: v }))} placeholder="Limit at FVG midpoint after reclaim" />
        <Input label="Stop logic" value={form.stop_logic} onChange={(v) => setForm((f) => ({ ...f, stop_logic: v }))} placeholder="Below the sweep low + buffer" />
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-[9px] uppercase tracking-wider text-muted">Target R:R</span>
            <input type="number" min={0} step="0.25" value={form.target_rr}
              onChange={(e) => setForm((f) => ({ ...f, target_rr: Number(e.target.value) }))}
              className="mt-1 w-full rounded-lg border border-line bg-black/30 px-2 py-1 font-mono text-xs" />
          </label>
          <Input label="Sizing rule" value={form.sizing} onChange={(v) => setForm((f) => ({ ...f, sizing: v }))} placeholder="Fixed 1% / trade" />
        </div>
        <Input label="Timeframes (comma-separated)" value={tfText} onChange={setTfText} placeholder="5m, 15m" />
        <Area label="Notes" value={form.notes ?? ""} onChange={(v) => setForm((f) => ({ ...f, notes: v }))} />
        <div className="flex items-center gap-3">
          <button onClick={save} disabled={busy} className="rounded-lg bg-neon px-4 py-1.5 text-sm font-semibold text-black hover:brightness-110 disabled:opacity-40">
            {busy ? "…" : "Save strategy"}
          </button>
          {form.name && <button onClick={() => { setForm(EMPTY); setConditionsText(""); setTfText(""); }} className="btn text-xs">Clear</button>}
          {msg && <span className="text-[11px] text-muted">{msg}</span>}
        </div>
        <p className="text-[10px] text-warn">
          Custom strategies are traded manually in Practice and tracked by tagging your paper trades with the strategy
          name in the journal. No auto-execution — simulation only.
        </p>
      </div>

      <div className="space-y-3">
        <p className="panel-head">Your strategies ({customs.length})</p>
        {customs.length === 0 && <div className="panel grid min-h-[120px] place-items-center text-sm text-muted">None yet. Define one on the left.</div>}
        {customs.map((c) => {
          const j = journal?.stats.by_strategy[c.name];
          return (
            <div key={c.id} className="panel p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-text">{c.name}</h3>
                  <p className="text-[10px] uppercase tracking-wider text-muted">{c.family || "custom"} · R:R {c.target_rr}:1</p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => edit(c)} className="chip border-line text-muted hover:text-text">Edit</button>
                  <button onClick={() => remove(c.name)} className="chip border-loss/40 text-loss">Delete</button>
                </div>
              </div>
              {c.description && <p className="mt-1 text-xs text-muted">{c.description}</p>}
              {c.conditions.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-[11px] text-text">
                  {c.conditions.map((cond, i) => <li key={i}>• {cond}</li>)}
                </ul>
              )}
              <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                {c.entry_trigger && <span className="chip border-line text-muted">entry: {c.entry_trigger}</span>}
                {c.stop_logic && <span className="chip border-line text-muted">stop: {c.stop_logic}</span>}
                {c.timeframes.map((tf) => <span key={tf} className="chip border-line text-muted">{tf}</span>)}
              </div>
              <div className="mt-2 rounded-lg border border-line bg-black/20 px-3 py-1.5 text-[11px]">
                {j ? (
                  <span className="text-text">Journal: {j.n} trades · avg <span className={signColor(j.avg_r)}>{fmt(j.avg_r)}R</span>{j.n >= 5 ? ` · ${pctRaw(j.win_rate)} win` : " · n<5"}</span>
                ) : (
                  <span className="text-muted">No journaled trades yet — tag paper trades &quot;{c.name}&quot; to track it.</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, v, tone }: { label: string; v: string; tone?: number | null }) {
  const color = tone == null ? "text-text" : signColor(tone);
  return (
    <div className="rounded-lg border border-line bg-black/20 px-2 py-1.5">
      <p className="text-[9px] uppercase tracking-wider text-muted">{label}</p>
      <p className={`mt-0.5 font-mono text-sm ${color}`}>{v}</p>
    </div>
  );
}

function Input({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="text-[9px] uppercase tracking-wider text-muted">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-line bg-black/30 px-2 py-1.5 text-xs" />
    </label>
  );
}

function Area({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="text-[9px] uppercase tracking-wider text-muted">{label}</span>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="mt-1 h-20 w-full rounded-lg border border-line bg-black/30 px-2 py-1.5 text-xs" />
    </label>
  );
}

function pctRaw(p: number | null | undefined) {
  if (p == null) return "—";
  return `${Math.round(p * 100)}%`;
}
