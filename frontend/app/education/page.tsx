import {
  REALITY_CHECK,
  STRATEGY_FAMILIES,
  PRICE_ACTION_CONCEPTS,
  VALIDATION_STEPS,
} from "../../lib/education";
import {
  FvgDiagram,
  OrderBlockDiagram,
  OpeningRangeDiagram,
  BosDiagram,
  EquityCurveDiagram,
  WinRateExpectancyDiagram,
} from "../../components/education/Diagrams";

const DIAGRAMS = [
  { title: "Fair Value Gap (FVG)", body: "A 3-candle imbalance; price often retraces into the gap before continuing. Limit entry at the gap edge.", chart: <FvgDiagram /> },
  { title: "Order Block (OB)", body: "The last opposing candle before an impulsive move; price often mitigates (revisits) it before continuing.", chart: <OrderBlockDiagram /> },
  { title: "Opening Range Breakout", body: "Define the first minutes' high/low, then trade the break in the direction of the drive.", chart: <OpeningRangeDiagram /> },
  { title: "Break of Structure (BOS)", body: "Price takes out a confirmed prior swing, signalling continuation; enter the pullback.", chart: <BosDiagram /> },
];

export default function EducationPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-text">Education</h1>
        <p className="text-sm text-muted">
          The reference behind the engine — so the tool teaches something true, not just something that
          looks good on a chart.
        </p>
      </header>

      <div className="panel border-loss/30 p-5">
        <p className="panel-head mb-2 text-loss">{REALITY_CHECK.title}</p>
        <div className="space-y-3">
          {REALITY_CHECK.body.map((p, i) => (
            <p key={i} className="text-sm text-text">
              {p}
            </p>
          ))}
        </div>
      </div>

      <div className="panel p-5">
        <p className="panel-head mb-3">Strategy families &amp; what they&apos;re for</p>
        <div className="space-y-3">
          {STRATEGY_FAMILIES.map((f) => (
            <div key={f.name} className="rounded-lg border border-line bg-black/20 p-3">
              <p className="text-sm font-medium text-neon">{f.name}</p>
              <p className="mt-1 text-xs text-muted">{f.body}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="panel p-5">
        <p className="panel-head mb-3">Worked examples (illustrative charts)</p>
        <div className="grid gap-4 md:grid-cols-2">
          {DIAGRAMS.map((d) => (
            <div key={d.title} className="rounded-lg border border-line bg-black/20 p-3">
              <p className="text-sm font-medium text-neon">{d.title}</p>
              <p className="mb-2 mt-1 text-xs text-muted">{d.body}</p>
              {d.chart}
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-line bg-black/20 p-3">
            <p className="text-sm font-medium text-text">Example equity curve (R)</p>
            <p className="mb-2 mt-1 text-xs text-muted">A positive-expectancy curve still has drawdowns — survive them with 1% risk.</p>
            <EquityCurveDiagram />
          </div>
          <div className="rounded-lg border border-line bg-black/20 p-3">
            <p className="text-sm font-medium text-text">Win rate vs. expectancy</p>
            <p className="mb-2 mt-1 text-xs text-muted">High win rate can still be negative expectancy (red). Expectancy is what pays.</p>
            <WinRateExpectancyDiagram />
          </div>
        </div>
      </div>

      <div className="panel p-5">
        <p className="panel-head mb-3">Price action &amp; liquidity</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {PRICE_ACTION_CONCEPTS.map((c) => (
            <div key={c.name} className="rounded-lg border border-line bg-black/20 p-3">
              <p className="text-sm font-medium text-text">{c.name}</p>
              <p className="mt-1 text-xs text-muted">{c.body}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="panel p-5">
        <p className="panel-head mb-3">How to actually validate a strategy</p>
        <ol className="space-y-2">
          {VALIDATION_STEPS.map((s, i) => (
            <li key={s.step} className="flex gap-3 rounded-lg border border-line bg-black/20 p-3">
              <span className="font-mono text-sm text-neon">{i + 1}</span>
              <div>
                <p className="text-sm font-medium text-text">{s.step}</p>
                <p className="text-xs text-muted">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
