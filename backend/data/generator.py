"""Deterministic synthetic OHLCV generator (v3 — believable structure).

Produces 1-minute bars for an extended session (04:00-15:59 ET, 720 bars/day)
so session-start presets (London ~04:00, NY/Market open 09:30, Power hour 15:00)
are real and distinct.

Price model (per minute, multiplicative):
  * a per-day trend/range character (some days drift, some chop)
  * AR(1) momentum + gentle mean-reversion to a slow intraday anchor
  * a U-shaped intraday vol profile with a liveliness bump at the 09:30 cash open
  * occasional BOUNDED displacement bursts (so FVGs / order blocks / sweeps occur)
    instead of the old violent 6-sigma price jumps
  * per-minute returns are clipped; everything is rounded to the instrument tick
  * volume scales with bar range

IMPORTANT: this is *synthetic* data, clearly labelled SYNTHETIC in the UI. A good
backtest here proves the engine is correct and causal — not that a strategy has a
live edge. It is seeded and reproducible to the bit (crc32 symbol offset keeps it
process-independent). See README / EDUCATION.md.
"""
from __future__ import annotations

import math
import zlib
from functools import lru_cache

import numpy as np
import pandas as pd

from ..engine.types import Instrument

SESSION_START_MIN = 4 * 60        # 04:00 ET
SESSION_END_MIN = 16 * 60         # 16:00 ET (exclusive)
MINUTES_PER_DAY = SESSION_END_MIN - SESSION_START_MIN   # 720
RTH_OPEN_MIN = 9 * 60 + 30        # 09:30 ET cash open
MINUTES_PER_YEAR = 252 * MINUTES_PER_DAY
SUBSTEPS = 4


def _vol_profile() -> np.ndarray:
    """U-shape across the session + a bump at the 09:30 cash open."""
    x = np.linspace(0.0, 1.0, MINUTES_PER_DAY)
    u = 0.65 + 0.8 * (np.cos(2 * np.pi * x) * 0.5 + 0.5) ** 2
    open_idx = RTH_OPEN_MIN - SESSION_START_MIN
    centre = open_idx / MINUTES_PER_DAY
    bump = 0.9 * np.exp(-((x - centre) ** 2) / (2 * 0.015))
    return u + bump


def _round_tick(value: float, tick: float) -> float:
    return round(round(value / tick) * tick, 6)


@lru_cache(maxsize=12)
def generate_ohlcv(inst: Instrument, days: int, seed: int,
                   start_date: str = "2025-01-06") -> pd.DataFrame:
    # crc32 (not builtin hash) so seeds are stable across processes / PYTHONHASHSEED.
    sym_offset = zlib.crc32(inst.symbol.encode()) % 10_000
    rng = np.random.default_rng(seed + sym_offset)
    per_min_sigma = inst.annual_vol / math.sqrt(MINUTES_PER_YEAR)
    vol_profile = _vol_profile()
    tick = inst.tick_size

    sessions = pd.bdate_range(start=start_date, periods=days)
    rows = []
    price = float(inst.start_price)
    fair = price                       # slow anchor price reverts toward
    mom = 0.0                          # AR(1) momentum (fractional)
    base_vol = 800 if inst.symbol == "MNQ" else 400

    for day in sessions:
        # per-day character: a TOTAL daily drift (spread across the session, so it
        # doesn't compound 720x) and how strongly price mean-reverts to the anchor.
        per_min_drift = float(rng.normal(0.0, 0.010)) / MINUTES_PER_DAY
        kappa = float(rng.uniform(0.06, 0.14))                 # mean-reversion pull
        day_open = pd.Timestamp(day.year, day.month, day.day, 0, 0) + pd.Timedelta(minutes=SESSION_START_MIN)
        # modest overnight gap on the anchor
        fair *= 1.0 + rng.normal(0.0, 0.003)

        for m in range(MINUTES_PER_DAY):
            sigma = per_min_sigma * vol_profile[m]
            # AR(1) momentum with occasional bounded displacement burst
            mom = 0.85 * mom + rng.normal(0.0, sigma * 0.5)
            if rng.random() < 0.006:
                mom += np.sign(rng.normal()) * float(rng.uniform(2.0, 3.0)) * sigma
            fair *= 1.0 + per_min_drift + rng.normal(0.0, sigma * 0.20)
            pull = kappa * (fair - price) / max(price, 1e-9)
            ret = float(np.clip(per_min_drift + mom + pull, -0.007, 0.007))

            # shape the bar with sub-steps for realistic wicks
            sub = ret / SUBSTEPS + rng.normal(0.0, sigma * 0.45, SUBSTEPS)
            path = price * np.cumprod(1.0 + sub)
            o = price
            c = float(path[-1])
            raw_h = max(o, float(path.max()))
            raw_l = min(o, float(path.min()))

            o_r = _round_tick(o, tick)
            c_r = _round_tick(c, tick)
            h_r = max(o_r, c_r, math.ceil(raw_h / tick) * tick)
            l_r = min(o_r, c_r, math.floor(raw_l / tick) * tick)
            h_r = round(h_r, 6)
            l_r = round(max(l_r, tick), 6)

            rng_frac = abs(c - o) / max(o, 1e-9)
            volume = int(base_vol * vol_profile[m] * (1 + 18 * rng_frac) * rng.uniform(0.75, 1.25))
            ts = day_open + pd.Timedelta(minutes=m)
            rows.append((ts, o_r, h_r, l_r, c_r, max(volume, 1)))
            price = c

    df = pd.DataFrame(rows, columns=["timestamp", "open", "high", "low", "close", "volume"])
    df = df.set_index("timestamp").sort_index()
    return df


_RESAMPLE_RULES = {"5m": "5min", "15m": "15min", "30m": "30min", "1h": "60min"}


def resample_ohlcv(df_1m: pd.DataFrame, timeframe: str) -> pd.DataFrame:
    if timeframe == "1m":
        return df_1m.copy()
    rule = _RESAMPLE_RULES[timeframe]
    agg = {"open": "first", "high": "max", "low": "min", "close": "last", "volume": "sum"}
    out = df_1m.resample(rule, label="left", closed="left").agg(agg).dropna(subset=["open"])
    return out
