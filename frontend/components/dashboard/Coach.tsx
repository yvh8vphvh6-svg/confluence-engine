"use client";

import { useEffect, useRef, useState } from "react";

import { postCoach, type CoachResponse } from "../../lib/api";
import { useStore } from "../../lib/store";
import { useBestSetup } from "../../lib/useBestSetup";

// context built from the QUALIFIED setup (stable) — the coach only speaks on
// meaningful moments, never every bar.
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

export default function Coach() {
  const best = useBestSetup();
  const paperPosition = useStore((s) => s.paperPosition);
  const metrics = useStore((s) => s.latestTick?.metrics);
  const [resp, setResp] = useState<CoachResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [question, setQuestion] = useState("");
  const lastKey = useRef<string>("");
  const prevPos = useRef(paperPosition);

  const fetchCoach = (q?: string) => {
    const ctrl = new AbortController();
    setLoading(true);
    postCoach({ context: buildContext(), ...(q ? { question: q } : {}) }, ctrl.signal)
      .then(setResp)
      .catch(() => undefined)
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  };

  // (1) coach on a new QUALIFIED setup (stable; fires on teach moments, not per bar)
  useEffect(() => {
    const key = best?.name ?? "none";
    if (key === lastKey.current) return;
    lastKey.current = key;
    return fetchCoach();
  }, [best?.name]);

  // (2) coach on YOUR own trade open / close
  useEffect(() => {
    const prev = prevPos.current;
    prevPos.current = paperPosition;
    if (!prev && paperPosition) {
      fetchCoach(`I just opened a ${paperPosition.direction} ${paperPosition.label} paper trade — one-line risk check.`);
    } else if (prev && !paperPosition) {
      const t = useStore.getState().paperTrades.at(-1);
      if (t) fetchCoach(`I just closed a paper trade: ${t.r_multiple}R, exit "${t.exit_reason}". One-line reflection.`);
    }
  }, [paperPosition]);

  const ask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    const q = question;
    setQuestion("");
    fetchCoach(q);
  };

  // cheap, always-current risk banner (no LLM call) so risk is visible continuously
  const riskFlags: string[] = [];
  if (metrics) {
    if (metrics.daily_stop_active) riskFlags.push("−2R daily stop hit — done for the day");
    if (metrics.cooldown_bars_remaining > 0) riskFlags.push(`cooldown ${metrics.cooldown_bars_remaining} bars`);
    if (metrics.consecutive_losses >= 2) riskFlags.push(`${metrics.consecutive_losses} losses in a row`);
    if (metrics.trades_today >= 5) riskFlags.push(`${metrics.trades_today} trades today — watch overtrading`);
  }

  return (
    <div className="panel p-4" data-tour="coach">
      <div className="mb-2 flex items-center justify-between">
        <p className="panel-head">Coach</p>
        {resp && (
          <span className={`chip ${resp.source === "claude" ? "border-accent/50 text-accent" : "border-line text-muted"}`}>
            {resp.source === "claude" ? "Claude" : "rule-based"}
          </span>
        )}
      </div>

      {riskFlags.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {riskFlags.map((f) => (
            <span key={f} className="chip border-loss/40 text-loss">{f}</span>
          ))}
        </div>
      )}

      <p className="min-h-[60px] text-sm leading-6 text-text">
        {loading ? "Thinking…" : resp?.text ?? "The coach speaks up on qualified setups and your own trades — not every bar."}
      </p>

      {resp && resp.discipline_flags.length > 0 && (
        <ul className="mt-2 space-y-1">
          {resp.discipline_flags.map((f) => (
            <li key={f} className="rounded border border-warn/30 bg-warn/5 px-2 py-1 text-[11px] text-warn">{f}</li>
          ))}
        </ul>
      )}

      <form onSubmit={ask} className="mt-3 flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask the coach…"
          className="flex-1 rounded-lg border border-line bg-black/30 px-3 py-1.5 text-xs"
        />
        <button className="btn" disabled={loading || !question.trim()}>Ask</button>
      </form>

      <p className="mt-2 text-[10px] text-muted">
        {resp?.disclaimer ??
          "Practice / simulation on synthetic data. Signals are not guarantees — not financial advice."}
      </p>
    </div>
  );
}
