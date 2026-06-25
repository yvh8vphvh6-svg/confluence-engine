"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { getStrategyExamples, type StrategyExample, type StrategyExamples } from "../../lib/api";
import { annotationsFromSetup, STRATEGY_LOOK } from "../../lib/annotations";
import { REGIME_LABEL } from "../../lib/format";

const AnnotatedChart = dynamic(() => import("../../components/AnnotatedChart"), { ssr: false });

function ExampleCard({ ex }: { ex: StrategyExample }) {
  const last = ex.candles[ex.candles.length - 1];
  const annotations = annotationsFromSetup(
    ex.overlays,
    { ...ex.signal, regime: ex.regime },
    last ? last.time : 0,
  );
  return (
    <div className="panel p-4">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <p className="font-display text-sm font-semibold text-text">{ex.label}</p>
        <span className="chip border-line text-muted">{ex.symbol} · {ex.timeframe} · {REGIME_LABEL[ex.regime] ?? ex.regime}</span>
      </div>
      <p className="mb-2 text-xs text-text">{STRATEGY_LOOK[ex.strategy] ?? "What to look for: the setup's structure on the chart below."}</p>
      <AnnotatedChart candles={ex.candles} annotations={annotations} height={260} caption="A real generated setup where this strategy's confluence fired — synthetic data, for learning." />
    </div>
  );
}

export default function PlaybookPage() {
  const [data, setData] = useState<StrategyExamples | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    const ctrl = new AbortController();
    getStrategyExamples(ctrl.signal)
      .then(setData)
      .catch((e) => !ctrl.signal.aborted && setErr(e instanceof Error ? e.message : "failed to load"));
    return () => ctrl.abort();
  }, []);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header>
        <h1 className="font-display text-xl font-semibold text-text">Annotated Playbook</h1>
        <p className="text-sm text-muted">What each strategy looks like — marked up on a real generated setup. Learn the shape, then spot it live.</p>
      </header>

      {err && <p className="panel border-loss/40 p-4 text-xs text-loss">{err}</p>}
      {!err && !data && <p className="panel p-6 text-center text-sm text-muted">Building annotated examples from real setups…</p>}

      {data && (
        <div className="space-y-4">
          {data.strategies.map((name) => {
            const ex = data.examples[name];
            if (ex) return <ExampleCard key={name} ex={ex} />;
            return (
              <div key={name} className="panel p-4">
                <p className="font-display text-sm font-semibold text-text">{name}</p>
                <p className="mt-1 text-xs text-muted">No clean example surfaced in this batch — reload to scan fresh data. (We don&apos;t invent a setup that didn&apos;t genuinely qualify.)</p>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-[10px] text-muted">Every mark is derived from the engine&apos;s real confluence evaluation for that window — not hand-drawn. Synthetic data; not financial advice.</p>
    </div>
  );
}
