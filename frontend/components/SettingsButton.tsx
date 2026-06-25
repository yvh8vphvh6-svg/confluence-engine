"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { clearDecisions, clearJournal, getJournal, type JournalData } from "../lib/api";
import {
  useSettings,
  type Density,
  type Instrument,
  type MotionPref,
  type RegimeFilter,
  type Settings,
  type Timeframe,
  type Verbosity,
} from "../lib/settings";
import { useStore } from "../lib/store";
import { applyTheme, DEFAULT_THEME_ID, storedThemeId, THEMES } from "../lib/themes";
import { useMediaQuery } from "../lib/useMediaQuery";
import { useReducedMotion } from "../lib/useMotion";

// ---------- control primitives ----------
function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full border transition ${checked ? "border-neon/60 bg-neon/30" : "border-line bg-black/30"}`}
    >
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-text transition-all ${checked ? "left-[1.375rem]" : "left-0.5"}`} />
    </button>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex shrink-0 rounded-lg border border-line p-0.5 text-[11px]">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={`rounded-md px-2.5 py-1 font-medium transition ${value === o.v ? "bg-neon/15 text-neon" : "text-muted hover:text-text"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h3 className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">{title}</h3>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm text-text">{label}</p>
        {hint && <p className="text-[11px] text-muted">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

const numberInputClass = "w-24 rounded-lg border border-line bg-black/30 px-2 py-1.5 text-right font-mono text-xs";
const selectClass = "rounded-lg border border-line bg-black/30 px-2 py-1.5 text-xs";

// ---------- export helpers ----------
function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function tradesToCsv(data: JournalData): string {
  const cols: (keyof JournalData["trades"][number])[] = [
    "id", "created_at", "strategy", "direction", "regime", "entry_price", "exit_price",
    "r_multiple", "pnl_dollars", "exit_reason", "emotion", "mistakes", "note",
  ];
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...data.trades.map((t) => cols.map((c) => esc(t[c])).join(","))].join("\n");
}

