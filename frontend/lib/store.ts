import { create } from "zustand";

import {
  computeQuality,
  computeWonLostFactors,
  type EntryCtx,
  type Prediction,
  type QualityScores,
  type WonLostFactor,
} from "./quality";
import { useSettings } from "./settings";

export type ConnectionState = "connecting" | "connected" | "disconnected" | "error";
export type StreamState = "idle" | "building" | "ready" | "error";
export type Regime = "trending" | "ranging" | "high_vol" | "low_vol";
export type Direction = "long" | "short" | "flat";
export type Side = "buy" | "sell";
export type OverlayKind = "FVG" | "OB" | "ORB" | "BOS" | "SWEEP";

export type OHLCPoint = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type IndicatorSnapshot = {
  atr_14: number;
  atr_expanded: boolean;
  adx_14: number;
  plus_di: number;
  minus_di: number;
  ema_20: number;
  ema_50: number;
  rsi_14: number;
  vwap: number;
  in_killzone: boolean;
};

export type ConfluenceView = {
  execute: boolean;
  confidence: number;
  threshold: number;
  missing_factors: string[];
  score_breakdown: Record<string, number>;
};

export type StrategySignalView = {
  name: string;
  label: string;
  family: string;
  best_regime: string;
  active: boolean;
  armed: boolean;
  direction: Direction;
  order_type: string | null;
  entry: number | null;
  stop: number | null;
  target: number | null;
  reason: string;
  factors: Record<string, boolean>;
  confluence: ConfluenceView | null;
  blocked_by_regime: boolean;
  regime_win_rate: number | null;
  regime_expectancy_r: number | null;
  regime_sample: number;
  score: number;
  recommended: boolean;
  qualified: boolean;
  evidence: string;
};

export type PositionView = {
  symbol: string;
  strategy: string;
  side: Side;
  direction: Direction;
  entry_price: number;
  stop: number;
  target: number;
  contracts: number;
  unrealized_pnl: number;
  unrealized_r: number;
  opened_at: string;
  bars_held: number;
  partial_taken: boolean;
  trailing: boolean;
};

export type TradeView = {
  strategy: string;
  direction: Direction;
  entry_time: string;
  exit_time: string;
  entry_price: number;
  exit_price: number;
  r_multiple: number;
  pnl_dollars: number;
  exit_reason: string;
  regime_at_entry: string;
  bars_held: number;
};

export type MetricsView = {
  bar_index: number;
  bars_total: number;
  elapsed_seconds: number;
  balance: number;
  equity: number;
  cumulative_pnl: number;
  daily_pnl: number;
  expectancy_r: number;
  win_rate: number;
  profit_factor: number | null;
  sharpe: number;
  trades: number;
  open_positions: number;
  max_drawdown_pct: number;
  max_drawdown_r: number;
  consecutive_losses: number;
  cooldown_bars_remaining: number;
  daily_stop_active: boolean;
  sufficient_sample: boolean;
  trades_today: number;
  equity_curve_r: number[];
};

export type OverlayView = {
  kind: OverlayKind;
  direction: Direction;
  start_time: number;
  end_time: number;
  low: number;
  high: number;
  label: string;
};

export type SimulationTick = {
  type: "tick" | "frame";
  symbol: string;
  timeframe: string;
  seed: number;
  bar_index: number;
  playing: boolean;
  ohlc: OHLCPoint;
  indicators: IndicatorSnapshot;
  regime: Regime;
  signal: Direction;
  active_strategy: string | null;
  signals: StrategySignalView[];
  confluence: ConfluenceView;
  position: PositionView | null;
  recent_trades: TradeView[];
  metrics: MetricsView;
  overlays: OverlayView[];
  data_source: "synthetic" | "live";
  news?: boolean; // bar falls in a synthetic news window (±15m of an event)
  best_setup: string | null;
  also_firing: string[];
  qualified_setup: string | null;
  candles?: OHLCPoint[];
};

export type Teach = { setup: string; bar: number };

