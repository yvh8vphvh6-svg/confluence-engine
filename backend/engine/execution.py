"""Execution realism layer.

All randomness flows through a single seeded numpy Generator so a given seed
reproduces identical fills bar-for-bar. Costs are expressed in price/points
and dollars via the instrument's point value.
"""
from __future__ import annotations

import logging

import numpy as np

from .types import Fill, Instrument

log = logging.getLogger("execution")


class ExecutionModel:
    def __init__(self, instrument: Instrument, seed: int,
                 news_bars: set[int] | None = None):
        self.inst = instrument
        self.rng = np.random.default_rng(seed)
        self.news_bars = news_bars or set()

    # -- spread / liquidity -------------------------------------------------

    def _base_spread(self, atr_v: float, ts_hour: int) -> float:
        """Half-spread in price. Widens near the open/close and on thin ATR."""
        spread = max(self.inst.tick_size, atr_v * 0.02)
        if ts_hour < 10 or ts_hour >= 15:   # open/close are wider
            spread *= 1.5
        return spread

    def _spread_multiplier(self, bar_index: int) -> float:
        """News windows (+/-15m of high-impact events) blow spreads out 2-5x."""
        if bar_index in self.news_bars:
            return float(self.rng.uniform(2.0, 5.0))
        return 1.0

    # -- main fill ----------------------------------------------------------

    def fill(self, *, direction: int, order_type: str, intended_price: float,
             atr_v: float, bar_index: int, ts_hour: int, bar_volume: float,
             avg_daily_volume: float, order_contracts: float = 1.0) -> Fill:
        latency_ms = int(self.rng.integers(50, 201))  # 50-200ms

        half_spread = self._base_spread(atr_v, ts_hour) * self._spread_multiplier(bar_index)
        normal_half = self._base_spread(atr_v, 12)

        # rejection: spread too wide or liquidity too thin
        if half_spread > 2.0 * normal_half:
            log.info("reject bar=%d reason=spread (%.4f > 2x %.4f)",
                     bar_index, half_spread, normal_half)
            return Fill(price=intended_price, commission=0.0, filled_fraction=0.0,
                        latency_ms=latency_ms, rejected=True, reject_reason="spread_too_wide")
        if bar_volume < 0.15 * avg_daily_volume / 390.0:  # < 15% of an avg minute
            log.info("reject bar=%d reason=liquidity", bar_index)
            return Fill(price=intended_price, commission=0.0, filled_fraction=0.0,
                        latency_ms=latency_ms, rejected=True, reject_reason="thin_liquidity")

        # slippage model: ATR-scaled, time-of-day, size impact, randomised
        atr_component = atr_v * float(self.rng.uniform(0.01, 0.06))
        tod_mult = 1.4 if (ts_hour < 10 or ts_hour >= 15) else 1.0
        size_frac = order_contracts / max(avg_daily_volume * 0.005, 1.0)
        size_impact = atr_v * 0.05 * size_frac
        slip = (atr_component * tod_mult + size_impact)

        if order_type == "market":
            # market orders cross the spread and slip adversely
            exec_price = intended_price + direction * (half_spread + slip)
            filled_fraction = 1.0
            # very large orders relative to ADV get partial fills
            if order_contracts > 0.005 * avg_daily_volume:
                filled_fraction = float(np.clip(
                    (0.005 * avg_daily_volume) / order_contracts, 0.2, 1.0))
                exec_price += direction * slip  # extra impact on the partial
        else:  # limit
            # limit fills at the limit price; partial if the bar barely touched it
            exec_price = intended_price
            filled_fraction = 1.0 if self.rng.random() > 0.10 else float(
                self.rng.uniform(0.5, 0.9))

        exec_price = self._round_tick(exec_price)
        commission = self.inst.commission_per_side * max(order_contracts, 1.0)
        log.debug("fill bar=%d type=%s dir=%d px=%.4f frac=%.2f slip=%.4f lat=%dms",
                  bar_index, order_type, direction, exec_price, filled_fraction,
                  slip, latency_ms)
        return Fill(price=exec_price, commission=commission,
                    filled_fraction=filled_fraction, latency_ms=latency_ms)

    def _round_tick(self, price: float) -> float:
        t = self.inst.tick_size
        return round(round(price / t) * t, 6)
