// Backend base URL resolution:
//  1. NEXT_PUBLIC_API_URL (explicit override — e.g. a separate-service deploy)
//  2. dev: the local backend on :8000
//  3. production: "" → same-origin relative URLs (single-service deploy; the
//     FastAPI backend serves this static build, so /api/... is same host).
export function apiBaseUrl(): string {
  const override = process.env.NEXT_PUBLIC_API_URL;
  if (override) return override.replace(/\/$/, "");
  if (process.env.NODE_ENV === "development") return "http://localhost:8000";
  return "";
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${apiBaseUrl()}${path}`, { cache: "no-store", signal });
  if (!res.ok) throw new Error(`Backend returned ${res.status} for ${path}`);
  return (await res.json()) as T;
}

export type LeaderboardRow = {
  strategy: string;
  label: string;
  symbol: string;
  timeframe: string;
  n_trades: number;
  win_rate: number | null;
  profit_factor: number | null;
  expectancy_r: number | null;
  max_drawdown_pct: number | null;
  sharpe: number | null;
  net_pnl_dollars: number | null;
  mc_p95_dd_pct: number | null;
  promote: boolean;
  sufficient_sample: boolean;
};

export type StrategyRunStat = {
  symbol: string;
  timeframe: string;
  n_trades: number | null;
  win_rate: number | null;
  expectancy_r: number | null;
  profit_factor: number | null;
  max_drawdown_pct: number | null;
  sharpe: number | null;
  mc_p95_dd_pct: number | null;
  promote: boolean;
  sufficient_sample: boolean;
};

export type StrategyInfo = {
  name: string;
  label: string;
  family: string;
  best_regime: string;
  recommended_timeframes: string[];
  description: string;
  indicators_used: string[];
  total_trades: number;
  best_run: (StrategyRunStat & { promote: boolean }) | null;
  runs: StrategyRunStat[];
  by_regime?: Record<string, { n: number; win_rate: number | null; expectancy_r: number | null; sufficient_sample: boolean }>;
};

export type ValidationData = {
  available: boolean;
  days?: number;
  seed?: number;
  timeframes?: string[];
  total_runs?: number;
  promoted?: number;
  sufficient?: number;
  runs: {
    strategy: string;
    label: string;
    symbol: string;
    timeframe: string;
    metrics: Record<string, number | boolean | null>;
    monte_carlo: Record<string, number | boolean | null>;
    by_regime: Record<string, { n: number; win_rate: number | null; expectancy_r: number | null }>;
  }[];
};

export type Health = { status: string; memory?: string; sweep_complete?: boolean };

export const getLeaderboard = (s?: AbortSignal) =>
  getJson<{ ready: boolean; rows: LeaderboardRow[] }>("/api/leaderboard", s);
export const getStrategies = (s?: AbortSignal) =>
  getJson<{ ready: boolean; strategies: StrategyInfo[] }>("/api/strategies", s);
export const getStrategy = (name: string, s?: AbortSignal) =>
  getJson<StrategyInfo>(`/api/strategies/${name}`, s);
export const getValidation = (s?: AbortSignal) => getJson<ValidationData>("/api/validation", s);
export const getReadiness = (s?: AbortSignal) => getJson<Health>("/readyz", s);

async function postJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${apiBaseUrl()}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal,
  });
  if (!res.ok) throw new Error(`Backend returned ${res.status} for ${path}`);
  return (await res.json()) as T;
}

export type CoachResponse = {
  text: string;
  discipline_flags: string[];
  disclaimer: string;
  source: "claude" | "rules";
  reason?: string;
};

export const postCoach = (body: unknown, s?: AbortSignal) =>
  postJson<CoachResponse>("/api/coach", body, s);

// Keep in sync with backend.journal.MISTAKE_TAGS
export const MISTAKE_TAGS = [
  "FOMO", "moved stop", "oversized", "traded news", "revenge",
  "off-plan", "early entry", "late entry",
] as const;

export type JournalTrade = {
  id: number;
  strategy: string;
  direction: string;
  regime: string;
  entry_price: number;
  exit_price: number;
  r_multiple: number;
  pnl_dollars: number;
  exit_reason: string;
  opened_at: string;
  closed_at: string;
  emotion: string;
  mistakes: string;
  note: string;
  created_at: string;
};

export type JournalNote = {
  id: number;
  text: string;
  emotion: string;
  trade_id: number | null;
  created_at: string;
};

export type JournalSession = {
  id: number;
  created_at: string;
  mood: string;
  confidence: number;
  goals: string;
  notes: string;
};

export type JournalStats = {
  n: number;
  wins: number;
  losses: number;
  breakeven: number;
  win_rate: number | null;
  expectancy_r: number | null;
  avg_win_r: number | null;
  avg_loss_r: number | null;
  profit_factor: number | null;
  net_pnl: number;
  max_drawdown_r: number;
  avg_hold_min: number | null;
  streaks: { current: number; best_win: number; best_loss: number };
  by_exit: Record<string, number>;
  by_emotion: Record<string, { n: number; avg_r: number }>;
  by_strategy: Record<string, { n: number; avg_r: number; win_rate: number }>;
  by_mistake: Record<string, number>;
  mistakes: string[];
};

export type WeeklyReview = {
  week: string;
  n: number;
  win_rate: number | null;
  expectancy_r: number | null;
  best_strategy: string | null;
  repeated_mistake: string | null;
  expectancy_delta_vs_prev: number | null;
};

export type JournalData = {
  trades: JournalTrade[];
  notes: JournalNote[];
  sessions: JournalSession[];
  stats: JournalStats;
  weekly: WeeklyReview[];
};

export const getJournal = (s?: AbortSignal) => getJson<JournalData>("/api/journal", s);
export const logPaperTrade = (trade: Record<string, unknown>) =>
  postJson<{ id: number }>("/api/journal/trade", trade);
export const addJournalNote = (note: Record<string, unknown>) =>
  postJson<{ id: number }>("/api/journal/note", note);
export const addJournalSession = (sess: Record<string, unknown>) =>
  postJson<{ id: number }>("/api/journal/session", sess);

// --- decision-point training ---
export type DecisionScenario = {
  id: string;
  difficulty: string;
  symbol: string;
  timeframe: string;
  decision_index: number;
  candles: { time: number; open: number; high: number; low: number; close: number }[];
  atr: number;
  regime: string;
  suggested_stop_pts: number;
  suggested_target_pts: number;
  last_close: number;
};
export type DecisionStats = {
  n: number;
  accuracy: number | null;
  avg_score: number | null;
  by_difficulty: Record<string, { n: number; accuracy: number; avg_score: number }>;
};
export type DecisionResult = {
  reveal: { time: number; open: number; high: number; low: number; close: number }[];
  decision_index: number;
  entry: number;
  outcome: string;
  r_multiple: number;
  direction_correct: boolean;
  direction_score: number;
  risk_score: number;
  total_score: number;
  forward_move: number;
  notes: string[];
  stats: DecisionStats;
};
export const getDecision = (difficulty: string, s?: AbortSignal) =>
  getJson<DecisionScenario>(`/api/decision/new?difficulty=${difficulty}`, s);
export const scoreDecision = (body: Record<string, unknown>) =>
  postJson<DecisionResult>("/api/decision/score", body);
export const getDecisionStats = (s?: AbortSignal) => getJson<DecisionStats>("/api/decision/stats", s);

// --- market context ---
export type MarketContext = {
  symbol: string; timeframe: string; synthetic: boolean; as_of: string;
  session: string; next_event: string; last_close: number; vwap: number; regime: string;
  prior_day: { high: number | null; low: number | null; close: number | null };
  overnight: { high: number; low: number; change_pts: number } | null;
  key_levels: { pdh: number | null; pdl: number | null; or_high: number | null; or_low: number | null; vwap: number };
  bias: string; bias_reasons: string[]; invalidation: string | null; disclaimer: string;
};
export const getContext = (symbol: string, timeframe: string, s?: AbortSignal) =>
  getJson<MarketContext>(`/api/context?symbol=${symbol}&timeframe=${timeframe}`, s);

// --- custom strategies ---
export type CustomStrategy = {
  name: string; family?: string; description?: string; conditions: string[];
  entry_trigger: string; stop_logic: string; target_rr: number; sizing: string;
  timeframes: string[]; notes?: string;
};
export const getCustomStrategies = (s?: AbortSignal) =>
  getJson<{ strategies: (CustomStrategy & { id: number })[] }>("/api/custom-strategies", s);
export const saveCustomStrategy = (body: CustomStrategy) =>
  postJson<{ id: number }>("/api/custom-strategies", body);
export const deleteCustomStrategy = async (name: string) => {
  await fetch(`${apiBaseUrl()}/api/custom-strategies/${encodeURIComponent(name)}`, { method: "DELETE" });
};

export type Condition = { key: string; label: string; ok: boolean; detail: string };

export type BacktestResult = {
  symbol: string;
  timeframe: string;
  strategy: string;
  label: string;
  family: string;
  best_regime: string;
  seed: number;
  days: number;
  session: string | null;
  bars: number;
  metrics: {
    n_trades: number;
    win_rate: number | null;
    expectancy_r: number | null;
    profit_factor: number | null;
    sharpe: number | null;
    max_drawdown_pct: number;
    max_drawdown_r: number | null;
    net_pnl_dollars: number | null;
    sufficient_sample: boolean;
  };
  monte_carlo: Record<string, number | boolean | null>;
  equity_curve_r: number[];
  conditions: Condition[];
  trades: {
    direction: string;
    entry_time: string;
    exit_time: string;
    entry_price: number;
    exit_price: number;
    r_multiple: number;
    pnl_dollars: number;
    exit_reason: string;
    regime_at_entry: string;
    bars_held: number;
  }[];
};

export const runBacktest = (body: Record<string, unknown>, s?: AbortSignal) =>
  postJson<BacktestResult>("/api/backtest", body, s);

export type RealChart =
  | {
      connected: true;
      delayed: boolean;
      source: string;
      symbol: string;
      proxy_symbol: string;
      timeframe: string;
      last_price: number | null;
      candles: { time: number; open: number; high: number; low: number; close: number; volume: number }[];
      note: string;
    }
  | { connected: false; reason: string; how_to_connect: string };

export const getRealChart = (symbol: string, timeframe: string, s?: AbortSignal) =>
  getJson<RealChart>(`/api/realchart?symbol=${symbol}&timeframe=${timeframe}`, s);
export const getInstruments = (s?: AbortSignal) =>
  getJson<{ instruments: { symbol: string; name: string }[]; timeframes: string[] }>(
    "/api/instruments",
    s,
  );
