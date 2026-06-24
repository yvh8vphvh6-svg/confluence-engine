"use client";

import { useEffect, useRef, useState } from "react";

import { postCoach, type CoachResponse } from "../../lib/api";
import { useSettings } from "../../lib/settings";
import { useStore } from "../../lib/store";
import { useBestSetup } from "../../lib/useBestSetup";
import { useMediaQuery } from "../../lib/useMediaQuery";

// Context built from the QUALIFIED setup (stable) — the coach only speaks on
// meaningful moments, never every bar. (Unchanged from the old docked panel.)
function buildContext(): Record<string, unknown> {
  const { latestTick: tick } = useStore.getState();
  const name = tick?.qualified_setup ?? null;
  const best = name ? tick!.signals.find((s) => s.name === name) : null;
  const m = tick?.metrics;
  const rr =
    best && best.entry != null && best.stop != null && best.target != null && best.entry !== best.stop
      ? Math.abs(best.target - best.entry) / Math.abs(best.entry - best.stop)
      : null;
  return {
    symbol: tick?.symbol ?? "",
    timeframe: tick?.timeframe ?? "",
    regime: tick?.regime ?? "",
    has_setup: Boolean(best),
    strategy: best?.name ?? null,
    label: best?.label ?? null,
    direction: best?.direction ?? null,
    confidence: best?.confluence?.confidence ?? null,
    threshold: best?.confluence?.threshold ?? null,
    execute: best?.confluence?.execute ?? false,
    missing_factors: best?.confluence?.missing_factors ?? [],
    present_factors: best ? Object.keys(best.factors).filter((k) => best.factors[k]) : [],
    rr,
    regime_expectancy_r: best?.regime_expectancy_r ?? null,
    regime_sample: best?.regime_sample ?? 0,
    recommended: best?.recommended ?? false,
    evidence: best?.evidence ?? "",
    trades_today: m?.trades_today ?? 0,
    consecutive_losses: m?.consecutive_losses ?? 0,
    cooldown_bars_remaining: m?.cooldown_bars_remaining ?? 0,
    daily_stop_active: m?.daily_stop_active ?? false,
    open_position: Boolean(useStore.getState().paperPosition),
  };
}

type ChatMessage =
  | { id: number; role: "user"; text: string }
  | { id: number; role: "system"; text: string }
  | { id: number; role: "coach"; text: string; source: CoachResponse["source"]; flags: string[] };

// Omit that distributes over the union so each variant keeps its own fields.
type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;
type NewMessage = DistributiveOmit<ChatMessage, "id">;

const MAX_MESSAGES = 60;
const DISCLAIMER =
  "Practice / simulation on synthetic data. Signals are not guarantees — not financial advice.";

