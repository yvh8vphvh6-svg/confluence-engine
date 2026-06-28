// Plain-language teaching layer. Turns the engine's jargon (confluence factors,
// R-multiples, regimes, strategy names) into sentences a person who has never
// traded can follow. Everything here is derived from REAL engine fields — it
// rephrases, it never invents an outcome.

type Dir = "long" | "short";

// What "long" / "short" actually mean, in plain words.
export const DIR_WORD: Record<Dir, string> = { long: "LONG", short: "SHORT" };
export const DIR_GLOSS: Record<Dir, string> = {
  long: "betting the price goes UP",
  short: "betting the price goes DOWN",
};

// Per-strategy mechanic in beginner language, phrased for the trade direction.
// Keyed by the engine's REGISTRY names.
const SETUP_CLAUSE: Record<string, (d: Dir) => string> = {
  ORB: (d) =>
    d === "long"
      ? "price broke out above the morning's opening range and kept pushing up, so buyers are in control"
      : "price broke down below the morning's opening range, so sellers took over",
  FVG_RETEST: (d) =>
    d === "long"
      ? "price shot up fast and left a small gap behind, then dipped back to fill it — where buyers often step back in"
      : "price dropped fast and left a small gap behind, then bounced back to fill it — where sellers often step back in",
  OB_RETEST: (d) =>
    d === "long"
      ? "price is coming back to the area where big buyers last loaded up before a strong push up, which often holds as support"
      : "price is coming back to the area where big sellers last loaded up before a strong push down, which often holds as resistance",
  BOS_CONTINUATION: (d) =>
    d === "long"
      ? "price just broke above a prior high (a 'break of structure'), a sign the up-move likely continues"
      : "price just broke below a prior low (a 'break of structure'), a sign the down-move likely continues",
  BREAKOUT_RETEST: (d) =>
    d === "long"
      ? "price broke above a level, came back to tap it, and held — turning old resistance into support"
      : "price broke below a level, came back to tap it, and held — turning old support into resistance",
  VWAP_REVERSION: (d) =>
    d === "long"
      ? "price stretched too far below its average price for the day (the VWAP) and is snapping back up toward it"
      : "price stretched too far above its average price for the day (the VWAP) and is fading back down toward it",
  EMA_TREND_PULLBACK: (d) =>
    d === "long"
      ? "the market is trending up and price pulled back to its moving-average line, then started bouncing — joining the trend on a dip"
      : "the market is trending down and price pulled back up to its moving-average line, then started rolling over — joining the trend on a bounce",
  LIQUIDITY_SWEEP: (d) =>
    d === "long"
      ? "price dipped below the lows to trip stop-losses, then snapped back up — a classic 'stop hunt' reversal"
      : "price ran above the highs to grab stops, then started rejecting back down — a classic 'stop hunt' reversal",
};

const REVERSAL_SETUPS = new Set(["VWAP_REVERSION", "LIQUIDITY_SWEEP"]);

// The trailing "...and we're in a X market where that tends to work" clause —
// honest about when the setup type actually has an edge.
function regimeFitClause(regime: string, isReversal: boolean): string {
  switch (regime) {
    case "ranging":
      return isReversal
        ? "we're in a sideways (ranging) market — price keeps bouncing between a floor and a ceiling, which is exactly where these snap-backs tend to work"
        : "we're in a sideways (ranging) market, so this breakout has to prove itself — sideways markets fake out a lot";
    case "trending":
      return isReversal
        ? "the market is trending, so this is a counter-move against the bigger push — worth a tight, careful try"
        : "the market is trending (moving mostly one direction), so going with the move has the edge here";
    case "high_vol":
      return "the market is moving fast and wild right now (high volatility) — it can pay off quickly, but it can fail just as fast";
    case "low_vol":
      return "the market is quiet right now (small, slow moves), so expect a smaller move and be patient";
    default:
      return "the current market conditions line up for it";
  }
}

// FIRST sentence shown on auto-pause: what this is and WHY, in plain English.
export function plainSetupSentence(strategy: string, direction: Dir, regime: string): string {
  const clause = SETUP_CLAUSE[strategy]?.(direction) ?? "the engine's conditions for this setup lined up";
  const fit = regimeFitClause(regime, REVERSAL_SETUPS.has(strategy));
  return `This looks like a ${DIR_WORD[direction]} (${DIR_GLOSS[direction]}) — ${clause}, and ${fit}.`;
}

