// Structured educational content, transcribed from backend/EDUCATION.md.
// Rendered in the Education / Indicators / Sources / Books tabs. Kept as data
// (not a runtime markdown dep) so the build has no network/parse surprises.

export const REALITY_CHECK = {
  title: "Reality check — start here",
  body: [
    "Day trading is overwhelmingly a losing activity, and the best peer-reviewed data say so plainly. This isn't pessimism; it's the base rate you're betting against.",
    "In a 15-year study of every day trader on the Taiwan Stock Exchange (1992–2006), less than 1% were able to predictably and reliably earn positive returns net of fees; in a typical year only ~17–20% finished with positive net returns. (Barber, Lee, Liu & Odean, 2014.)",
    "Following ~20,000 individuals who started day trading Brazilian equity-index futures (the same kind of instrument this tool simulates), 97% of those who persisted past 300 days lost money; only ~1% out-earned the minimum wage, and the researchers found no evidence of learning with experience. (Chague, De-Losso & Giovannetti, 2020.)",
    "The goal is not to find a strategy with a pretty equity curve. It's to find an edge that survives costs, slippage, a large sample, out-of-sample data, and randomized sequencing — and most won't. This engine is built to disprove edges efficiently so you don't risk money discovering the same thing the hard way.",
  ],
};

export type IndicatorEntry = {
  name: string;
  job: string;
  verdict: "keep" | "situational" | "overrated";
  notes: string;
};

export const INDICATORS: IndicatorEntry[] = [
  {
    name: "ATR",
    job: "Volatility / position sizing / stops",
    verdict: "keep",
    notes:
      "Not a signal, but the backbone of risk. Size and stop distance should scale with ATR, not be fixed.",
  },
  {
    name: "VWAP (session)",
    job: "Fair-value reference / institutional benchmark",
    verdict: "keep",
    notes: "Strong as a reference and execution benchmark. Weak as a standalone buy/sell trigger.",
  },
  {
    name: "ADX / DI",
    job: "Regime detection (trend vs. range)",
    verdict: "keep",
    notes: "Bad as an entry trigger; good for deciding which strategy is even allowed to fire.",
  },
  {
    name: "EMA (20/50)",
    job: "Trend direction / dynamic pullback zone",
    verdict: "keep",
    notes: "Useful for trading with the trend. Don't run a rainbow of ten.",
  },
  {
    name: "RSI",
    job: "Momentum / exhaustion in ranges",
    verdict: "situational",
    notes:
      "Useful for mean-reversion timing in a confirmed range; misleading in a strong trend (stays overbought a long time).",
  },
  {
    name: "MACD / Stochastics / CCI / Williams %R",
    job: "Momentum",
    verdict: "overrated",
    notes: "Pick at most one momentum read; they mostly agree with RSI.",
  },
  {
    name: "Bollinger Bands",
    job: "Volatility envelope",
    verdict: "overrated",
    notes: "Fine as a volatility envelope (basically ATR/σ in disguise); commonly over-read as a reversal signal.",
  },
  {
    name: "Fibonacci / OTE",
    job: "Zones people watch",
    verdict: "situational",
    notes:
      "Useful as zones people watch (partly self-fulfilling), not as physics. The engine treats 0.618–0.786 (OTE) as a confluence factor, not a guarantee.",
  },
];

export const INDICATORS_BOTTOM_LINE =
  "One volatility tool (ATR), one trend/regime tool (ADX or EMA slope), one location reference (VWAP and/or prior-day levels), and at most one momentum tool (RSI). That covers every job. More than that is decoration.";

export const STRATEGY_FAMILIES = [
  {
    name: "Opening Range Breakout (ORB)",
    body: "Define the first N minutes' high/low, trade the break. Best in trend/expansion days; fails in chop (false breaks). Among the more studied retail setups, with some published support when paired with strict risk control, but highly sensitive to costs.",
  },
  {
    name: "Breakout–Retest (price action)",
    body: "Trade a broken prior-day high/low only after it holds on a retest. Best in trending days. Filters many false breaks at the cost of missed moves.",
  },
  {
    name: "EMA Trend Pullback",
    body: "Buy pullbacks to a rising EMA in an established uptrend (and vice versa). Best in trends. Simple, robust, regime-dependent.",
  },
  {
    name: "VWAP Mean Reversion",
    body: "Fade stretched moves back toward VWAP. Best in ranges/low-volatility. Dangerous in trends (you're fighting the move).",
  },
  {
    name: "Smart Money Concepts / ICT family",
    body: "Fair Value Gaps (FVG), Order Blocks (OB), Break of Structure (BOS) continuation, and Liquidity Sweeps. Built around real microstructure ideas — imbalances, zones of prior aggression, stop-hunts around obvious liquidity. The mechanics are well-defined and testable, but the branded framework is largely taught via courses/social media and has little independent peer-reviewed evidence of a durable edge net of costs. Treat them as structured ways to locate entries, then demand the same statistical proof you'd demand of anything else.",
  },
];

