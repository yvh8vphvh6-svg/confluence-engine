import { create } from "zustand";

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
};

type Store = {
  connection: ConnectionState;
  stream: StreamState;
  error: string;
  meta: StreamMeta | null;
  latestTick: SimulationTick | null;
  frame: { token: number; candles: OHLCPoint[] } | null;
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
};

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
  config: {
    symbol: "MNQ",
    timeframe: "5m",
    seed: 42,
    strategies: [...ALL_STRATEGIES],
    regime_filter: null,
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
  setLearnOpen: (learnOpen) => set({ learnOpen }),
  setTourOpen: (tourOpen) => set({ tourOpen }),
  setTeach: (teach) => set({ teach }),
  setAutoPause: (autoPause) => set({ autoPause }),
  setConnection: (connection) => set({ connection }),
  setStream: (stream, error = "") => set({ stream, error }),
  setMeta: (meta) => set({ meta, paperStart: meta.starting_balance }),
  receiveTick: (latestTick) => set({ latestTick }),
  receiveFrame: (t) =>
    set((s) => ({
      latestTick: t,
      frame: { token: (s.frame?.token ?? 0) + 1, candles: t.candles ?? [] },
    })),
  setConfig: (patch) => set((s) => ({ config: { ...s.config, ...patch } })),
  toggleOverlay: (k) =>
    set((s) => ({ overlayToggles: { ...s.overlayToggles, [k]: !s.overlayToggles[k] } })),
  openInspector: (inspector) => set({ inspector }),
  setManualMode: (manualMode) => set({ manualMode }),
  takePaper: (paperPosition) => set({ paperPosition, skippedKey: null }),
  skipSetup: (skippedKey) => set({ skippedKey }),
  closePaper: (exit, reason, closedAt, bar) => {
    const s = useStore.getState();
    const p = s.paperPosition;
    if (!p) return null;
    const dir = p.direction === "long" ? 1 : -1;
    const pv = pointValue(s.meta);
    const pnl = (exit - p.entry) * dir * pv * p.contracts;
    const risk = Math.abs(p.entry - p.stop);
    const r = risk > 0 ? ((exit - p.entry) * dir) / risk : 0;
    const trade: PaperTrade = {
      strategy: p.strategy,
      direction: p.direction,
      entry: p.entry,
      exit: Number(exit.toFixed(4)),
      stop: p.stop,
      target: p.target,
      contracts: p.contracts,
      r_multiple: Number(r.toFixed(4)),
      pnl_dollars: Number(pnl.toFixed(2)),
      exit_reason: reason,
      regime: p.regime,
      opened_at: p.openedAt,
      closed_at: closedAt,
    };
    set({
      paperPosition: null,
      paperBalance: Number((s.paperBalance + pnl).toFixed(2)),
      paperTrades: [...s.paperTrades, trade],
    });
    return trade;
  },
  resetPaper: () =>
    set((s) => ({ paperBalance: s.paperStart, paperPosition: null, paperTrades: [] })),
}));