// Decision-drill teaching sentence: what the chart actually DID after the
// decision, whether the read was right, and WHY — from real result fields.
export function plainDrillOutcome(
  action: "buy" | "sell" | "wait" | "pass",
  result: { forward_move: number; direction_correct: boolean; r_multiple: number; outcome: string },
  regime: string,
): string {
  const moved = Math.abs(result.forward_move);
  const dirText = result.forward_move > 0 ? "UP" : result.forward_move < 0 ? "DOWN" : "sideways";
  const what = `After your decision, price moved about ${moved.toFixed(0)} points ${dirText}.`;

  if (action === "wait" || action === "pass") {
    const bigEnough = moved >= 5;
    return `${what} You chose to stay out. ${
      bigEnough
        ? "There was a real move to catch here, so a clean entry could have paid — but sitting out a setup you didn't trust is never a losing habit."
        : "Price didn't go far, so staying out was sensible — sometimes the best trade is no trade, especially when nothing lines up."
    }`;
  }

  const wanted = action === "buy" ? "UP" : "DOWN";
  if (result.direction_correct) {
    return `${what} You said ${action.toUpperCase()} — betting price would go ${wanted} — and it did. ${regimeWhy(regime, true)} That's worth ${result.r_multiple.toFixed(1)}R (you ${result.r_multiple >= 0 ? "made" : "lost"} ${Math.abs(result.r_multiple).toFixed(1)}× what you risked).`;
  }
  return `${what} You said ${action.toUpperCase()} — betting price would go ${wanted} — but it went the other way. ${regimeWhy(regime, false)} That came to ${result.r_multiple.toFixed(1)}R (you lost about ${Math.abs(result.r_multiple).toFixed(1)}× what you risked).`;
}

function regimeWhy(regime: string, correct: boolean): string {
  if (regime === "ranging") {
    return correct
      ? "In a sideways market direction is closer to a coin-flip, so this one went your way — but don't expect that edge to hold without a clear signal."
      : "In a sideways market price keeps reversing, so big directional bets get chopped up — waiting for a clean edge usually scores better here.";
  }
  if (regime === "trending") {
    return correct
      ? "The market was trending, so trading with the move was the higher-odds read."
      : "The market was trending the other way — fighting the trend is the hardest way to win.";
  }
  if (regime === "high_vol") {
    return "Fast, high-volatility markets can lurch far in either direction, so size small and keep stops sensible.";
  }
  return "Quiet markets make for small moves, so the edge is thin either way.";
}

// Plain-language glosses for the jargon, used by the <Gloss> tooltip component.
export const GLOSS: Record<string, string> = {
  R: "“R” is one risk-unit — the distance from your entry to your stop, in money. +1R means you made what you risked; −1R means you lost it. So +0.28R means you keep about a quarter of one risk-unit, on average, per trade.",
  rr: "Risk-to-reward. 2:1 means you're aiming to make twice what you'd lose if the stop hits — risk 1 to make 2.",
  confluence:
    "Confluence = how many reasons line up for the trade (structure, timing, price action…). More boxes ticked means a higher-quality setup — not a guarantee.",
  factors:
    "Each factor is one reason the setup qualifies — the base trigger, market structure, timing, and price-action confirmation. More ticked = stronger.",
  expectancy:
    "Expectancy is the average result per trade over many tries, measured in R (risk-units). +0.28R over 2,000+ trades means a small average edge — proven on synthetic data, not a promise of live profit.",
  contracts:
    "Contracts = how many units you'd buy or sell. It's sized so that if your stop gets hit you lose only a small set % of your practice money — never the whole account.",
  threshold:
    "The minimum quality score a setup must beat to count as “qualified.” Below it, the engine stays out.",
  vwap:
    "VWAP is the volume-weighted average price for the day — a fair-value line. Price stretched far from it often drifts back toward it.",
  winRate:
    "Win rate = the share of trades that made money. On its own it's misleading — a 40% win rate can still be profitable if the wins are bigger than the losses (that's what R and expectancy capture).",
};