export type StrategyMeta = {
  name: string;
  label: string;
  family: string;
  best_regime: string;
};

export type StreamMeta = {
  symbol: string;
  timeframe: string;
  seed: number;
  instrument: {
    symbol: string;
    name: string;
    point_value: number;
    tick_size: number;
    commission_per_side: number;
  };
  bars_total: number;
  first_index: number;
  armed: string[];
  regime_filter: string | null;
  data_source: "synthetic" | "live";
  starting_balance: number;
  // synthetic difficulty / clarity tier (textbook → real-market noise)
  difficulty?: string;
  difficulty_levels?: string[];
  clarity?: number;
  synthetic_label?: string;
  economic_calendar?: {
    date: string;
    time_et: string;
    kind: string;
    impact: string;
    direction: number;
    synthetic: boolean;
  }[];
  strategies: StrategyMeta[];
};

export type PaperPosition = {
  strategy: string;
  label: string;
  direction: Direction;
  entry: number;
  stop: number;
  target: number;
  contracts: number;
  rr: number;
  openedAt: string;
  openedBar: number;
  regime: string;
  // learning-loop context (captured at entry)
  prediction: Prediction | null;
  entryCtx: EntryCtx | null;
  snapshot: TradeSnapshot | null;
  // discipline context (captured at entry)
  wasPostTilt?: boolean;
  wasRevengeOverride?: boolean;
};

// pattern-library snapshot: the bar window + trade levels captured at entry so
// the thumbnail can be redrawn later (no live re-tracking needed).
export type TradeSnapshot = {
  bars: { time: number; open: number; high: number; low: number; close: number }[];
  entry: number;
  stop: number;
  target: number;
  direction: Direction;
  strategy: string;
  regime: string;
};

export type PaperTrade = {
  strategy: string;
  direction: Direction;
  entry: number;
  exit: number;
  stop: number;
  target: number;
  contracts: number;
  r_multiple: number;
  pnl_dollars: number;
  exit_reason: string;
  regime: string;
  opened_at: string;
  closed_at: string;
  // learning-loop fields
  prediction: Prediction | null;
  quality: QualityScores | null;
  wonLostFactors: WonLostFactor[];
  snapshot: TradeSnapshot | null;
  // discipline fields
  wasPostTilt: boolean;
  wasRevengeOverride: boolean;
  preEmotionalState: string;
  postTradeFeeling: string;
};

// live counters for the current practice session (powers the session review)
export type SessionStats = {
  startedAt: number;
  setupsSeen: number;
  taken: number;
  wins: number;
  losses: number;
  skippedQualified: number;
  missedR: number;
  qualitySum: number;
  qualityCount: number;
  lossStreak: number; // consecutive losing paper trades (tilt signal)
  rSum: number; // cumulative R this session (max-daily-loss signal)
};

export type OverlayToggles = Record<OverlayKind, boolean>;

export const ALL_STRATEGIES = [
  "ORB",
  "FVG_RETEST",
  "OB_RETEST",
  "BOS_CONTINUATION",
  "BREAKOUT_RETEST",
  "VWAP_REVERSION",
  "EMA_TREND_PULLBACK",
  "LIQUIDITY_SWEEP",
] as const;

export type SimConfig = {
  symbol: string;
  timeframe: string;
  seed: number;
  strategies: string[];
  regime_filter: Regime | null;
  difficulty: string; // novice | apprentice | journeyman | master (synthetic clarity tier)
};

