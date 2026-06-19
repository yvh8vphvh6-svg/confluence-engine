// Rich, education-only playbook content per strategy, keyed by the engine's
// REGISTRY names. Stats come from the live /api/strategies endpoint separately.
export type StrategyDoc = {
  name: string;
  label: string;
  family: string;
  diagram?: "fvg" | "ob" | "orb" | "bos";
  description: string;
  works: string[];
  fails: string[];
  entrySteps: string[];
  stopLogic: string;
  targets: string;
  rr: string;
  timeframes: string;
  timeOfDay: string;
  winExample: string;
  failExample: string;
  commonMistakes: string[];
  variations: string[];
};

export const STRATEGY_DOCS: Record<string, StrategyDoc> = {
  ORB: {
    name: "ORB", label: "Opening Range Breakout", family: "breakout", diagram: "orb",
    description: "Define the first 15 minutes' high/low after the cash open, then trade the break in the direction of the drive.",
    works: ["Trend/expansion days", "High opening volume", "Clear directional drive off the open"],
    fails: ["Chop / low-volume days (false breaks)", "Inside a larger range", "After an exhausted overnight move"],
    entrySteps: ["Mark the 09:30–09:45 ET high & low", "Wait for a candle to CLOSE beyond the range", "Enter on the close (or a shallow retest of the edge)"],
    stopLogic: "Other side of the opening range (or 1×ATR beyond the broken edge).",
    targets: "First target ~1R / measured-move = range height projected from the break; trail the runner.",
    rr: "~2:1 typical",
    timeframes: "1–5m for the trigger; manage on 5–15m.",
    timeOfDay: "Morning killzone (09:30–11:00 ET).",
    winExample: "OR = 17,900–17,950. A 5-min candle closes at 17,965 on rising volume; you buy 17,965, stop 17,895 (below OR low), target 18,035 (+1× range). Trends to target.",
    failExample: "Quiet day; price pokes 17,952 then closes back inside the range — a false break that stops you for −1R. (Why ORB wants expansion, not chop.)",
    commonMistakes: ["Entering the wick instead of the close", "Trading ORB on a rangebound day", "Stop too tight (inside the range noise)"],
    variations: ["5-min vs 15-min opening range", "Require a volume spike on the break", "Only trade the first break of the day"],
  },
  FVG_RETEST: {
    name: "FVG_RETEST", label: "Fair Value Gap Retest", family: "smc", diagram: "fvg",
    description: "After an impulsive move leaves a 3-candle imbalance, enter on a limit when price retraces into the gap.",
    works: ["Trending markets with displacement", "Gap aligns with HTF bias & VWAP", "Clean, fast origin move"],
    fails: ["Choppy markets (gaps fill and keep going)", "Counter-trend gaps", "Old/stale gaps far from price"],
    entrySteps: ["Spot a 3-candle FVG in the trend direction", "Place a limit at the gap edge / midpoint", "Confirm structure still favors the trade"],
    stopLogic: "Beyond the far side of the gap (the imbalance should hold).",
    targets: "Prior swing / 2R; partial at 1R then trail.",
    rr: "~2:1+",
    timeframes: "1–5m entries inside a 15m trend.",
    timeOfDay: "Killzones; avoid lunch chop.",
    winExample: "Strong rally leaves a gap 18,010–18,030. Price drifts back, taps 18,028, you long with stop 18,005, target 18,075. Gap holds, continuation to target.",
    failExample: "In a range, price fills the gap and just keeps going through your stop — gaps aren't magic in chop.",
    commonMistakes: ["Trading every gap regardless of regime", "No stop beyond the gap", "Chasing instead of waiting for the retest"],
    variations: ["Gap + order block confluence", "Only OTE-zone gaps", "Require the gap to be unfilled"],
  },
  OB_RETEST: {
    name: "OB_RETEST", label: "Order Block Mitigation", family: "smc", diagram: "ob",
    description: "Enter on a limit when price returns to the last opposing candle before an impulsive move (the order block).",
    works: ["Trends with clear displacement", "OB aligned with HTF structure", "First mitigation of a fresh block"],
    fails: ["Ranges (blocks get run through)", "Counter-trend blocks", "Over-mitigated/old blocks"],
    entrySteps: ["Find the last down candle before a sharp rally (bull OB)", "Limit at the block's edge", "Confirm trend intact"],
    stopLogic: "Beyond the order block (if it breaks, the idea is wrong).",
    targets: "Recent swing / 2R; scale out.",
    rr: "~2:1",
    timeframes: "5–15m.",
    timeOfDay: "Killzones.",
    winExample: "Last red candle before a rally is 17,980–18,000. Price returns to 17,998, you long, stop 17,975, target 18,050. Block holds.",
    failExample: "Sideways tape: price slices the block and your stop without a reaction — no displacement, no edge.",
    commonMistakes: ["Using stale blocks", "Trading against the higher-timeframe trend", "No invalidation level"],
    variations: ["OB + FVG overlap", "Breaker blocks", "Refine with volume"],
  },
  BOS_CONTINUATION: {
    name: "BOS_CONTINUATION", label: "Break of Structure Continuation", family: "smc", diagram: "bos",
    description: "After price breaks a confirmed swing, enter the pullback in the breakout direction.",
    works: ["Established trends", "Clean BOS with follow-through", "Pullback holds prior structure"],
    fails: ["Ranges (false BOS)", "Late in an extended trend", "No pullback / vertical moves"],
    entrySteps: ["Confirm a swing break (close beyond)", "Wait for a shallow pullback toward the broken level", "Enter as it holds"],
    stopLogic: "Below the pullback low / reclaimed level (≈1.5×ATR fallback).",
    targets: "2R or the next structure level.",
    rr: "~2:1",
    timeframes: "5–15m.",
    timeOfDay: "Trend hours; avoid the last 10 min.",
    winExample: "Uptrend breaks the last swing high at 18,000; pulls back to 18,005 and holds; you long, stop 17,980, target 18,050.",
    failExample: "In a range a 'BOS' immediately reverses (a sweep) — you're long into supply and stop out.",
    commonMistakes: ["Chasing the break with no pullback", "Confusing a sweep for a BOS", "Trading BOS in chop"],
    variations: ["BOS + FVG entry", "Require killzone timing", "Only with-trend BOS"],
  },
  BREAKOUT_RETEST: {
    name: "BREAKOUT_RETEST", label: "PDH/PDL Break & Retest", family: "breakout",
    description: "Trade a broken prior-day high/low only after it breaks and then holds on a retest.",
    works: ["Trending days", "Strong break of an obvious level", "Retest holds with a rejection wick"],
    fails: ["False breaks in chop", "No retest (you miss or chase)", "Weak, low-volume break"],
    entrySteps: ["Mark PDH/PDL", "Wait for a break and close beyond", "Enter the retest as the level flips to support/resistance"],
    stopLogic: "Back inside the level by ~1×ATR (the reclaim invalidates it).",
    targets: "Measured move / 2R; trail.",
    rr: "~2:1+",
    timeframes: "5–15m.",
    timeOfDay: "Morning & early afternoon.",
    winExample: "PDH 18,000 breaks; price pulls back to 18,002 and holds; you long, stop 17,985, target 18,050.",
    failExample: "Price breaks PDH, you chase at 18,015, it fades back under 18,000 — no retest discipline, −1R.",
    commonMistakes: ["Chasing the break (no retest)", "Ignoring volume", "Stop inside the noise"],
    variations: ["PDL short mirror", "Add VWAP confluence", "Require the retest within N bars"],
  },
  VWAP_REVERSION: {
    name: "VWAP_REVERSION", label: "VWAP Mean Reversion", family: "mean_reversion",
    description: "Fade a stretched, RSI-extreme move back toward session VWAP. RANGE regime only.",
    works: ["Ranging / low-volatility sessions", "Price stretched >1.2 ATR from VWAP", "RSI extreme (>60 short / <40 long)"],
    fails: ["Trends (you're fighting the move — dangerous)", "News expansion", "Stretch that keeps stretching"],
    entrySteps: ["Confirm ranging regime", "Wait for stretch + RSI extreme", "Limit toward the mean; target VWAP"],
    stopLogic: "~1×ATR beyond the extreme (if it keeps going, the range is breaking).",
    targets: "VWAP (the mean). Take it — don't get greedy fading.",
    rr: "~1–1.5:1 (range trades are smaller)",
    timeframes: "1–5m.",
    timeOfDay: "Lunch / quiet ranges; avoid the open's expansion.",
    winExample: "Range day; price stretches 1.5 ATR above VWAP, RSI 72. You short with a 1×ATR stop, target VWAP, and it reverts.",
    failExample: "Trend day: you fade the 'stretch', but it's a trend leg — price never reverts and stops you out. (Why this is range-only.)",
    commonMistakes: ["Fading a trend", "No stop (averaging down)", "Holding past VWAP for more"],
    variations: ["VWAP band (±σ) entries", "Require prior-day level confluence", "Only the 2nd stretch"],
  },
  EMA_TREND_PULLBACK: {
    name: "EMA_TREND_PULLBACK", label: "EMA Trend Pullback", family: "trend",
    description: "Buy pullbacks to a rising EMA(20) in a confirmed uptrend with ADX/DI agreement (inverse for downtrend).",
    works: ["Established trends (ADX>25, +DI>−DI)", "Orderly pullbacks to the EMA", "EMA20 above EMA50"],
    fails: ["Ranges (EMA gets chopped)", "Weak/flat ADX", "Parabolic moves that don't pull back"],
    entrySteps: ["Confirm trend (EMA stack + ADX/DI)", "Wait for a pullback that tags EMA20 and closes back with trend", "Enter on the hold"],
    stopLogic: "Below the last swing low (or 1.5×ATR).",
    targets: "2R / next swing; trail with the EMA.",
    rr: "~2:1",
    timeframes: "5–15m.",
    timeOfDay: "Trend hours.",
    winExample: "Uptrend, ADX 30. Price dips to a rising EMA20 at 18,010 and closes back up; you long, stop 17,985, target 18,060.",
    failExample: "Flat ADX range: price oscillates across the EMA and every 'pullback' entry chops out.",
    commonMistakes: ["Trading it in a range", "Ignoring ADX", "Front-running the EMA tag"],
    variations: ["EMA20 vs EMA50 pullbacks", "Add OTE/fib confluence", "Require a higher-low to form"],
  },
  LIQUIDITY_SWEEP: {
    name: "LIQUIDITY_SWEEP", label: "Liquidity Sweep Reversal", family: "smc",
    description: "After a stop-run that sweeps a swing high/low and closes back inside, trade the reversal.",
    works: ["Obvious liquidity above/below a swing", "Sharp poke + close back inside", "High-vol killzone reversals"],
    fails: ["Real breakouts (no reclaim)", "Slow grinds through a level", "Low-volume drifts"],
    entrySteps: ["Identify an obvious swing high/low (stops sit beyond)", "Wait for a poke beyond that CLOSES back inside", "Enter the reversal, stop beyond the sweep wick"],
    stopLogic: "Just beyond the sweep extreme (~0.2×ATR buffer).",
    targets: "Opposite side of the range / 2R.",
    rr: "~2:1+",
    timeframes: "1–5m.",
    timeOfDay: "Killzones / high-vol windows.",
    winExample: "Price spikes 4 ticks above the swing high, then closes back below it on a big red candle; you short, stop above the wick, and it reverses.",
    failExample: "Price pushes through the high and KEEPS going (a real breakout) — no reclaim, your fade is wrong.",
    commonMistakes: ["Fading a genuine breakout", "Entering before the reclaim close", "Stop too far (poor R:R)"],
    variations: ["Sweep + FVG entry", "Double-sweep (two pokes)", "Session-high/low sweeps"],
  },
};
