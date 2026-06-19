// "What NOT to do" — trap setups and how to avoid them. Education only.
export type AntiPattern = {
  name: string;
  diagram?: "fvg" | "ob" | "orb" | "bos";
  looksLike: string;
  tempting: string;
  whyItFails: string;
  howToSpot: string;
  insteadDo: string;
};

export const ANTI_PATTERNS: AntiPattern[] = [
  {
    name: "False breakout (failed break)",
    diagram: "orb",
    looksLike: "Price pokes just beyond an obvious level then closes back inside.",
    tempting: "The break 'confirms' the move — you don't want to miss it.",
    whyItFails: "There wasn't enough order flow to sustain it; the break only triggered stops, which then get faded.",
    howToSpot: "Low/declining volume on the break, long rejection wick, immediate close back inside the range.",
    insteadDo: "Demand a CLOSE beyond + a holding retest, or trade the failure back into the range with a stop beyond the wick.",
  },
  {
    name: "Bull trap",
    looksLike: "A breakout above resistance that sucks in buyers, then reverses sharply lower.",
    tempting: "It feels like the start of a new leg up; FOMO kicks in.",
    whyItFails: "Larger players sell into the breakout liquidity; there's no follow-through buying.",
    howToSpot: "Break into a known supply zone / prior-day high with weak momentum; quick reclaim back below.",
    insteadDo: "Wait for the retest to HOLD. If price reclaims the level back down, the trap is set — consider the short.",
  },
  {
    name: "Bear trap",
    looksLike: "A breakdown below support that triggers shorts, then snaps back up.",
    tempting: "Looks like capitulation; you short the 'breakdown'.",
    whyItFails: "Stops below the low are the target; once swept, buyers step in and squeeze shorts.",
    howToSpot: "Sharp poke below an obvious low + immediate close back above it (a sweep-and-reclaim).",
    insteadDo: "Treat the reclaim as a long trigger with a stop below the sweep, not a reason to short.",
  },
  {
    name: "Dead-cat bounce",
    looksLike: "A sharp relief rally inside a strong downtrend that fades and makes new lows.",
    tempting: "You assume the bottom is in and buy the bounce.",
    whyItFails: "It's a counter-trend pop with no structure change; sellers resume control.",
    howToSpot: "Bounce stalls at a prior support-turned-resistance / VWAP with no higher-high or BOS.",
    insteadDo: "Require a real change of character (CHoCH/BOS up) before buying; otherwise the trend is still down.",
  },
  {
    name: "Low-volume drift",
    looksLike: "A slow, quiet grind in one direction on thin volume (often lunch).",
    tempting: "The 'trend' looks easy and clean.",
    whyItFails: "No real participation — it reverses easily and stops are far for the range on offer.",
    howToSpot: "Declining volume, narrow ranges, midday timing, price away from VWAP with no momentum.",
    insteadDo: "Stand aside or size down. Save risk for the killzones with real participation.",
  },
  {
    name: "News spike",
    looksLike: "A violent one-bar move on an economic release with a huge range.",
    tempting: "Big, fast move — you chase the direction.",
    whyItFails: "Spreads blow out, slippage is brutal, and the first move often whipsaws/reverses.",
    howToSpot: "Scheduled event time (e.g. 08:30/10:00 ET), a candle several ATR in size, erratic two-way action.",
    insteadDo: "Don't trade the spike. Wait for the dust to settle and a real structure to form, then trade that.",
  },
  {
    name: "Chasing (late entry)",
    looksLike: "Price already ran 2–3R; you market-in at the extreme.",
    tempting: "Fear of missing the move overrides the plan.",
    whyItFails: "Your stop is now huge or your R:R is terrible, right as the move is exhausting.",
    howToSpot: "You're entering far from any level/structure, after an extended run, with no defined risk.",
    insteadDo: "Wait for a pullback to structure (FVG/OB/EMA). If there's no good entry, there's no trade.",
  },
  {
    name: "Averaging down (no stop)",
    looksLike: "Adding to a loser to 'lower your average' instead of stopping out.",
    tempting: "It feels like you'll be saved by a small bounce.",
    whyItFails: "You increase risk exactly when the thesis is failing; one trend wipes the account.",
    howToSpot: "You're adding below your stop, or you 'moved' the stop to avoid the loss.",
    insteadDo: "Define the stop before entry and honor it. A −1R is the cost of doing business; a blown account isn't.",
  },
];
