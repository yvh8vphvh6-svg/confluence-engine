import type { Condition } from "../lib/api";

export default function ConditionsChecklist({ conditions }: { conditions: Condition[] }) {
  const passed = conditions.filter((c) => c.ok).length;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="panel-head">Conditions met</p>
        <span className={`chip ${passed === conditions.length ? "border-profit/50 text-profit" : "border-warn/40 text-warn"}`}>
          {passed}/{conditions.length}
        </span>
      </div>
      <ul className="space-y-1.5">
        {conditions.map((c) => (
          <li key={c.key} className="flex items-center justify-between rounded-lg border border-line bg-black/20 px-3 py-1.5 text-xs">
            <span className="flex items-center gap-2">
              <span className={`font-mono ${c.ok ? "text-profit" : "text-loss"}`}>{c.ok ? "✓" : "✗"}</span>
              <span className={c.ok ? "text-text" : "text-muted"}>{c.label}</span>
            </span>
            <span className="text-[10px] text-muted">{c.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
