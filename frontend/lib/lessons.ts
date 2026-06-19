// Guided onboarding lessons. Plain-English explanations of every mode, panel,
// control and metric in the app. Content only — the modal renders it.

export type Lesson = {
  id: string;
  title: string;
  minutes: number;
  body: string[];      // paragraphs
  points?: { term: string; desc: string }[];  // labelled bullet list
};

export const LESSONS: Lesson[] = [
  {
    id: "orientation",
    title: "Orientation",
    minutes: 3,
    body: [
      "Welcome to Training Camp — a practice ground for learning futures trading with zero risk. Everything here is a SIMULATION on synthetic (computer-generated) data. No real money, no real orders, ever.",
      "The app has three main modes, in the top navigation:",
    ],
    points: [
      { term: "Practice", desc: "A live, streaming chart where you place your own paper trades and a coach talks you through them." },
      { term: "Backtest", desc: "Run one strategy over historical synthetic data and see exactly how it would have performed." },
      { term: "Real Chart", desc: "View actual (delayed) market data for the same instruments, clearly separated from the synthetic practice data." },
    ],
  },
  {
    id: "futures-101",
    title: "Futures 101",
    minutes: 5,
    body: [
      "Futures are contracts to buy or sell something at a set price later. This sim uses two 'micro' futures — small-sized contracts good for learning:",
      "You profit if price moves your way after you enter, and lose if it moves against you. A 'long' (buy) profits when price rises; a 'short' (sell) profits when price falls.",
      "The single most important habit: decide your STOP (where you're wrong and exit for a small loss) and your TARGET (where you take profit) BEFORE you enter. Risk a small, fixed fraction of your account on each trade — this app suggests 1%.",
    ],
    points: [
      { term: "MNQ — Micro E-mini Nasdaq-100", desc: "Tracks the Nasdaq-100 tech index. $2 per point, ticks of 0.25. Fast-moving." },
      { term: "MGC — Micro Gold", desc: "Tracks gold. $10 per point, ticks of 0.10. Smoother." },
      { term: "R (R-multiple)", desc: "Your result measured in units of risk. +2R means you made twice what you risked; −1R means you lost your planned risk." },
    ],
  },
  {
    id: "charts",
    title: "Using the Charts",
    minutes: 5,
    body: [
      "The candlestick chart is the heart of the app. Each candle is one bar of time (1m, 5m, 15m, 30m or 1h — pick in the left controls). Green candles closed up, red closed down; the thin wicks show the high and low.",
      "In Practice the chart streams bar by bar like a replay. Use the replay controls to Play/Pause, Step forward/back, and change Speed (0.25× to 8×). Slower is calmer and easier to read.",
      "The engine marks structure on the chart. You can toggle each overlay on/off above the chart to keep it readable:",
    ],
    points: [
      { term: "FVG (Fair Value Gap)", desc: "A 3-candle imbalance where price jumped, leaving a gap it often revisits." },
      { term: "OB (Order Block)", desc: "The last opposing candle before a strong move — a zone where orders may rest." },
      { term: "ORB (Opening Range)", desc: "The high/low of the first 15 minutes after the 09:30 cash open." },
      { term: "BOS (Break of Structure)", desc: "Price breaking a prior swing high/low — a sign of possible continuation." },
    ],
  },
  {
    id: "panels",
    title: "Reading the Panels",
    minutes: 6,
    body: [
      "Around the chart are panels that explain what's happening. The key ones:",
    ],
    points: [
      { term: "Best setup", desc: "The single highest-ranked setup the engine sees right now (confidence × backtested edge in this regime). Optional guidance — never required to trade." },
      { term: "Confluence gauge", desc: "How many of the four factors (Base, Structure, Timing, Price-action) line up, vs the threshold needed to 'execute'." },
      { term: "Regime", desc: "The current market character: trending, ranging, high-vol or low-vol. Strategies work in specific regimes." },
      { term: "Live performance", desc: "The engine's own running stats: equity, expectancy (R), win rate, profit factor, drawdown. Synthetic — proves the code, not a live edge." },
      { term: "Leaderboard", desc: "Strategies ranked by real backtested expectancy. 'n<100' means insufficient sample; the gate = Monte-Carlo p95 drawdown <15% AND n≥100." },
      { term: "Trade blotter", desc: "The engine's recent closed trades with R-multiples and exit reasons." },
    ],
  },
  {
    id: "strategies",
    title: "The Strategies",
    minutes: 5,
    body: [
      "The engine knows eight strategies across families — breakout, smart-money (SMC/ICT), trend, and mean-reversion. Each only expects an edge in a particular regime, and each emits four confluence factors.",
      "Open the Strategies tab for the full list with their family, best regime, recommended timeframes and real backtested stats. The big idea: a strategy is only 'recommended' if it cleared the statistical gate in the CURRENT regime — otherwise it's 'not enough evidence yet'.",
    ],
    points: [
      { term: "ORB / Breakout-Retest", desc: "Trade breaks of the opening range or prior-day levels. Best in trends." },
      { term: "FVG / OB / BOS / Liquidity Sweep", desc: "Smart-money concepts — entries located at imbalances, order blocks, structure breaks, and stop-hunts." },
      { term: "EMA Trend Pullback", desc: "Buy dips to a rising EMA in an uptrend (and vice versa). Trend regime." },
      { term: "VWAP Reversion", desc: "Fade stretched moves back to VWAP. Range regime only." },
    ],
  },
  {
    id: "manual",
    title: "Manual Trading",
    minutes: 5,
    body: [
      "In Practice you trade your own paper account, tracked separately from the engine. Use the Manual trading panel:",
      "You can place a market Buy or Sell AT ANY TIME — you do NOT need a 'qualified setup'. Set your stop and target (in points) and your size (the panel suggests a 1%-risk size). Click Buy or Sell.",
      "Your position is drawn on the chart (YOUR entry / stop / target lines), your unrealized P&L updates every bar, and the trade auto-closes if price hits your stop or target. You can also close manually any time. Every closed trade is saved to your Journal.",
    ],
    points: [
      { term: "Stop", desc: "Price where you exit for a controlled loss. Always set one." },
      { term: "Target", desc: "Price where you take profit. Target ÷ Stop = your reward:risk." },
      { term: "Size", desc: "Number of contracts. Bigger size = bigger swings. The 1%-risk suggestion keeps losses small." },
      { term: "Use suggestion", desc: "Pre-fills your order from the current best setup — still your choice to take it." },
    ],
  },
  {
    id: "risk-coach",
    title: "Risk & the Coach",
    minutes: 4,
    body: [
      "The Coach panel explains the current setup in plain English — what it is, which factors are present or missing, the backtested edge (with the synthetic-data caveat), the reward:risk, and the risk. You can also type a question to it.",
      "The coach is discipline-first: it warns you about overtrading, trading during a cooldown, or after the daily loss limit, and it NEVER promises profit or certainty. The engine itself enforces real risk controls — a −2R daily stop and a cooldown after consecutive losses.",
      "The honest truth, from peer-reviewed research: the large majority of day traders lose money. The goal of this tool is to help you get less wrong and protect capital — not to promise riches. This is not financial advice.",
    ],
  },
  {
    id: "backtest",
    title: "Backtesting",
    minutes: 4,
    body: [
      "The Backtest tab runs ONE strategy over historical synthetic data so you can study it cleanly. Pick an instrument, timeframe, strategy, a session start (London / NY open / power hour), a seed and a number of days, then Run.",
      "You'll get the trade list, an equity curve, the headline metrics, Monte-Carlo robustness, and a conditions-met checklist. Change the strategy and hit Reset to re-run cleanly from scratch. The same seed always reproduces the same result.",
    ],
  },
  {
    id: "validation",
    title: "Validation",
    minutes: 4,
    body: [
      "The Validation tab is where you pressure-test a strategy. Hit 'Run validation' on any strategy to see a yes/no checklist: Base signal, Structure, Timing/OTE, Price-action, Regime favorable, Sample n≥100, and the Monte-Carlo gate — plus the determinism proof and drawdown.",
      "A strategy 'passes' only if it clears n≥100 trades AND its Monte-Carlo p95 drawdown stays under 15%. This is deliberately hard. On synthetic data most strategies do NOT pass — which is exactly the lesson: demand real statistical proof before trusting anything.",
    ],
  },
  {
    id: "journal",
    title: "The Journal",
    minutes: 3,
    body: [
      "Every paper trade you take is auto-logged in the Journal with its strategy, regime, R result and exit reason. You can add free-text notes and tag how you felt (disciplined, fomo, revenge…).",
      "Over time the Journal shows your win rate, expectancy, exit-reason and emotion breakdowns, and flags recurring mistakes. Reviewing your own trades honestly is the single highest-leverage habit in trading.",
    ],
  },
];
