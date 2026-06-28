// Hand-authored, idealized OHLC clips for glossary terms with a clear price-
// action shape. Keyed by the EXACT term string in lib/glossary.ts so the page
// can look one up. Tiny arrays only — no market data, no video. Reuse the same
// shape for more terms and the strategy library later.
import type { DemoMark, DemoZone, OHLC } from "../components/PatternDemo";

export type PatternDemoData = {
  bars: OHLC[];
  zones?: DemoZone[];
  marks?: DemoMark[];
  caption?: string;
};

const AMBER = "#FFD600";
const GREEN = "#00E676";
const RED = "#FF1744";

export const PATTERN_DEMOS: Record<string, PatternDemoData> = {
  // Bullish FVG: a fast displacement up leaves a 3-candle gap; price retraces
  // into the gap (the retest), then continues.
  "Fair Value Gap (FVG)": {
    caption: "Displacement leaves a gap (candle 1 high → candle 3 low); price retests it, then continues.",
    bars: [
      { o: 99.8, h: 100.3, l: 99.6, c: 100.1 },
      { o: 100.1, h: 100.5, l: 99.9, c: 100.3 }, // candle 1 — high 100.5 = gap floor
      { o: 100.4, h: 101.7, l: 100.3, c: 101.6 }, // displacement (middle candle)
      { o: 101.6, h: 101.9, l: 101.0, c: 101.4 }, // candle 3 — low 101.0 = gap ceiling
      { o: 101.4, h: 101.5, l: 100.9, c: 101.0 },
      { o: 101.0, h: 101.1, l: 100.6, c: 100.8 }, // retest into the gap
      { o: 100.8, h: 101.3, l: 100.7, c: 101.2 }, // bounce out
      { o: 101.2, h: 101.9, l: 101.1, c: 101.8 },
      { o: 101.8, h: 102.4, l: 101.7, c: 102.3 },
      { o: 102.3, h: 102.7, l: 102.1, c: 102.5 },
      { o: 102.5, h: 103.0, l: 102.4, c: 102.9 },
    ],
    zones: [{ low: 100.5, high: 101.0, color: AMBER, label: "FVG" }],
    marks: [{ i: 5, color: GREEN, text: "retest" }],
  },

  // Bullish Order Block: the last down candle before an impulsive rally; price
  // returns to mitigate it and bounces.
  "Order Block (OB)": {
    caption: "Last down candle before the rally = the order block; price returns to it and bounces.",
    bars: [
      { o: 100.2, h: 100.6, l: 100.0, c: 100.4 },
      { o: 100.4, h: 100.7, l: 100.3, c: 100.5 },
      { o: 100.5, h: 100.6, l: 100.1, c: 100.2 }, // order block (last down candle)
      { o: 100.2, h: 101.5, l: 100.2, c: 101.4 }, // impulsive up
      { o: 101.4, h: 101.9, l: 101.3, c: 101.8 },
      { o: 101.8, h: 101.9, l: 101.0, c: 101.1 }, // pullback
      { o: 101.1, h: 101.2, l: 100.4, c: 100.6 }, // mitigation into the block
      { o: 100.6, h: 101.3, l: 100.5, c: 101.2 }, // bounce
      { o: 101.2, h: 101.9, l: 101.1, c: 101.8 },
      { o: 101.8, h: 102.4, l: 101.7, c: 102.3 },
    ],
    zones: [{ low: 100.1, high: 100.6, color: AMBER, label: "OB" }],
    marks: [
      { i: 2, color: AMBER, text: "OB" },
      { i: 6, color: GREEN, text: "mitigation" },
    ],
  },

  // Liquidity Sweep / Stop Hunt: an obvious high is poked by a long wick (stops
  // triggered), price closes back below, then reverses down.
  "Liquidity Sweep / Stop Hunt": {
    caption: "A long wick pokes above the obvious high (stops run), closes back below, then reverses.",
    bars: [
      { o: 100.0, h: 100.5, l: 99.8, c: 100.4 },
      { o: 100.4, h: 101.0, l: 100.3, c: 100.9 }, // builds the high ~101.0
      { o: 100.9, h: 101.0, l: 100.5, c: 100.6 }, // equal high (liquidity above)
      { o: 100.6, h: 100.8, l: 100.4, c: 100.7 },
      { o: 100.7, h: 101.0, l: 100.6, c: 100.9 }, // approaches again
      { o: 100.9, h: 101.6, l: 100.8, c: 100.95 }, // THE SWEEP: wick over 101.0, closes back below
      { o: 100.95, h: 101.0, l: 100.3, c: 100.4 }, // reversal begins
      { o: 100.4, h: 100.5, l: 99.7, c: 99.8 },
      { o: 99.8, h: 99.9, l: 99.1, c: 99.2 },
      { o: 99.2, h: 99.4, l: 98.7, c: 98.9 },
    ],
    zones: [{ low: 101.0, high: 101.0, color: AMBER, label: "liquidity" }],
    marks: [
      { i: 5, color: RED, text: "sweep", above: true },
      { i: 6, color: AMBER, text: "reversal", above: true },
    ],
  },

  // Break of structure: price takes out the prior swing high → trend continues.
  "Break of Structure (BOS)": {
    caption: "Price breaks above the prior swing high — structure shifts up (a BOS).",
    bars: [
      { o: 100.0, h: 100.3, l: 99.8, c: 100.2 },
      { o: 100.2, h: 100.6, l: 100.1, c: 100.5 },
      { o: 100.5, h: 100.6, l: 100.0, c: 100.1 },
      { o: 100.1, h: 100.2, l: 99.7, c: 99.8 },
      { o: 99.8, h: 100.2, l: 99.7, c: 100.1 },
      { o: 100.1, h: 100.5, l: 100.0, c: 100.4 },
      { o: 100.4, h: 100.9, l: 100.3, c: 100.8 },
      { o: 100.8, h: 101.2, l: 100.7, c: 101.1 },
    ],
    zones: [{ low: 100.6, high: 100.6, color: AMBER, label: "prior high" }],
    marks: [{ i: 6, color: GREEN, text: "BOS", above: true }],
  },

  // Range: price oscillates between a floor and a ceiling (no trend).
  "Range / Consolidation": {
    caption: "Price bounces between a floor and a ceiling — no trend, just rotation.",
    bars: [
      { o: 100.0, h: 100.5, l: 99.9, c: 100.4 },
      { o: 100.4, h: 100.5, l: 100.0, c: 100.1 },
      { o: 100.1, h: 100.2, l: 99.6, c: 99.7 },
      { o: 99.7, h: 99.8, l: 99.5, c: 99.7 },
      { o: 99.7, h: 100.3, l: 99.6, c: 100.2 },
      { o: 100.2, h: 100.5, l: 100.1, c: 100.4 },
      { o: 100.4, h: 100.5, l: 99.9, c: 100.0 },
      { o: 100.0, h: 100.1, l: 99.5, c: 99.6 },
      { o: 99.6, h: 100.2, l: 99.5, c: 100.1 },
    ],
    zones: [
      { low: 99.5, high: 99.5, color: AMBER, label: "floor" },
      { low: 100.5, high: 100.5, color: GREEN, label: "ceiling" },
    ],
  },
};

