"use client";

import { useEffect, useState } from "react";

import {
  FvgDiagram, OrderBlockDiagram, OpeningRangeDiagram, BosDiagram,
} from "../../components/education/Diagrams";
import RegimeMatrix from "../../components/RegimeMatrix";
import { getStrategies, type StrategyInfo } from "../../lib/api";
import { STRATEGY_DOCS, type StrategyDoc } from "../../lib/strategyLibrary";
import { fmt, pct, signColor, REGIME_LABEL } from "../../lib/format";

function Diagram({ kind }: { kind?: StrategyDoc["diagram"] }) {
  if (kind === "fvg") return <FvgDiagram />;
  if (kind === "ob") return <OrderBlockDiagram />;
  if (kind === "orb") return <OpeningRangeDiagram />;
  if (kind === "bos") return <BosDiagram />;
  return null;
}

export default function StrategiesPage() {
  const [strategies, setStrategies] = useState<StrategyInfo[]>([]);
  const [ready, setReady] = useState(true);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const load = async () => {
      try {
        const data = await getStrategies(ctrl.signal);
        setReady(data.ready);
        setStrategies(data.strategies);
        if (!data.ready) timer = setTimeout(load, 4000);
      } catch (e) {
        if (!ctrl.signal.aborted) setErr(e instanceof Error ? e.message : "failed to load");
      }
    };
    void load();
    return () => {
      ctrl.abort();
      if (timer) clearTimeout(timer);
    };
  }, []);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text">The eight strategies</h1>
          <p className="text-sm text-muted">
            Family, best regime, recommended timeframes, the full playbook, and real current stats from the backtest sweep.
          </p>
        </div>
        {!ready && <span className="chip border-warn/40 text-warn">computing backtests…</span>}
      </header>
      {err && <p className="text-xs text-loss">{err}</p>}

      <RegimeMatrix />

      <div className="grid gap-4 lg:grid-cols-2">
        {strategies.map((s) => {
          const doc = STRATEGY_DOCS[s.name];
          const isOpen = open === s.name;
          return (
            <div key={s.name} className="panel p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold text-text">{s.label}</h2>
                  <p className="text-[11px] uppercase tracking-wider text-muted">{s.name}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="chip border-accent/40 text-accent">{s.family}</span>
                  <span className="chip border-line text-muted">best: {REGIME_LABEL[s.best_regime] ?? s.best_regime}</span>
                </div>
              </div>
              <p className="mt-2 text-xs text-muted">{s.description}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {s.recommended_timeframes.map((tf) => (
                  <span key={tf} className="chip border-line text-muted">{tf}</span>
                ))}
                {s.indicators_used.map((ind) => (
                  <span key={ind} className="chip border-line text-muted">{ind}</span>
                ))}
              </div>

              <div className="mt-3 overflow-hidden rounded-lg border border-line">
                <table className="w-full text-right text-[11px]">
                  <thead className="bg-black/20 text-[9px] uppercase tracking-wider text-muted">
                    <tr>
                      <th className="px-2 py-1 text-left">Run</th>
                      <th className="px-2 py-1">Exp R</th>
                      <th className="px-2 py-1">Win</th>
                      <th className="px-2 py-1">PF</th>
                      <th className="px-2 py-1">n</th>
                      <th className="px-2 py-1">Gate</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {s.runs.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-2 py-2 text-center text-muted">no runs yet</td>
                      </tr>
                    )}
                    {s.runs.map((r) => (
                      <tr key={`${r.symbol}-${r.timeframe}`} className="border-t border-line/60">
                        <td className="px-2 py-1 text-left text-text">{r.symbol} {r.timeframe}</td>
                        <td className={`px-2 py-1 ${signColor(r.expectancy_r)}`}>{fmt(r.expectancy_r)}</td>
                        <td className="px-2 py-1">{r.sufficient_sample ? pct(r.win_rate) : "—"}</td>
                        <td className={`px-2 py-1 ${(r.profit_factor ?? 0) > 1 ? "text-profit" : "text-loss"}`}>{fmt(r.profit_factor)}</td>
                        <td className={`px-2 py-1 ${r.sufficient_sample ? "text-text" : "text-warn"}`}>{r.n_trades}</td>
                        <td className="px-2 py-1">
                          {r.sufficient_sample ? (
                            <span className={`chip ${r.promote ? "border-profit/40 text-profit" : "border-loss/40 text-loss"}`}>
                              {r.promote ? "pass" : "hold"}
                            </span>
                          ) : (
                            <span className="chip border-warn/40 text-warn">n&lt;100</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[10px] text-muted">
                {s.total_trades > 0 ? `${s.total_trades} backtested trades across all runs.` : "Awaiting backtest."}
              </p>

              {doc && (
                <>
                  <button
                    onClick={() => setOpen(isOpen ? null : s.name)}
                    className="mt-3 w-full rounded-lg border border-line bg-black/20 px-3 py-1.5 text-xs font-semibold text-text hover:border-neon/40"
                  >
                    {isOpen ? "Hide playbook ▲" : "Full playbook ▼"}
                  </button>
                  {isOpen && <Playbook doc={doc} />}
                </>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-center text-[11px] text-warn">
        Playbooks are educational. Diagrams are hand-built illustrations, not market data. Simulation only — not financial advice.
      </p>
    </div>
  );
}

function Playbook({ doc }: { doc: StrategyDoc }) {
  return (
    <div className="mt-3 space-y-3 rounded-lg border border-line bg-black/20 p-3 text-xs">
      {doc.diagram && (
        <div className="overflow-hidden rounded-lg border border-line">
          <Diagram kind={doc.diagram} />
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <List title="Works best when" items={doc.works} tone="profit" />
        <List title="Fails when" items={doc.fails} tone="loss" />
      </div>

      <div>
        <p className="panel-head mb-1">Entry — step by step</p>
        <ol className="ml-4 list-decimal space-y-0.5 text-text">
          {doc.entrySteps.map((e, i) => <li key={i}>{e}</li>)}
        </ol>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Field k="Stop logic" v={doc.stopLogic} />
        <Field k="Targets" v={doc.targets} />
        <Field k="R:R" v={doc.rr} />
        <Field k="Timeframes" v={doc.timeframes} />
        <Field k="Time of day" v={doc.timeOfDay} />
      </div>

      <div className="rounded-lg border border-profit/30 bg-profit/5 p-2">
        <p className="text-[9px] uppercase tracking-wider text-profit">Annotated win</p>
        <p className="mt-0.5 text-text">{doc.winExample}</p>
      </div>
      <div className="rounded-lg border border-loss/30 bg-loss/5 p-2">
        <p className="text-[9px] uppercase tracking-wider text-loss">Annotated failure</p>
        <p className="mt-0.5 text-text">{doc.failExample}</p>
      </div>

      <List title="Common mistakes" items={doc.commonMistakes} tone="warn" />
      <List title="Variations" items={doc.variations} tone="muted" />
    </div>
  );
}

function List({ title, items, tone }: { title: string; items: string[]; tone: "profit" | "loss" | "warn" | "muted" }) {
  const color = tone === "profit" ? "text-profit" : tone === "loss" ? "text-loss" : tone === "warn" ? "text-warn" : "text-muted";
  return (
    <div>
      <p className={`text-[9px] uppercase tracking-wider ${color}`}>{title}</p>
      <ul className="mt-0.5 space-y-0.5 text-text">
        {items.map((it, i) => <li key={i}>• {it}</li>)}
      </ul>
    </div>
  );
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg border border-line bg-black/20 px-2 py-1.5">
      <p className="text-[9px] uppercase tracking-wider text-muted">{k}</p>
      <p className="mt-0.5 text-text">{v}</p>
    </div>
  );
}