export const PRICE_ACTION_CONCEPTS = [
  { name: "Swing highs/lows", body: "Confirmed and lagged by their lookback, so a swing only exists once it could actually be known in real time." },
  { name: "Fair Value Gap (FVG)", body: "A 3-candle imbalance where price moved so fast it left an untraded gap; often partially filled later." },
  { name: "Order Block (OB)", body: "The last opposing candle before an impulsive move; a zone where resting orders may sit." },
  { name: "Break of Structure (BOS)", body: "Price taking out a confirmed prior swing, signaling possible continuation." },
  { name: "Liquidity pools / sweeps", body: "Clusters of likely stops just beyond obvious highs/lows. A sweep pokes through to trigger those stops and then reverses." },
  { name: "PDH/PDL & Opening Range", body: "The day's most-watched reference levels." },
  { name: "Killzones", body: "Higher-activity windows after the open (≈09:30–11:00 ET) and early afternoon (≈14:00–15:30 ET), used as a timing filter." },
];

export const VALIDATION_STEPS = [
  { step: "Sample size", body: "Aim for n ≥ ~100 trades. Below that, results are noise." },
  { step: "Costs & slippage included", body: "Commission, ATR-scaled slippage, latency, partial fills, and rejections are modeled. A strategy only profitable with zero costs is not profitable." },
  { step: "Expectancy, not win rate", body: "Positive expectancy (R per trade) is the target; a 70% win rate with negative expectancy still bleeds." },
  { step: "Monte-Carlo the sequence", body: "Reshuffle the trade order 1000× and look at the p95 drawdown. Promote only when p95 max-drawdown < 15% AND n ≥ 100." },
  { step: "Out-of-sample / walk-forward", body: "Test on data the rules never saw. (Needs a real data feed.)" },
  { step: "Forward / paper test", body: "Finally, prove it forward in real time before risking capital. Nothing above substitutes for this." },
];

export type Source = { citation: string; finding: string; url?: string };

export const SOURCES: Source[] = [
  {
    citation: "Barber, B., Lee, Y., Liu, Y., & Odean, T. (2014). The cross-section of speculator skill: Evidence from day trading. Journal of Financial Markets, 18, 1–24.",
    finding: "Less than 1% of day traders reliably profit net of fees.",
    url: "https://faculty.haas.berkeley.edu/odean/papers/day%20traders/The%20Cross-Section%20of%20Speculator%20Skill.pdf",
  },
  {
    citation: "Chague, F., De-Losso, R., & Giovannetti, B. (2020). Day trading for a living? SSRN 3423101.",
    finding: "97% of persistent index-futures day traders lost money.",
    url: "https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3423101",
  },
  {
    citation: "Barber, B., & Odean, T. (2000). Trading is hazardous to your wealth. Journal of Finance, 55(2).",
    finding: "The investors who trade most underperform the most.",
  },
  {
    citation: "Park, C., & Irwin, S. (2007). What do we know about the profitability of technical analysis? Journal of Economic Surveys, 21(4).",
    finding: "A broad survey: early evidence of profitability that weakened in later periods and after costs.",
  },
  {
    citation: "Regulator disclosures (EU/UK leveraged-product retail loss rates).",
    finding: "Published figures commonly sit around 70–85% of retail accounts losing money. A useful sanity anchor.",
  },
];

export const SOURCES_NOTE =
  "How to read trading research without fooling yourself: prefer large datasets and full populations over hand-picked examples; be suspicious of any result that ignores transaction costs; treat course/affiliate content and 'verified' trade rooms as marketing, not evidence; and remember survivorship bias — you only ever see the winners post their results.";

export type Book = { title: string; author: string; note: string };

export const BOOKS: Book[] = [
  { title: "Trading and Exchanges", author: "Larry Harris", note: "The serious grounding in market microstructure, liquidity, and order types. The 'why markets move toward orders' book." },
  { title: "Technical Analysis of the Financial Markets", author: "John Murphy", note: "The standard encyclopedic reference for the vocabulary, used critically." },
  { title: "Evidence-Based Technical Analysis", author: "David Aronson", note: "How to test indicators statistically and avoid fooling yourself with data mining." },
  { title: "Reminiscences of a Stock Operator", author: "Edwin Lefèvre", note: "Classic on trader psychology; a story, not a system." },
  { title: "Thinking, Fast and Slow", author: "Daniel Kahneman", note: "The cognitive biases that quietly wreck discretionary trading." },
  { title: "Fooled by Randomness / The Black Swan", author: "Nassim Taleb", note: "On mistaking luck for skill and underestimating tail risk — both endemic to trading." },
  { title: "Advances in Financial Machine Learning", author: "Marcos López de Prado", note: "Advanced; the rigorous treatment of backtest overfitting, cross-validation, and why most backtests are false discoveries." },
];

export const BOOKS_NOTE =
  "Use the booklist the way you should use this whole tool: as a way to get less wrong, not as a promise of getting rich.";
