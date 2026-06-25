"""Frontend data contract.

These Pydantic models are the exact shape streamed over the WebSocket and
returned by the REST endpoints. The live engine adapts the real engine's
outputs into these models so the UI has a stable, validated contract.
"""
from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field


class Regime(StrEnum):
    trending = "trending"
    ranging = "ranging"
    high_vol = "high_vol"
    low_vol = "low_vol"


class Direction(StrEnum):
    long = "long"
    short = "short"
    flat = "flat"


class Side(StrEnum):
    buy = "buy"
    sell = "sell"


class OverlayKind(StrEnum):
    fvg = "FVG"
    order_block = "OB"
    opening_range = "ORB"
    bos = "BOS"
    sweep = "SWEEP"


class OHLC(BaseModel):
    model_config = ConfigDict(frozen=True)

    time: int  # unix seconds (lightweight-charts native)
    open: float
    high: float
    low: float
    close: float
    volume: float


class IndicatorSnapshot(BaseModel):
    model_config = ConfigDict(frozen=True)

    atr_14: float
    atr_expanded: bool
    adx_14: float
    plus_di: float
    minus_di: float
    ema_20: float
    ema_50: float
    rsi_14: float
    vwap: float
    in_killzone: bool


class ConfluenceView(BaseModel):
    model_config = ConfigDict(frozen=True)

    execute: bool
    confidence: float
    threshold: float
    missing_factors: list[str]
    score_breakdown: dict[str, float]


class StrategySignalView(BaseModel):
    model_config = ConfigDict(frozen=True)

    name: str            # registry key, e.g. "ORB"
    label: str
    family: str
    best_regime: str
    active: bool         # emitted a candidate this bar
    armed: bool          # selected by the user
    direction: Direction
    order_type: str | None = None
    entry: float | None = None
    stop: float | None = None
    target: float | None = None
    reason: str = ""
    factors: dict[str, bool] = Field(default_factory=dict)
    confluence: ConfluenceView | None = None
    blocked_by_regime: bool = False
    # historical context (from the batch memory, current regime)
    regime_win_rate: float | None = None
    regime_expectancy_r: float | None = None
    regime_sample: int = 0
    # ranking + evidence gate
    score: float = 0.0
    recommended: bool = False
    qualified: bool = False
    evidence: str = ""


class PositionView(BaseModel):
    model_config = ConfigDict(frozen=True)

    symbol: str
    strategy: str
    side: Side
    direction: Direction
    entry_price: float
    stop: float
    target: float
    contracts: float
    unrealized_pnl: float
    unrealized_r: float
    opened_at: str
    bars_held: int
    partial_taken: bool
    trailing: bool


class TradeView(BaseModel):
    model_config = ConfigDict(frozen=True)

    strategy: str
    direction: Direction
    entry_time: str
    exit_time: str
    entry_price: float
    exit_price: float
    r_multiple: float
    pnl_dollars: float
    exit_reason: str
    regime_at_entry: str
    bars_held: int


class MetricsView(BaseModel):
    model_config = ConfigDict(frozen=True)

    bar_index: int
    bars_total: int
    elapsed_seconds: float
    balance: float
    equity: float
    cumulative_pnl: float
    daily_pnl: float
    expectancy_r: float
    win_rate: float
    profit_factor: float | None
    sharpe: float
    trades: int
    open_positions: int
    max_drawdown_pct: float
    max_drawdown_r: float
    consecutive_losses: int
    cooldown_bars_remaining: int
    daily_stop_active: bool
    sufficient_sample: bool
    trades_today: int
    equity_curve_r: list[float]


class OverlayView(BaseModel):
    model_config = ConfigDict(frozen=True)

    kind: OverlayKind
    direction: Direction
    start_time: int
    end_time: int
    low: float
    high: float
    label: str


class SimulationTick(BaseModel):
    model_config = ConfigDict(frozen=True)

    type: str = "tick"
    symbol: str
    timeframe: str
    seed: int
    bar_index: int
    playing: bool
    ohlc: OHLC
    indicators: IndicatorSnapshot
    regime: Regime
    signal: Direction          # primary direction (the armed position bias)
    active_strategy: str | None
    signals: list[StrategySignalView]
    confluence: ConfluenceView
    position: PositionView | None
    recent_trades: list[TradeView]
    metrics: MetricsView
    overlays: list[OverlayView]
    data_source: str = "synthetic"   # "synthetic" | "live"
    news: bool = False                # bar falls in a synthetic news window (±15m of an event)
    best_setup: str | None = None     # name of the single top-ranked actionable setup
    also_firing: list[str] = Field(default_factory=list)
    qualified_setup: str | None = None  # the genuinely-qualified setup (auto-pause / stable panel)
