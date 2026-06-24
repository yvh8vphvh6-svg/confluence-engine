// Pure, deterministic trade-quality + "why it won/lost" computations. Every
// number is derived from real trade data — never random. Kept store-free (takes
// plain inputs) so it has no import cycle with the Zustand store.

export type WonLostFactor = { label: string; score: number; note: string };

export type QualityScores = {
  setup: number;
  risk: number;
  execution: number;
  outcome: number;
  total: number;
  reasons: { setup: string; risk: string; execution: string; outcome: string };
  summary: string;
};

// Context captured at ENTRY so close-time scoring is honest (uses the values
// that were true when the trade was taken).
export type EntryCtx = {
  confluence: number; // 0..1 (sum of weighted factors at entry)
  threshold: number; // 0..1
  factorsPresent: number;
  factorsTotal: number;
  favorableRegime: string;
  regime: string;
  timingOk: boolean;
  entryZoneOk: boolean;
  riskPct: number; // configured risk-per-trade % at entry
  balanceAtEntry: number;
};

export type Prediction = {
  dir: "long" | "short" | "skip";
  confidence: number | null;
  decisionMs: number | null;
  correct: boolean | null;
  rationale: string;
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const pctInt = (v: number) => Math.round(v * 100);

export type QualityInput = {
  entryCtx: EntryCtx | null;
  entry: number;
  stop: number;
  target: number;
  exit: number;
  exitReason: string;
  contracts: number;
  pointValue: number;
  rMultiple: number;
};

export function computeQuality(i: QualityInput): QualityScores {
  const ctx = i.entryCtx;
  const conf = ctx ? ctx.confluence : 0.6;
  const threshold = ctx ? ctx.threshold : 0.65;

  // 1) Setup confluence — score vs the threshold that was active at entry
  const setup = clamp(Math.round(conf * 10), 0, 10);
  const setupReason = ctx
    ? `confluence ${pctInt(conf)} vs threshold ${pctInt(threshold)} (${ctx.factorsPresent}/${ctx.factorsTotal} factors)`
    : "manual entry — no setup grade";

  // 2) Risk — was position size within the configured risk %?
  const riskPerContract = Math.abs(i.entry - i.stop) * i.pointValue;
  const dollarRisk = riskPerContract * i.contracts;
  const riskPct = ctx?.riskPct ?? 1;
  const configured = (riskPct / 100) * (ctx?.balanceAtEntry ?? 50_000);
  const ratio = configured > 0 ? dollarRisk / configured : 1;
  const risk = clamp(Math.round(10 - Math.max(0, ratio - 1) * 6), 0, 10);
  const stopHonored = i.exitReason !== "manual";
  const riskReason =
    ratio <= 1.1
      ? `sized within your ${riskPct}% risk${stopHonored ? ", stop honored" : ""}`
      : `sized ~${ratio.toFixed(1)}x your ${riskPct}% risk`;

  // 3) Execution — entered in zone? held to target/stop vs exited early?
  const held = i.exitReason === "target" || i.exitReason === "stop";
  const zoneOk = ctx?.entryZoneOk ?? true;
  const execution = clamp((zoneOk ? 6 : 3) + (held ? 4 : 0), 0, 10);
  const execReason = `${zoneOk ? "entered in zone" : "entry off-zone"}, ${held ? `held to ${i.exitReason}` : "exited manually (early)"}`;

  // 4) Outcome — what actually happened
  const outcome =
    i.exitReason === "target" ? 10 : i.exitReason === "stop" ? 3 : clamp(Math.round(5 + i.rMultiple * 2), 0, 10);
  const outcomeReason =
    i.exitReason === "target"
      ? `hit target (+${i.rMultiple.toFixed(2)}R)`
      : i.exitReason === "stop"
        ? `hit stop (${i.rMultiple.toFixed(2)}R)`
        : `manual exit (${i.rMultiple.toFixed(2)}R)`;

  const total = Math.round(((setup + risk + execution + outcome) / 4) * 10) / 10;

  // headline emphasises the weakest controllable dimension
  const controllables: { v: number; r: string }[] = [
    { v: setup, r: setupReason },
    { v: risk, r: riskReason },
    { v: execution, r: execReason },
  ];
  const weakest = controllables.reduce((a, b) => (b.v < a.v ? b : a));
  const summary =
    weakest.v >= 7
      ? `Trade quality ${total}/10 — clean process: ${setupReason}.`
      : `Trade quality ${total}/10 — ${weakest.r}.`;

  return {
    setup,
    risk,
    execution,
    outcome,
    total,
    reasons: { setup: setupReason, risk: riskReason, execution: execReason, outcome: outcomeReason },
    summary,
  };
}

// "Why it won / lost" — a LABELED educational heuristic (not a measurement).
export function computeWonLostFactors(ctx: EntryCtx | null): WonLostFactor[] {
  const conf = ctx ? ctx.confluence : 0.6;
  const regimeMatch = ctx ? ctx.regime === ctx.favorableRegime : false;
  const timingOk = ctx?.timingOk ?? false;

  const factors: WonLostFactor[] = [
    { label: "Setup quality", score: clamp(conf, 0, 1), note: `confluence ${pctInt(conf)}% at entry` },
    {
      label: "Regime alignment",
      score: regimeMatch ? 0.9 : 0.4,
      note: ctx
        ? regimeMatch
          ? `${ctx.regime} matched the strategy's favorable regime`
          : `${ctx.regime} vs favorable ${ctx.favorableRegime}`
        : "regime context unavailable",
    },
    {
      label: "Timing",
      score: timingOk ? 0.9 : 0.45,
      note: timingOk ? "entry inside the timing / OTE zone" : "entry outside the ideal timing window",
    },
  ];
  const controllable = factors.reduce((a, f) => a + f.score, 0) / factors.length;
  factors.push({
    label: "Variance",
    score: clamp(1 - controllable, 0, 1),
    note: "the rest is variance you don't control",
  });
  return factors;
}
