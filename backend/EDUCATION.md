# Trader's Reference — Indicators, Strategies, Liquidity, and the Evidence

This is the reference material behind the engine. It exists so the tool teaches
something true, not just something that looks good on a chart. Read the reality
check first — it's the most important section.

---

## 1. Reality check (start here)

Day trading is overwhelmingly a losing activity, and the best peer-reviewed data
say so plainly. This isn't pessimism; it's the base rate you're betting against.

- In a 15-year study of **every** day trader on the Taiwan Stock Exchange
  (1992–2006), **less than 1%** were able to predictably and reliably earn
  positive returns net of fees; in a typical year only ~17–20% finished with
  positive net returns. (Barber, Lee, Liu & Odean, *Journal of Financial
  Markets*, 2014.)
- Following ~20,000 individuals who started day trading Brazilian equity-index
  **futures** (the same kind of instrument this tool simulates), **97%** of those
  who persisted past 300 days **lost money**; only ~1% out-earned the minimum wage,
  and the researchers found **no evidence of learning** with experience. (Chague,
  De-Losso & Giovannetti, 2020.)

What this means for how you use this tool: the goal is not to find a strategy with
a pretty equity curve. It's to find an edge that survives costs, slippage, a large
sample, out-of-sample data, and randomized sequencing — and most won't. The engine
is built to *disprove* edges efficiently so you don't risk money discovering the
same thing the hard way.

---

## 2. Indicators: which earn their place, and which don't

An indicator is just a transformation of price/volume you already have. It can
organize information; it cannot add information that isn't in the data. Two
practical rules:

1. **Most indicators are redundant with each other.** RSI, stochastics, MACD,
   CCI, Williams %R are all momentum re-skins. Stacking five of them isn't five
   confirmations — it's one noisy signal counted five times. Pick one per *job*.
2. **Lagging vs. leading is mostly marketing.** Nearly everything derived from
   past prices lags. "Leading" oscillators lead by being twitchier, which means
   more false signals. There's no free lunch.

### The short list this engine actually uses, and why

| Indicator | Job | Verdict | Notes |
|---|---|---|---|
| **ATR** | volatility / position sizing / stops | **Keep.** Not a signal, but the backbone of risk. Size and stop distance should scale with ATR, not be fixed. |
| **VWAP** (session) | fair-value reference / institutional benchmark | **Keep.** Strong as a *reference* and execution benchmark. Weak as a standalone buy/sell trigger. |
| **ADX / DI** | regime detection (trend vs. range) | **Keep, as a filter.** Bad as an entry trigger; good for deciding *which* strategy is even allowed to fire. |
| **EMA (20/50)** | trend direction / dynamic pullback zone | **Keep, one or two.** Useful for "trade with the trend." Don't run a rainbow of ten. |
| **RSI** | momentum / exhaustion in ranges | **Situational.** Useful for mean-reversion timing in a confirmed range; misleading in a strong trend (stays "overbought" for a long time). |

### Overrated / easy to misuse
- **MACD, stochastics, CCI, Williams %R** — pick at most one momentum read; they
  mostly agree with RSI.
- **Bollinger Bands** — fine as a volatility envelope (it's basically ATR/σ in
  disguise), commonly over-interpreted as a reversal signal.
- **Fibonacci levels** — useful as *zones people watch* (partly self-fulfilling),
  not as physics. The engine treats the 0.618–0.786 area ("OTE") as a confluence
  factor, not a guarantee.
- **Anything with many tunable parameters** — the more knobs, the easier it is to
  curve-fit a beautiful backtest that fails live. Prefer few, robust parameters.

**Bottom line:** one volatility tool (ATR), one trend/regime tool (ADX or EMA
slope), one location reference (VWAP and/or prior-day levels), and at most one
momentum tool (RSI). That covers every job. More than that is decoration.

---

## 3. Strategy families and what they're for

The engine implements eight strategies across these families. Each is matched to a
market **regime** — the single biggest determinant of whether a setup works.

- **Opening Range Breakout (ORB)** — define the first N minutes' high/low, trade
  the break. *Best in:* trend/expansion days. *Fails in:* chop (false breaks).
  Among the more studied retail setups, with some published support when paired
  with strict risk control, but highly sensitive to costs.
- **Breakout–Retest (price action)** — trade a broken prior-day high/low only
  after it holds on a retest. *Best in:* trending days. Filters many false breaks
  at the cost of missed moves.
- **EMA Trend Pullback** — buy pullbacks to a rising EMA in an established uptrend
  (and vice versa). *Best in:* trends. Simple, robust, regime-dependent.