// Idealized failure-mode clips for the Anti-Patterns page, keyed by the EXACT
// anti-pattern `name` in lib/antipatterns.ts. Same PatternDemo shape, so every
// anti-pattern shows what the trap looks like on a chart (PatternDemo itself
// falls back to text if a clip is ever missing or malformed — never a blank box).
export const ANTI_PATTERN_DEMOS: Record<string, PatternDemoData> = {
  "False breakout (failed break)": {
    caption: "Price pokes just above the range high, fails to hold, and snaps back inside.",
    bars: [
      { o: 100.0, h: 100.4, l: 99.8, c: 100.2 },
      { o: 100.2, h: 100.5, l: 100.0, c: 100.3 },
      { o: 100.3, h: 100.5, l: 100.1, c: 100.2 },
      { o: 100.2, h: 100.4, l: 99.9, c: 100.0 },
      { o: 100.0, h: 100.9, l: 100.0, c: 100.2 },
      { o: 100.2, h: 100.3, l: 99.6, c: 99.7 },
      { o: 99.7, h: 99.8, l: 99.2, c: 99.3 },
      { o: 99.3, h: 99.5, l: 98.9, c: 99.0 },
    ],
    zones: [{ low: 100.5, high: 100.5, color: AMBER, label: "range high" }],
    marks: [{ i: 4, color: RED, text: "false break", above: true }],
  },
  "Bull trap": {
    caption: "A break above resistance lures buyers in, then reverses hard — trapping the longs.",
    bars: [
      { o: 99.6, h: 100.1, l: 99.5, c: 100.0 },
      { o: 100.0, h: 100.5, l: 99.9, c: 100.4 },
      { o: 100.4, h: 100.6, l: 100.2, c: 100.5 },
      { o: 100.5, h: 101.1, l: 100.4, c: 101.0 },
      { o: 101.0, h: 101.2, l: 100.6, c: 100.7 },
      { o: 100.7, h: 100.8, l: 99.9, c: 100.0 },
      { o: 100.0, h: 100.1, l: 99.3, c: 99.4 },
      { o: 99.4, h: 99.6, l: 99.0, c: 99.1 },
    ],
    zones: [{ low: 100.6, high: 100.6, color: AMBER, label: "resistance" }],
    marks: [{ i: 3, color: RED, text: "trap", above: true }],
  },
  "Bear trap": {
    caption: "A break below support lures sellers in, then reverses up — trapping the shorts.",
    bars: [
      { o: 100.4, h: 100.5, l: 99.9, c: 100.0 },
      { o: 100.0, h: 100.1, l: 99.5, c: 99.6 },
      { o: 99.6, h: 99.7, l: 99.4, c: 99.5 },
      { o: 99.5, h: 99.6, l: 98.9, c: 99.0 },
      { o: 99.0, h: 99.4, l: 98.8, c: 99.3 },
      { o: 99.3, h: 100.0, l: 99.2, c: 99.9 },
      { o: 99.9, h: 100.5, l: 99.8, c: 100.4 },
      { o: 100.4, h: 100.9, l: 100.3, c: 100.8 },
    ],
    zones: [{ low: 99.4, high: 99.4, color: AMBER, label: "support" }],
    marks: [{ i: 3, color: RED, text: "trap" }],
  },
  "Dead-cat bounce": {
    caption: "After a sharp drop, a weak bounce tempts buyers — then the decline resumes.",
    bars: [
      { o: 101.0, h: 101.2, l: 100.8, c: 101.0 },
      { o: 101.0, h: 101.1, l: 100.0, c: 100.1 },
      { o: 100.1, h: 100.2, l: 99.2, c: 99.3 },
      { o: 99.3, h: 99.4, l: 98.6, c: 98.7 },
      { o: 98.7, h: 99.5, l: 98.6, c: 99.4 },
      { o: 99.4, h: 99.7, l: 99.2, c: 99.3 },
      { o: 99.3, h: 99.4, l: 98.5, c: 98.6 },
      { o: 98.6, h: 98.7, l: 97.9, c: 98.0 },
      { o: 98.0, h: 98.2, l: 97.4, c: 97.5 },
    ],
    marks: [{ i: 4, color: RED, text: "bounce", above: true }],
  },
  "Low-volume drift": {
    caption: "A slow, tiny-bodied grind on no real participation — moves like this rarely hold.",
    bars: [
      { o: 100.0, h: 100.1, l: 99.9, c: 100.05 },
      { o: 100.05, h: 100.15, l: 99.95, c: 100.1 },
      { o: 100.1, h: 100.2, l: 100.0, c: 100.12 },
      { o: 100.12, h: 100.2, l: 100.05, c: 100.15 },
      { o: 100.15, h: 100.25, l: 100.08, c: 100.18 },
      { o: 100.18, h: 100.28, l: 100.12, c: 100.22 },
      { o: 100.22, h: 100.3, l: 100.15, c: 100.25 },
      { o: 100.25, h: 100.34, l: 100.2, c: 100.3 },
    ],
  },
  "News spike": {
    caption: "A headline rips price in a huge wick, then it mean-reverts and chops — late entries get whipsawed.",
    bars: [
      { o: 100.0, h: 100.2, l: 99.9, c: 100.1 },
      { o: 100.1, h: 100.2, l: 100.0, c: 100.1 },
      { o: 100.1, h: 102.5, l: 100.0, c: 101.0 },
      { o: 101.0, h: 101.2, l: 100.1, c: 100.3 },
      { o: 100.3, h: 100.6, l: 99.8, c: 100.0 },
      { o: 100.0, h: 100.4, l: 99.7, c: 100.2 },
      { o: 100.2, h: 100.5, l: 99.9, c: 100.1 },
    ],
    marks: [{ i: 2, color: RED, text: "news", above: true }],
  },
  "Chasing (late entry)": {
    caption: "Buying the top of a parabolic run — right before the pullback, with no room to survive.",
    bars: [
      { o: 99.8, h: 100.0, l: 99.7, c: 99.9 },
      { o: 99.9, h: 100.5, l: 99.8, c: 100.4 },
      { o: 100.4, h: 101.0, l: 100.3, c: 100.9 },
      { o: 100.9, h: 101.6, l: 100.8, c: 101.5 },
      { o: 101.5, h: 101.9, l: 101.4, c: 101.8 },
      { o: 101.8, h: 101.9, l: 101.0, c: 101.1 },
      { o: 101.1, h: 101.2, l: 100.4, c: 100.5 },
      { o: 100.5, h: 100.7, l: 100.0, c: 100.2 },
    ],
    marks: [{ i: 4, color: RED, text: "chase", above: true }],
  },
  "Averaging down (no stop)": {
    caption: "Adding to a loser at each new low with no stop — the position grows as it gets worse.",
    bars: [
      { o: 101.0, h: 101.1, l: 100.4, c: 100.5 },
      { o: 100.5, h: 100.6, l: 99.9, c: 100.0 },
      { o: 100.0, h: 100.1, l: 99.4, c: 99.5 },
      { o: 99.5, h: 99.6, l: 98.9, c: 99.0 },
      { o: 99.0, h: 99.1, l: 98.4, c: 98.5 },
      { o: 98.5, h: 98.6, l: 97.9, c: 98.0 },
      { o: 98.0, h: 98.1, l: 97.3, c: 97.4 },
      { o: 97.4, h: 97.5, l: 96.7, c: 96.8 },
    ],
    marks: [
      { i: 0, color: RED, text: "add" },
      { i: 2, color: RED, text: "add" },
      { i: 4, color: RED, text: "add" },
    ],
  },
};
