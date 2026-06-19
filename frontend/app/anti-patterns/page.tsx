"use client";

import dynamic from "next/dynamic";

import { ANTI_PATTERNS } from "../../lib/antipatterns";

const FvgDiagram = dynamic(() => import("../../components/education/Diagrams").then((m) => m.FvgDiagram), { ssr: false });
const OrderBlockDiagram = dynamic(() => import("../../components/education/Diagrams").then((m) => m.OrderBlockDiagram), { ssr: false });
const OpeningRangeDiagram = dynamic(() => import("../../components/education/Diagrams").then((m) => m.OpeningRangeDiagram), { ssr: false });
const BosDiagram = dynamic(() => import("../../components/education/Diagrams").then((m) => m.BosDiagram), { ssr: false });

function Diagram({ kind }: { kind?: string }) {
  if (kind === "fvg") return <FvgDiagram />;
  if (kind === "ob") return <OrderBlockDiagram />;
  if (kind === "orb") return <OpeningRangeDiagram />;
  if (kind === "bos") return <BosDiagram />;
  return null;
}

export default function AntiPatternsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-text">Anti-Patterns — what NOT to do</h1>
        <p className="text-sm text-muted">
          The traps that look like opportunities. For each: what it looks like, why it&apos;s tempting, why it
          fails, how to spot it, and what to do instead. Education only, not financial advice.
        </p>
      </header>

      <div className="space-y-3">
        {ANTI_PATTERNS.map((a) => (
          <div key={a.name} className="panel p-4">
            <h2 className="text-base font-semibold text-loss">{a.name}</h2>
            <div className="mt-2 grid gap-3 md:grid-cols-2">
              <div className="space-y-2 text-sm">
                <Row label="Looks like" tone="text-text" v={a.looksLike} />
                <Row label="Why it's tempting" tone="text-warn" v={a.tempting} />
                <Row label="Why it fails" tone="text-loss" v={a.whyItFails} />
                <Row label="How to spot it" tone="text-neon" v={a.howToSpot} />
                <Row label="Do this instead" tone="text-profit" v={a.insteadDo} />
              </div>
              {a.diagram && (
                <div className="rounded-lg border border-line bg-black/20 p-2">
                  <Diagram kind={a.diagram} />
                  <p className="mt-1 text-center text-[10px] text-muted">Illustrative pattern (synthetic)</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Row({ label, v, tone }: { label: string; v: string; tone: string }) {
  return (
    <p className="text-muted">
      <span className={`font-medium ${tone}`}>{label}:</span> {v}
    </p>
  );
}