type Store = {
  connection: ConnectionState;
  stream: StreamState;
  error: string;
  meta: StreamMeta | null;
  latestTick: SimulationTick | null;
  frame: { token: number; candles: OHLCPoint[] } | null;
  recentBars: OHLCPoint[]; // rolling window for pattern-library snapshots
  config: SimConfig;
  overlayToggles: OverlayToggles;
  inspector: StrategySignalView | null;
  learnOpen: boolean;
  tourOpen: boolean;
  teach: Teach | null;
  autoPause: boolean;
  // manual / practice paper trading
  manualMode: boolean;
  paperStart: number;
  paperBalance: number;
  paperPosition: PaperPosition | null;
  paperTrades: PaperTrade[];
  skippedKey: string | null;
  lastClosed: PaperTrade | null; // drives the post-trade card
  lastClosedId: number | null; // backend id of the logged trade (for the feeling update)
  session: SessionStats;
  // discipline layer (live, per-session)
  preEmotionalState: string | null;
  preSessionAnswered: boolean;
  tiltCooldownUntil: number; // ms epoch; 0 = no active cooldown
  lockedOut: boolean; // max daily loss hit this session
  pendingRevengeOverride: boolean; // armed by "Take anyway" during a cooldown
  setLearnOpen: (open: boolean) => void;
  setTourOpen: (open: boolean) => void;
  setTeach: (t: Teach | null) => void;
  setAutoPause: (on: boolean) => void;
  setConnection: (c: ConnectionState) => void;
  setStream: (s: StreamState, error?: string) => void;
  setMeta: (m: StreamMeta) => void;
  receiveTick: (t: SimulationTick) => void;
  receiveFrame: (t: SimulationTick) => void;
  setConfig: (patch: Partial<SimConfig>) => void;
  toggleOverlay: (k: OverlayKind) => void;
  openInspector: (s: StrategySignalView | null) => void;
  setManualMode: (on: boolean) => void;
  takePaper: (p: PaperPosition) => void;
  skipSetup: (key: string) => void;
  closePaper: (exit: number, reason: string, closedAt: string, bar: number) => PaperTrade | null;
  resetPaper: () => void;
  // learning-loop session tracking + post-trade card
  noteSetupSeen: () => void;
  noteSkippedQualified: (rPotential: number) => void;
  dismissPostTrade: () => void;
  resetSession: () => void;
  // discipline actions
  setPreEmotionalState: (state: string) => void;
  dismissPreSession: () => void;
  startTiltCooldown: (minutes: number) => void;
  endTiltCooldown: () => void;
  armRevengeOverride: () => void;
  setLastClosedId: (id: number | null) => void;
  setLastClosedFeeling: (feeling: string) => void;
};

// Maps a closed paper trade (with prediction + quality) to the backend
// /journal/trade payload. Shared by the manual and auto-close paths.
export function tradeLogPayload(
  t: PaperTrade,
  symbol: string,
  timeframe: string,
  extra: { emotion?: string; mistakes?: string[] } = {},
): Record<string, unknown> {
  return {
    symbol,
    timeframe,
    strategy: t.strategy,
    direction: t.direction,
    regime: t.regime,
    entry_price: t.entry,
    exit_price: t.exit,
    stop: t.stop,
    target: t.target,
    contracts: t.contracts,
    r_multiple: t.r_multiple,
    pnl_dollars: t.pnl_dollars,
    exit_reason: t.exit_reason,
    opened_at: t.opened_at,
    closed_at: t.closed_at,
    emotion: extra.emotion ?? "",
    mistakes: extra.mistakes ?? [],
    predicted_direction: t.prediction?.dir ?? "",
    prediction_correct: t.prediction?.correct ?? null,
    confidence: t.prediction?.confidence ?? null,
    decision_ms: t.prediction?.decisionMs ?? null,
    take_skip_rationale: t.prediction?.rationale ?? "",
    quality: t.quality
      ? { setup: t.quality.setup, risk: t.quality.risk, execution: t.quality.execution, outcome: t.quality.outcome, total: t.quality.total }
      : null,
    won_lost_factors: t.wonLostFactors,
    snapshot: t.snapshot,
    post_trade_feeling: t.postTradeFeeling ?? "",
    was_post_tilt: t.wasPostTilt,
    was_revenge_override: t.wasRevengeOverride,
    pre_emotional_state: t.preEmotionalState ?? "",
  };
}

const FRESH_SESSION = (startedAt: number): SessionStats => ({
  startedAt,
  setupsSeen: 0,
  taken: 0,
  wins: 0,
  losses: 0,
  skippedQualified: 0,
  missedR: 0,
  qualitySum: 0,
  qualityCount: 0,
  lossStreak: 0,
  rSum: 0,
});