export default function CoachWidget() {
  const best = useBestSetup();
  const paperPosition = useStore((s) => s.paperPosition);
  const metrics = useStore((s) => s.latestTick?.metrics);
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const coachEnabled = useSettings((s) => s.settings.coachEnabled);
  const tradeCountLogging = useSettings((s) => s.settings.tradeCountLogging);
  const verbosity = useSettings((s) => s.settings.coachVerbosity);

  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false); // in the DOM (for exit animation)
  const [shown, setShown] = useState(false); // transitioned-in
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [question, setQuestion] = useState("");
  const [unread, setUnread] = useState(false);

  const idRef = useRef(0);
  const lastKey = useRef<string>("");
  const prevPos = useRef(paperPosition);
  const lastTrades = useRef<number>(0);
  const prevOpen = useRef(false);
  const openRef = useRef(open);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const fabRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  openRef.current = open;

  const add = (msg: NewMessage) =>
    setMessages((prev) => {
      const next: ChatMessage[] = [...prev, { ...msg, id: idRef.current++ } as ChatMessage];
      return next.length > MAX_MESSAGES ? next.slice(next.length - MAX_MESSAGES) : next;
    });

  const fetchCoach = (q?: string) => {
    if (!coachEnabled) return () => undefined; // disabled in Settings → no network
    const ctrl = new AbortController();
    setLoading(true);
    postCoach({ context: { ...buildContext(), verbosity }, ...(q ? { question: q } : {}) }, ctrl.signal)
      .then((r) => {
        add({ role: "coach", text: r.text, source: r.source, flags: r.discipline_flags });
        if (!openRef.current) setUnread(true);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  };

  // (1) coach on a new QUALIFIED setup (fires on teach moments, not per bar)
  useEffect(() => {
    const key = best?.name ?? "none";
    if (key === lastKey.current) return;
    lastKey.current = key;
    return fetchCoach();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [best?.name]);

  // (2) coach on YOUR own trade open / close
  useEffect(() => {
    const prev = prevPos.current;
    prevPos.current = paperPosition;
    if (!prev && paperPosition) {
      add({ role: "system", text: `Opened ${paperPosition.direction} ${paperPosition.label}.` });
      fetchCoach(`I just opened a ${paperPosition.direction} ${paperPosition.label} paper trade — one-line risk check.`);
    } else if (prev && !paperPosition) {
      const t = useStore.getState().paperTrades.at(-1);
      if (t) {
        add({ role: "system", text: `Closed a paper trade: ${t.r_multiple}R (${t.exit_reason}).` });
        fetchCoach(`I just closed a paper trade: ${t.r_multiple}R, exit "${t.exit_reason}". One-line reflection.`);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paperPosition]);

  // (3) preserve trade-count logging, surfaced as a lightweight system bubble
  useEffect(() => {
    const n = metrics?.trades_today ?? 0;
    if (n === lastTrades.current) return;
    lastTrades.current = n;
    if (n > 0 && tradeCountLogging) {
      add({
        role: "system",
        text: n >= 5 ? `You've logged ${n} trades today — watch overtrading.` : `You've logged ${n} trade${n === 1 ? "" : "s"} today.`,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metrics?.trades_today, tradeCountLogging]);

  // always-current risk banner (no LLM call), minus the trade-count (now a bubble)
  const riskFlags: string[] = [];
  if (metrics) {
    if (metrics.daily_stop_active) riskFlags.push("−2R daily stop hit — done for the day");
    if (metrics.cooldown_bars_remaining > 0) riskFlags.push(`cooldown ${metrics.cooldown_bars_remaining} bars`);
    if (metrics.consecutive_losses >= 2) riskFlags.push(`${metrics.consecutive_losses} losses in a row`);
  }

  // open/close enter-leave animation lifecycle
  useEffect(() => {
    if (open) {
      setMounted(true);
      setUnread(false);
      const raf = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(raf);
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), 200);
    return () => clearTimeout(t);
  }, [open]);

  // focus management: focus into the panel on open, restore to FAB on close
  useEffect(() => {
    if (open && panelRef.current) {
      panelRef.current.querySelector<HTMLElement>("textarea, button")?.focus();
    } else if (prevOpen.current && !open) {
      fabRef.current?.focus();
    }
    prevOpen.current = open;
  }, [open, mounted]);

  // focus trap + Escape while open
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
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

  // outside-tap closes (desktop has no scrim)
  useEffect(() => {
    if (!open || !isDesktop) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || fabRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, isDesktop]);

  // auto-scroll to newest
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading, mounted]);

  const submit = () => {
    const q = question.trim();
    if (!q || loading) return;
    setQuestion("");
    add({ role: "user", text: q });
    fetchCoach(q);
  };

  const onInputKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  // AI Coach disabled in Settings → no FAB, no fetching
  if (!coachEnabled) return null;

  const panelBase =
    "fixed z-50 flex flex-col overflow-hidden border border-line glass-surface shadow-2xl shadow-black/50 transition duration-200 ease-out motion-reduce:transform-none before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:z-10 before:h-px before:bg-gradient-to-r before:from-transparent before:via-accent/70 before:to-transparent";
  const panelClasses = isDesktop
    ? `${panelBase} right-[max(1rem,env(safe-area-inset-right))] bottom-[calc(max(1rem,env(safe-area-inset-bottom))+4.25rem)] w-[360px] max-h-[70vh] origin-bottom-right rounded-2xl ${shown ? "scale-100 opacity-100" : "scale-95 opacity-0"}`
    : `${panelBase} inset-x-0 bottom-0 h-[75vh] rounded-t-2xl border-x-0 border-b-0 pb-[env(safe-area-inset-bottom)] ${shown ? "translate-y-0 opacity-100" : "translate-y-full opacity-0"}`;

  return (
    <>
      <button
        ref={fabRef}
        type="button"
        aria-label={open ? "Close coach chat" : "Open coach chat"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] z-50 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-lg shadow-black/40 transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        data-tour="coach"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
        {unread && !open && (
          <span className="absolute right-0 top-0 h-3.5 w-3.5 rounded-full bg-neon ring-2 ring-background" aria-hidden="true" />
        )}
      </button>

      {mounted && (
        <>
          {!isDesktop && (
            <div
              onClick={() => setOpen(false)}
              aria-hidden="true"
              className={`fixed inset-0 z-40 bg-black/60 transition-opacity duration-200 ${shown ? "opacity-100" : "opacity-0"}`}
            />
          )}

          <div ref={panelRef} role="dialog" aria-modal="true" aria-label="Trading coach chat" className={panelClasses}>
            <header className="flex items-center justify-between border-b border-line px-4 py-2.5">
              <p className="panel-head">Coach</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close coach chat"
                className="rounded-md p-1 text-muted transition hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </header>

            {riskFlags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 border-b border-line px-4 py-2">
                {riskFlags.map((f) => (
                  <span key={f} className="chip border-loss/40 text-loss">{f}</span>
                ))}
              </div>
            )}

            <div ref={listRef} className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-3">
              {messages.length === 0 && !loading && (
                <p className="m-auto max-w-[85%] text-center text-xs text-muted">
                  The coach speaks up on qualified setups and your own trades — not every bar. Ask it anything below.
                </p>
              )}
              {messages.map((m) => {
                if (m.role === "user") {
                  return (
                    <div key={m.id} className="max-w-[85%] self-end rounded-2xl rounded-br-sm bg-accent px-3 py-2 text-sm text-white">
                      {m.text}
                    </div>
                  );
                }
                if (m.role === "system") {
                  return (
                    <div key={m.id} className="max-w-[90%] self-start rounded-full border border-line/60 bg-black/30 px-3 py-1 text-[11px] text-muted">
                      {m.text}
                    </div>
                  );
                }
                return (
                  <div key={m.id} className="max-w-[85%] self-start rounded-2xl rounded-bl-sm border border-line bg-black/20 px-3 py-2">
                    <div className="mb-1 flex items-center gap-2">
                      <span className={`chip ${m.source === "claude" ? "border-accent/50 text-accent" : "border-line text-muted"}`}>
                        {m.source === "claude" ? "Claude" : "rule-based"}
                      </span>
                    </div>
                    <p className="text-sm leading-6 text-text">{m.text}</p>
                    {m.flags.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {m.flags.map((f) => (
                          <li key={f} className="rounded border border-warn/30 bg-warn/5 px-2 py-1 text-[11px] text-warn">{f}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
              {loading && (
                <div className="max-w-[85%] self-start rounded-2xl rounded-bl-sm border border-line bg-black/20 px-3 py-2 text-sm text-muted">
                  Thinking…
                </div>
              )}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
              className="border-t border-line p-3"
            >
              <div className="flex items-end gap-2">
                <textarea
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={onInputKey}
                  rows={1}
                  placeholder="Ask the coach…  (Enter to send, Shift+Enter for newline)"
                  className="max-h-24 min-h-[40px] flex-1 resize-none rounded-lg border border-line bg-black/30 px-3 py-2 text-xs"
                />
                <button
                  type="submit"
                  disabled={loading || !question.trim()}
                  className="btn shrink-0 self-stretch"
                >
                  Send
                </button>
              </div>
              <p className="mt-2 text-[10px] text-muted">{DISCLAIMER}</p>
            </form>
          </div>
        </>
      )}
    </>
  );
}