// ---------- panel ----------
export default function SettingsButton() {
  const settings = useSettings((s) => s.settings);
  const update = useSettings((s) => s.update);
  const resetAll = useSettings((s) => s.resetAll);

  const isDesktop = useMediaQuery("(min-width: 768px)");
  const reduced = useReducedMotion();

  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);
  const [themeId, setThemeId] = useState<string>(DEFAULT_THEME_ID);
  const [confirmReset, setConfirmReset] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const prevOpen = useRef(false);

  useEffect(() => {
    if (open) {
      setThemeId(storedThemeId());
      setMounted(true);
      const raf = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(raf);
    }
    setShown(false);
    setConfirmReset(false);
    setMsg("");
    const t = setTimeout(() => setMounted(false), 200);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (open && panelRef.current) {
      panelRef.current.querySelector<HTMLElement>("button, select, input, [tabindex]")?.focus();
    } else if (prevOpen.current && !open) {
      triggerRef.current?.focus();
    }
    prevOpen.current = open;
  }, [open, mounted]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const f = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
      );
      if (f.length === 0) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const pickTheme = (id: string) => {
    applyTheme(id);
    setThemeId(id);
  };

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => update(key, value);

  const doExport = async (fmt: "csv" | "json") => {
    setMsg("");
    try {
      const data = await getJournal();
      if (fmt === "json") download("confluence-journal.json", JSON.stringify(data, null, 2), "application/json");
      else download("confluence-trades.csv", tradesToCsv(data), "text/csv");
    } catch {
      setMsg("Export failed (is the backend up?).");
    }
  };

  const doResetStats = async () => {
    setBusy(true);
    setMsg("");
    try {
      await clearJournal();
      await clearDecisions();
      useStore.getState().resetPaper();
      try {
        localStorage.removeItem("ce_scenarios_v1");
        localStorage.removeItem("ce_psychology_v1");
      } catch {
        /* ignore */
      }
      setMsg("Practice stats reset.");
    } catch {
      setMsg("Reset failed (is the backend up?).");
    } finally {
      setBusy(false);
      setConfirmReset(false);
    }
  };

  const resetDefaults = () => {
    resetAll();
    applyTheme(DEFAULT_THEME_ID);
    setThemeId(DEFAULT_THEME_ID);
    setMsg("Settings restored to defaults.");
  };

  // motion-aware enter/leave classes (reduced motion → opacity only)
  const closed = reduced ? "opacity-0" : isDesktop ? "scale-95 opacity-0" : "translate-y-full opacity-0";
  const panelClasses = [
    "pointer-events-auto relative flex flex-col overflow-hidden border border-line glass-surface shadow-2xl shadow-black/60",
    "transition duration-200 ease-out",
    "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:z-10 before:h-px before:bg-gradient-to-r before:from-transparent before:via-accent/70 before:to-transparent",
    isDesktop ? "w-[min(40rem,calc(100vw-2rem))] max-h-[86vh] rounded-2xl" : "h-full w-full rounded-none pb-[env(safe-area-inset-bottom)]",
    shown ? "translate-y-0 scale-100 opacity-100" : closed,
  ].join(" ");

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Open settings"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="grid h-9 w-9 place-items-center rounded-lg border border-line text-muted transition hover:border-accent/50 hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      {mounted && createPortal(
        // portal to <body> so the header's backdrop-filter doesn't become the
        // containing block for this fixed, full-viewport dialog
        <div className="fixed inset-0 z-[65]">
          <div
            onClick={() => setOpen(false)}
            aria-hidden="true"
            className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${shown ? "opacity-100" : "opacity-0"}`}
          />
          <div className="pointer-events-none absolute inset-0 flex items-stretch justify-center md:items-center md:p-4">
            <div ref={panelRef} role="dialog" aria-modal="true" aria-label="Settings" className={panelClasses}>
              <header className="flex items-center justify-between border-b border-line px-5 py-3">
                <h2 className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-text">Settings</h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close settings"
                  className="grid h-9 w-9 place-items-center rounded-md text-muted transition hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </header>

              <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-4">
                <Section title="Appearance">
                  <div>
                    <p className="mb-2 text-sm text-text">Theme</p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {THEMES.map((t) => {
                        const on = t.id === themeId;
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => pickTheme(t.id)}
                            aria-pressed={on}
                            className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition ${
                              on ? "border-accent/70 bg-accent/10 text-text" : "border-line text-muted hover:border-accent/40 hover:text-text"
                            }`}
                          >
                            <span className="flex shrink-0 gap-1">
                              <span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: `rgb(${t.vars["--ac"]})` }} />
                              <span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: `rgb(${t.vars["--ac2"]})` }} />
                            </span>
                            <span className="truncate"><span aria-hidden="true">{t.symbol}</span> {t.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <Row label="Reduced motion" hint="Disable animations">
                    <Segmented<MotionPref>
                      value={settings.reducedMotion}
                      onChange={(v) => set("reducedMotion", v)}
                      options={[{ v: "system", label: "OS" }, { v: "on", label: "On" }, { v: "off", label: "Off" }]}
                    />
                  </Row>
                  <Row label="Ambient starfield" hint="Animated background (desktop)">
                    <Toggle label="Ambient starfield" checked={settings.ambientBackground} onChange={(v) => set("ambientBackground", v)} />
                  </Row>
                  <Row label="3D parallax / tilt" hint="Mouse-follow card tilt (desktop)">
                    <Toggle label="3D parallax tilt" checked={settings.parallaxTilt} onChange={(v) => set("parallaxTilt", v)} />
                  </Row>
                  <Row label="Density">
                    <Segmented<Density>
                      value={settings.density}
                      onChange={(v) => set("density", v)}
                      options={[{ v: "comfortable", label: "Comfortable" }, { v: "compact", label: "Compact" }]}
                    />
                  </Row>
                </Section>

                <Section title="Profile">
                  <Row label="Display name">
                    <input value={settings.displayName} onChange={(e) => set("displayName", e.target.value)} maxLength={32}
                      className="w-40 rounded-lg border border-line bg-black/30 px-2 py-1.5 text-xs" />
                  </Row>
                  <Row label="Export trade journal" hint="Download your trades">
                    <div className="flex gap-2">
                      <button type="button" onClick={() => doExport("csv")} className="btn text-[11px]">CSV</button>
                      <button type="button" onClick={() => doExport("json")} className="btn text-[11px]">JSON</button>
                    </div>
                  </Row>
                  <Row label="Reset practice stats" hint="Clears trades, decisions & quizzes">
                    {confirmReset ? (
                      <div className="flex items-center gap-2">
                        <button type="button" disabled={busy} onClick={doResetStats} className="btn border-loss/50 text-[11px] text-loss">{busy ? "…" : "Confirm"}</button>
                        <button type="button" onClick={() => setConfirmReset(false)} className="btn text-[11px]">Cancel</button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setConfirmReset(true)} className="btn border-loss/40 text-[11px] text-loss">Reset…</button>
                    )}
                  </Row>
                </Section>

                <Section title="Simulation defaults">
                  <Row label="Paper account balance">
                    <input type="number" min={0} step={1000} value={settings.paperBalance}
                      onChange={(e) => set("paperBalance", Math.max(0, Number(e.target.value) || 0))} className={numberInputClass} />
                  </Row>
                  <Row label="Risk per trade %">
                    <input type="number" min={0} max={100} step={0.25} value={settings.riskPerTradePct}
                      onChange={(e) => set("riskPerTradePct", Math.max(0, Number(e.target.value) || 0))} className={numberInputClass} />
                  </Row>
                  <Row label="Max daily loss (R)" hint="Hard stop">
                    <input type="number" min={0} step={0.5} value={settings.maxDailyLossR}
                      onChange={(e) => set("maxDailyLossR", Math.max(0, Number(e.target.value) || 0))} className={numberInputClass} />
                  </Row>
                  <Row label="Default instrument">
                    <select value={settings.defaultInstrument} onChange={(e) => set("defaultInstrument", e.target.value as Instrument)} className={selectClass}>
                      <option value="MNQ">MNQ</option>
                      <option value="MGC">MGC</option>
                    </select>
                  </Row>
                  <Row label="Default timeframe">
                    <select value={settings.defaultTimeframe} onChange={(e) => set("defaultTimeframe", e.target.value as Timeframe)} className={selectClass}>
                      {(["1m", "5m", "15m", "30m", "1h"] as Timeframe[]).map((tf) => <option key={tf} value={tf}>{tf}</option>)}
                    </select>
                  </Row>
                  <Row label="Default regime filter">
                    <select value={settings.defaultRegimeFilter} onChange={(e) => set("defaultRegimeFilter", e.target.value as RegimeFilter)} className={selectClass}>
                      <option value="">All regimes</option>
                      <option value="trending">Trending</option>
                      <option value="ranging">Ranging</option>
                      <option value="high_vol">High vol</option>
                      <option value="low_vol">Low vol</option>
                    </select>
                  </Row>
                  <Row label="Replay speed">
                    <select value={settings.replaySpeed} onChange={(e) => set("replaySpeed", Number(e.target.value))} className={selectClass}>
                      {[0.25, 0.5, 1, 2, 4, 8].map((sp) => <option key={sp} value={sp}>{sp}×</option>)}
                    </select>
                  </Row>
                  <Row label="Synthetic data seed">
                    <input type="number" value={settings.seed} onChange={(e) => set("seed", Number(e.target.value) || 0)} className={numberInputClass} />
                  </Row>
                  <Row label="Auto-pause on qualified setups">
                    <Toggle label="Auto-pause" checked={settings.autoPause} onChange={(v) => set("autoPause", v)} />
                  </Row>
                </Section>

                <Section title="Coach">
                  <Row label="AI Coach enabled">
                    <Toggle label="AI Coach enabled" checked={settings.coachEnabled} onChange={(v) => set("coachEnabled", v)} />
                  </Row>
                  <Row label="Trade-count logging" hint="System bubbles for trade count">
                    <Toggle label="Trade-count logging" checked={settings.tradeCountLogging} onChange={(v) => set("tradeCountLogging", v)} />
                  </Row>
                  <Row label="Coach verbosity">
                    <Segmented<Verbosity>
                      value={settings.coachVerbosity}
                      onChange={(v) => set("coachVerbosity", v)}
                      options={[{ v: "concise", label: "Concise" }, { v: "normal", label: "Normal" }, { v: "verbose", label: "Verbose" }]}
                    />
                  </Row>
                </Section>

                <Section title="Discipline">
                  <Row label="Emotional check-ins" hint="Pre-session mood + post-trade feeling">
                    <Toggle label="Emotional check-ins" checked={settings.emotionalCheckins} onChange={(v) => set("emotionalCheckins", v)} />
                  </Row>
                  <Row label="Tilt warning (consecutive losses)" hint="Suggest a break after N losses">
                    <input type="number" min={1} max={20} step={1} value={settings.tiltThresholdLosses}
                      onChange={(e) => set("tiltThresholdLosses", Math.max(1, Math.round(Number(e.target.value) || 3)))} className={numberInputClass} />
                  </Row>
                  <Row label="Cooldown length (minutes)" hint="Suggested step-away timer">
                    <input type="number" min={1} max={60} step={1} value={settings.cooldownMinutes}
                      onChange={(e) => set("cooldownMinutes", Math.max(1, Math.round(Number(e.target.value) || 5)))} className={numberInputClass} />
                  </Row>
                  <Row label="Max daily loss (R)" hint="Hard stop — ends the session">
                    <input type="number" min={0} step={0.5} value={settings.maxDailyLossR}
                      onChange={(e) => set("maxDailyLossR", Math.max(0, Number(e.target.value) || 0))} className={numberInputClass} />
                  </Row>
                  <Row label="Revenge-trade guard" hint="Confirm before a post-tilt entry">
                    <Toggle label="Revenge-trade guard" checked={settings.revengeGuard} onChange={(v) => set("revengeGuard", v)} />
                  </Row>
                </Section>

                <Section title="Learning">
                  <p className="text-[11px] text-muted">Saved now — these activate when their phases ship.</p>
                  <Row label="Confidence prompt before a setup">
                    <Toggle label="Confidence prompt" checked={settings.confidencePrompt} onChange={(v) => set("confidencePrompt", v)} />
                  </Row>
                  <Row label="Decision-pressure timer">
                    <div className="flex items-center gap-2">
                      {settings.decisionTimerEnabled && (
                        <input type="number" min={1} max={120} value={settings.decisionTimerSeconds}
                          onChange={(e) => set("decisionTimerSeconds", Math.max(1, Number(e.target.value) || 1))}
                          className="w-16 rounded-lg border border-line bg-black/30 px-2 py-1.5 text-right font-mono text-xs" aria-label="Timer seconds" />
                      )}
                      <Toggle label="Decision-pressure timer" checked={settings.decisionTimerEnabled} onChange={(v) => set("decisionTimerEnabled", v)} />
                    </div>
                  </Row>
                  <Row label="Daily challenge reminders">
                    <Toggle label="Daily challenge reminders" checked={settings.dailyChallengeReminders} onChange={(v) => set("dailyChallengeReminders", v)} />
                  </Row>
                </Section>
              </div>

              <footer className="flex items-center justify-between gap-3 border-t border-line px-5 py-3">
                <span className="truncate text-[11px] text-muted">{msg || "Settings persist on this device."}</span>
                <button type="button" onClick={resetDefaults} className="btn shrink-0 text-[11px]">Reset to defaults</button>
              </footer>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