function pointValue(meta: StreamMeta | null): number {
  return meta?.instrument.point_value ?? 1;
}

export const useStore = create<Store>((set) => ({
  connection: "connecting",
  stream: "idle",
  error: "",
  meta: null,
  latestTick: null,
  frame: null,
  recentBars: [],
  config: {
    symbol: "MNQ",
    timeframe: "5m",
    seed: 42,
    strategies: [...ALL_STRATEGIES],
    regime_filter: null,
    difficulty: "apprentice",
  },
  overlayToggles: { FVG: true, OB: true, ORB: true, BOS: true, SWEEP: true },
  inspector: null,
  learnOpen: false,
  tourOpen: false,
  teach: null,
  autoPause: true,
  manualMode: true,
  paperStart: 50_000,
  paperBalance: 50_000,
  paperPosition: null,
  paperTrades: [],
  skippedKey: null,
  lastClosed: null,
  lastClosedId: null,
  session: FRESH_SESSION(Date.now()),
  preEmotionalState: null,
  preSessionAnswered: false,
  tiltCooldownUntil: 0,
  lockedOut: false,
  pendingRevengeOverride: false,
  setLearnOpen: (learnOpen) => set({ learnOpen }),
  setTourOpen: (tourOpen) => set({ tourOpen }),
  setTeach: (teach) => set({ teach }),
  setAutoPause: (autoPause) => set({ autoPause }),
  setConnection: (connection) => set({ connection }),
  setStream: (stream, error = "") => set({ stream, error }),
  setMeta: (meta) => set({ meta, paperStart: meta.starting_balance }),
  receiveTick: (latestTick) =>
    set((s) => {
      const bar = latestTick.ohlc;
      const prev = s.recentBars;
      const last = prev[prev.length - 1];
      // replace the forming bar (same time) or append a new one; cap the window
      const merged = last && last.time === bar.time ? [...prev.slice(0, -1), bar] : [...prev, bar];
      return { latestTick, recentBars: merged.slice(-120) };
    }),
  receiveFrame: (t) =>
    set((s) => ({
      latestTick: t,
      frame: { token: (s.frame?.token ?? 0) + 1, candles: t.candles ?? [] },
      recentBars: (t.candles ?? []).slice(-120),
    })),
  setConfig: (patch) => set((s) => ({ config: { ...s.config, ...patch } })),
  toggleOverlay: (k) =>
    set((s) => ({ overlayToggles: { ...s.overlayToggles, [k]: !s.overlayToggles[k] } })),
  openInspector: (inspector) => set({ inspector }),
  setManualMode: (manualMode) => set({ manualMode }),
  takePaper: (paperPosition) =>
    set((s) => ({ paperPosition, skippedKey: null, pendingRevengeOverride: false, session: { ...s.session, taken: s.session.taken + 1 } })),
  skipSetup: (skippedKey) => set({ skippedKey }),
  closePaper: (exit, reason, closedAt, bar) => {
    const s = useStore.getState();
    const p = s.paperPosition;
    if (!p) return null;
    const dirSign = p.direction === "long" ? 1 : -1;
    const pv = pointValue(s.meta);
    const pnl = (exit - p.entry) * dirSign * pv * p.contracts;
    const risk = Math.abs(p.entry - p.stop);
    const r = risk > 0 ? ((exit - p.entry) * dirSign) / risk : 0;
    const rMultiple = Number(r.toFixed(4));
    // compute trade quality + won/lost heuristic from real entry context
    const quality = computeQuality({
      entryCtx: p.entryCtx,
      entry: p.entry,
      stop: p.stop,
      target: p.target,
      exit,
      exitReason: reason,
      contracts: p.contracts,
      pointValue: pv,
      rMultiple,
    });
    const wonLostFactors = computeWonLostFactors(p.entryCtx);
    const trade: PaperTrade = {
      strategy: p.strategy,
      direction: p.direction,
      entry: p.entry,
      exit: Number(exit.toFixed(4)),
      stop: p.stop,
      target: p.target,
      contracts: p.contracts,
      r_multiple: rMultiple,
      pnl_dollars: Number(pnl.toFixed(2)),
      exit_reason: reason,
      regime: p.regime,
      opened_at: p.openedAt,
      closed_at: closedAt,
      prediction: p.prediction,
      quality,
      wonLostFactors,
      snapshot: p.snapshot,
      wasPostTilt: Boolean(p.wasPostTilt),
      wasRevengeOverride: Boolean(p.wasRevengeOverride),
      preEmotionalState: s.preEmotionalState ?? "",
      postTradeFeeling: "",
    };
    // discipline accounting from the user's OWN paper trades (not the engine sim)
    const lossStreak = rMultiple > 0 ? 0 : s.session.lossStreak + 1;
    const rSum = Number((s.session.rSum + rMultiple).toFixed(4));
    const maxLossR = useSettings.getState().settings.maxDailyLossR;
    const lockedOut = s.lockedOut || (maxLossR > 0 && rSum <= -maxLossR);
    set({
      paperPosition: null,
      paperBalance: Number((s.paperBalance + pnl).toFixed(2)),
      paperTrades: [...s.paperTrades, trade],
      lastClosed: trade,
      lastClosedId: null,
      lockedOut,
      session: {
        ...s.session,
        wins: s.session.wins + (rMultiple > 0 ? 1 : 0),
        losses: s.session.losses + (rMultiple < 0 ? 1 : 0),
        qualitySum: s.session.qualitySum + quality.total,
        qualityCount: s.session.qualityCount + 1,
        lossStreak,
        rSum,
      },
    });
    return trade;
  },
  resetPaper: () =>
    set((s) => ({
      paperBalance: s.paperStart,
      paperPosition: null,
      paperTrades: [],
      lastClosed: null,
      lastClosedId: null,
      session: FRESH_SESSION(Date.now()),
      preEmotionalState: null,
      preSessionAnswered: false,
      tiltCooldownUntil: 0,
      lockedOut: false,
      pendingRevengeOverride: false,
    })),
  noteSetupSeen: () => set((s) => ({ session: { ...s.session, setupsSeen: s.session.setupsSeen + 1 } })),
  noteSkippedQualified: (rPotential) =>
    set((s) => ({
      session: {
        ...s.session,
        skippedQualified: s.session.skippedQualified + 1,
        missedR: Number((s.session.missedR + Math.max(0, rPotential)).toFixed(2)),
      },
    })),
  dismissPostTrade: () => set({ lastClosed: null }),
  resetSession: () =>
    set({
      session: FRESH_SESSION(Date.now()),
      preEmotionalState: null,
      preSessionAnswered: false,
      tiltCooldownUntil: 0,
      lockedOut: false,
      pendingRevengeOverride: false,
    }),
  // --- discipline ---
  setPreEmotionalState: (state) => set({ preEmotionalState: state, preSessionAnswered: true }),
  dismissPreSession: () => set({ preSessionAnswered: true }),
  startTiltCooldown: (minutes) => set({ tiltCooldownUntil: Date.now() + Math.max(1, minutes) * 60_000 }),
  // ending a cooldown clears the loss streak so the same warning doesn't re-fire immediately
  endTiltCooldown: () => set((s) => ({ tiltCooldownUntil: 0, session: { ...s.session, lossStreak: 0 } })),
  // "Take anyway": end the cooldown, arm the override flag for the next entry
  armRevengeOverride: () =>
    set((s) => ({ tiltCooldownUntil: 0, pendingRevengeOverride: true, session: { ...s.session, lossStreak: 0 } })),
  setLastClosedId: (lastClosedId) => set({ lastClosedId }),
  setLastClosedFeeling: (feeling) =>
    set((s) => ({ lastClosed: s.lastClosed ? { ...s.lastClosed, postTradeFeeling: feeling } : null })),
}));
