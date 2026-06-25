// Shared annotation model for the teaching layer. ONE builder turns the engine's
// real per-setup confluence data (overlay zones + the qualified signal's levels)
// into chart annotations + plain-language notes — reused by the live teach reveal
// (Part 1) and the glossary playbook examples (Part 2). Nothing here invents
// structure: every annotation is derived from real engine output for that window.

// fixed chart palette (matches the default theme accents; lightweight-charts
// needs concrete colors, same approach as the app's other charts)
const C = {
  profit: "#00E676",
  loss: "#FF1744",
  warn: "#FFD600",
  cyan: "#00CFFF",
  muted: "#8A93A8",
} as const;

export type Annotation =
  | { kind: "zone"; low: number; high: number; color: string; label: string; note: string }
  | { kind: "level"; price: number; color: string; label: string; note: string }
  | {
      kind: "marker";
      time: number;
      position: "aboveBar" | "belowBar";
      shape: "circle" | "arrowUp" | "arrowDown";
      color: string;
      label: string;
      note: string;
    };

export type RawOverlay = { kind: string; direction: string; low: number; high: number; label: string };

export type SetupForAnnotation = {
  name: string;
  label: string;
  direction: string; // "long" | "short" | "flat"
  entry: number | null;
  stop: number | null;
  target: number | null;
  evidence?: string;
  regime?: string;
};

// plain-language "what each structure is" — beginner framing, tied to the mark
const ZONE_NOTE: Record<string, string> = {
  FVG: "Fair value gap — a 3-candle imbalance price tends to come back and fill.",
  OB: "Order block — the last opposing candle before a strong move; price often retests it.",
  ORB: "Opening range — the first 15 minutes after the cash open; breaks set the day's direction.",
};

// per-strategy beginner "what to look for" (reused in the glossary playbook)
export const STRATEGY_LOOK: Record<string, string> = {
  ORB: "Wait for the first 15-minute range to form, then enter the break in the direction of the open drive.",
  FVG_RETEST: "Find an unfilled 3-candle gap, then enter when price pulls back into it and rejects.",
  OB_RETEST: "Mark the last opposing candle before a strong move; enter when price retests that block.",
  BOS_CONTINUATION: "Wait for price to break a prior swing (break of structure), then enter the pullback.",
  BREAKOUT_RETEST: "Price breaks the prior-day high/low, then re-tests the reclaimed level before continuing.",
  VWAP_REVERSION: "In a range, fade a stretched, RSI-extreme move back toward the session VWAP.",
  EMA_TREND_PULLBACK: "In a trend, buy/sell the pullback to the EMA with ADX confirming the trend.",
  LIQUIDITY_SWEEP: "Price runs stops just beyond a swing, then snaps back inside — enter the reversal.",
};

// strategy → the marker that names the key action at the decision bar
function strategyMarker(setup: SetupForAnnotation, time: number): Annotation | null {
  const up = setup.direction === "long";
  const base = {
    kind: "marker" as const,
    time,
    position: (up ? "belowBar" : "aboveBar") as "aboveBar" | "belowBar",
    shape: (up ? "arrowUp" : "arrowDown") as "circle" | "arrowUp" | "arrowDown",
    color: up ? C.profit : C.loss,
  };
  switch (setup.name) {
    case "LIQUIDITY_SWEEP":
      return { ...base, label: "Sweep", note: "Liquidity sweep — price ran the stops past a level, then reversed back inside. That snap-back is the entry." };
    case "BOS_CONTINUATION":
      return { ...base, label: "BOS", note: "Break of structure — price broke a prior swing, signalling the trend continues. Enter the pullback after the break." };
    case "ORB":
      return { ...base, label: "Break", note: "Opening-range break — price pushed out of the first-15-min range in the trend direction." };
    default:
      return { ...base, shape: "circle", label: "Entry", note: `Entry trigger for ${setup.label} fired on this bar.` };
  }
}

export function annotationsFromSetup(
  overlays: RawOverlay[],
  setup: SetupForAnnotation,
  lastBarTime: number,
): Annotation[] {
  const out: Annotation[] = [];

  // structure zones (FVG / OB / ORB) — the boxes on the chart
  for (const o of overlays) {
    const color = o.kind === "ORB" ? C.warn : o.kind === "FVG" ? C.cyan : o.direction === "long" ? C.profit : C.loss;
    out.push({
      kind: "zone",
      low: o.low,
      high: o.high,
      color,
      label: o.label,
      note: ZONE_NOTE[o.kind] ?? `${o.label} — a level the setup leaned on.`,
    });
  }

  // the action marker for this strategy at the decision bar
  const marker = strategyMarker(setup, lastBarTime);
  if (marker) out.push(marker);

  // trade levels
  if (setup.entry != null) {
    out.push({ kind: "level", price: setup.entry, color: C.warn, label: "Entry", note: "Where the plan enters." });
  }
  if (setup.stop != null) {
    out.push({ kind: "level", price: setup.stop, color: C.loss, label: "Stop", note: "Where the read is wrong — the trade is cut here." });
  }
  if (setup.target != null) {
    out.push({ kind: "level", price: setup.target, color: C.profit, label: "Target", note: "Where the plan takes profit." });
  }
  return out;
}