- **VWAP Mean Reversion** — fade stretched moves back toward VWAP. *Best in:*
  ranges/low-volatility. *Dangerous in:* trends (you're fighting the move).
- **Smart Money Concepts / ICT family** — Fair Value Gaps (FVG), Order Blocks
  (OB), Break of Structure (BOS) continuation, and Liquidity Sweeps. Honest
  framing below.

### On SMC / ICT specifically
Smart Money Concepts and the "ICT" methodology are enormously popular online and
are built around real, observable microstructure ideas: imbalances (gaps), zones
of prior aggression (order blocks), and stop-hunts around obvious liquidity (prior
highs/lows). The mechanics the engine detects are well-defined and testable.

The caveat: the *branded* framework is largely taught through courses and social
media, and there is little independent, peer-reviewed evidence that its specific
rules produce a durable edge net of costs. Treat FVG/OB/BOS as **structured ways
to locate entries**, then demand the same statistical proof you'd demand of
anything else. This tool lets you do exactly that — and on synthetic data most of
these come out break-even-to-negative after costs, which should calibrate your
expectations.

---

## 4. Price action & liquidity — what the engine detects

These are the structural objects the engine computes causally (no peeking ahead)
and uses as confluence:

- **Swing highs/lows** — confirmed and *lagged* by their lookback, so a swing only
  exists once it could actually be known in real time.
- **Fair Value Gap (FVG)** — a 3-candle imbalance where price moved so fast it left
  an untraded gap; often partially "filled" later.
- **Order Block (OB)** — the last opposing candle before an impulsive move; a zone
  where resting orders may sit.
- **Break of Structure (BOS)** — price taking out a confirmed prior swing,
  signaling possible continuation.
- **Liquidity pools / sweeps** — clusters of likely stops just beyond obvious
  highs/lows (prior-day high/low, session high/low). A "sweep" pokes through to
  trigger those stops and then reverses.
- **Prior-Day High/Low (PDH/PDL)** and the **Opening Range** — the day's most-
  watched reference levels.
- **Killzones** — the higher-activity windows after the open (≈09:30–11:00 ET) and
  early afternoon (≈14:00–15:30 ET) used as a timing filter.

Liquidity is the unifying idea: markets move toward resting orders. Breakouts work
when they trigger a cascade of stops/entries; reversions work when a move runs out
of fuel near a reference. The engine encodes both views and lets the data referee.

---

## 5. How to actually validate a strategy

A green backtest is the *start* of due diligence, not the end. In order:

1. **Sample size** — aim for **n ≥ ~100** trades. Below that, results are noise.
2. **Costs & slippage included** — the engine models commission, ATR-scaled
   slippage, latency, partial fills, and rejections. A strategy that's only
   profitable with zero costs is not profitable.
3. **Expectancy, not win rate** — positive expectancy (R per trade) is the target;
   a 70% win rate with negative expectancy still bleeds.
4. **Monte-Carlo the sequence** — reshuffle the trade order 1000× and look at the
   p95 drawdown. The engine only flags `promote` when p95 max-drawdown < 15% **and**
   n ≥ 100. This is intentionally hard.
5. **Out-of-sample / walk-forward** — test on data the rules never "saw." (Needs a
   real data feed; see the data adapter note in the README.)
6. **Forward / paper test** — finally, prove it forward in real time before risking
   capital. Nothing above substitutes for this.

If a setup survives all six, you have a *candidate*. If it dies at any step — which
most do — you saved real money.

---

## 6. Sources & peer review

Verified, reputable starting points (verify details yourself; that's the point):

- Barber, B., Lee, Y., Liu, Y., & Odean, T. (2014). *The cross-section of
  speculator skill: Evidence from day trading.* Journal of Financial Markets, 18,
  1–24. (Less than 1% of day traders reliably profit net of fees.)
  https://faculty.haas.berkeley.edu/odean/papers/day%20traders/The%20Cross-Section%20of%20Speculator%20Skill.pdf
- Chague, F., De-Losso, R., & Giovannetti, B. (2020). *Day trading for a living?*
  SSRN 3423101. (97% of persistent index-futures day traders lost money.)
  https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3423101
- Barber, B., & Odean, T. (2000). *Trading is hazardous to your wealth.* Journal of
  Finance, 55(2). (The investors who trade most underperform the most.)
- Park, C., & Irwin, S. (2007). *What do we know about the profitability of
  technical analysis?* Journal of Economic Surveys, 21(4). (A broad survey: early
  evidence of profitability that weakened in later periods and after costs.)
- Regulator disclosures: brokers in the EU/UK are required to publish retail
  loss rates on leveraged products; the published figures commonly sit around
  70–85% of retail accounts losing money. Useful as a sanity anchor.

How to read trading research without fooling yourself: prefer large datasets and
full populations over hand-picked examples; be suspicious of any result that
ignores transaction costs; treat course/affiliate content and "verified" trade
rooms as marketing, not evidence; and remember survivorship bias — you only ever
see the winners post their results.

---

## 7. Books & further reading

Foundational and broadly respected (mix of skills, markets, and skepticism):

- *Trading and Exchanges* — Larry Harris. The serious grounding in market
  microstructure, liquidity, and order types. The "why markets move toward orders"
  book.
- *Technical Analysis of the Financial Markets* — John Murphy. The standard
  encyclopedic reference for the vocabulary, used critically.
- *Evidence-Based Technical Analysis* — David Aronson. How to test indicators
  statistically and avoid fooling yourself with data mining. Pairs directly with
  Section 5.
- *Reminiscences of a Stock Operator* — Edwin Lefèvre. Classic on trader
  psychology; a story, not a system.
- *Thinking, Fast and Slow* — Daniel Kahneman. The cognitive biases that quietly
  wreck discretionary trading.
- *Fooled by Randomness* / *The Black Swan* — Nassim Taleb. On mistaking luck for
  skill and underestimating tail risk — both endemic to trading.
- *Advances in Financial Machine Learning* — Marcos López de Prado. Advanced; the
  rigorous treatment of backtest overfitting, cross-validation, and why most
  backtests are false discoveries.

Use the booklist the way you should use this whole tool: as a way to get less
wrong, not as a promise of getting rich.
