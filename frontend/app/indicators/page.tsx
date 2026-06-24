import { INDICATORS, INDICATORS_BOTTOM_LINE, PRICE_ACTION_CONCEPTS } from "../../lib/education";

const VERDICT_STYLE: Record<string, string> = {
  keep: "border-profit/40 text-profit",
  situational: "border-warn/40 text-warn",
  overrated: "border-loss/40 text-loss",
};

export default function IndicatorsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-text">Indicators index</h1>
        <p className="text-sm text-muted">
          What each indicator is for, and whether it earns its place. An indicator can organize
          information; it cannot add information that isn&apos;t already in the price.
        </p>
      </header>

      <div className="panel overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-black/20 text-[10px] uppercase tracking-wider text-muted">
            <tr>
              <th className="px-4 py-2">Indicator</th>
              <th className="px-4 py-2">Job</th>
              <th className="px-4 py-2">Verdict</th>
              <th className="px-4 py-2">Notes</th>
            </tr>
          </thead>
          <tbody>
            {INDICATORS.map((ind) => (
              <tr key={ind.name} className="border-t border-line align-top">
                <td className="px-4 py-3 font-medium text-text">{ind.name}</td>
                <td className="px-4 py-3 text-muted">{ind.job}</td>
                <td className="px-4 py-3">
                  <span className={`chip ${VERDICT_STYLE[ind.verdict]}`}>{ind.verdict}</span>
                </td>
                <td className="px-4 py-3 text-muted">{ind.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel border-neon/30 p-4">
        <p className="panel-head mb-1 text-neon">Bottom line</p>
        <p className="text-sm text-text">{INDICATORS_BOTTOM_LINE}</p>
      </div>

      <div className="panel p-4">
        <p className="panel-head mb-3">Price-action &amp; liquidity primitives the engine computes (causally)</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {PRICE_ACTION_CONCEPTS.map((c) => (
            <div key={c.name} className="rounded-lg border border-line bg-black/20 p-3">
              <p className="text-sm font-medium text-text">{c.name}</p>
              <p className="mt-1 text-xs text-muted">{c.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
