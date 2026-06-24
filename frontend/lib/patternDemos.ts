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
};
