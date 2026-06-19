"""Shared types for the simulation engine.

Everything that crosses a module boundary is a typed dataclass so the data
contract is explicit and mypy-checkable. No dicts-as-structs in hot paths.
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Optional


# --- instruments -----------------------------------------------------------

@dataclass(frozen=True)
class Instrument:
    """Contract spec. Costs are modelled in price/points, not 'shares'."""
    symbol: str
    name: str
    point_value: float        # $ per 1.0 move of price, per contract
    tick_size: float          # minimum price increment
    commission_per_side: float  # $ per contract per side (entry and exit each)
    # data-generation personality
    start_price: float
    annual_vol: float         # annualised vol used to scale the random walk
    intraday_drift: float     # tiny per-bar drift bias


MNQ = Instrument(
    symbol="MNQ",
    name="Micro E-mini Nasdaq-100",
    point_value=2.0,
    tick_size=0.25,
    commission_per_side=0.52,
    start_price=18000.0,
    annual_vol=0.32,
    intraday_drift=0.00,
)

MGC = Instrument(
    symbol="MGC",
    name="Micro Gold",
    point_value=10.0,
    tick_size=0.10,
    commission_per_side=0.52,
    start_price=2350.0,
    annual_vol=0.15,
    intraday_drift=0.00,
)

INSTRUMENTS: dict[str, Instrument] = {MNQ.symbol: MNQ, MGC.symbol: MGC}


# --- signals & confluence --------------------------------------------------

@dataclass
class ConfluenceResult:
    execute: bool
    confidence: float
    threshold: float
    missing_factors: list[str]
    score_breakdown: dict[str, float]


@dataclass
class Signal:
    """A candidate trade emitted by a strategy at one bar, pre-execution."""
    strategy: str
    direction: int                 # +1 long, -1 short
    entry: float                   # intended entry price
    stop: float                    # initial protective stop
    target: float                  # final take-profit
    order_type: str                # "market" | "limit"
    # confluence factor booleans (strict, no fuzzy matching)
    factors: dict[str, bool] = field(default_factory=dict)
    reason: str = ""               # human-readable rule stack


@dataclass
class Fill:
    price: float                   # executed price incl. slippage
    commission: float              # $ for this fill
    filled_fraction: float         # 1.0 = full, <1 = partial
    latency_ms: int
    rejected: bool = False
    reject_reason: str = ""


@dataclass
class Trade:
    strategy: str
    symbol: str
    timeframe: str
    direction: int
    entry_time: str
    exit_time: str
    entry_price: float
    exit_price: float
    risk_per_unit: float           # |entry - initial_stop| in price
    pnl_dollars: float
    r_multiple: float
    regime_at_entry: str
    confidence: float
    exit_reason: str               # "target" | "stop" | "trail" | "eod" | "partial+trail"
    bars_held: int

    def to_row(self) -> dict:
        return asdict(self)


@dataclass
class StrategyMeta:
    name: str
    label: str
    family: str                    # "breakout" | "smc" | "mean_reversion" | "trend"
    best_regime: str               # regime where edge is expected
    recommended_timeframes: list[str]
    description: str
    indicators_used: list[str]
