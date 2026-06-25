"""Indicators and market-structure primitives.

Design rule: every value at index i is computable from data at indices <= i,
except for *confirmed* swing pivots, which are intentionally lagged by `k`
bars and only become 'available' at i+k. The simulation reads the
`*_avail_*` arrays so strategies can never peek at the future.
"""
from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd


def _wilder(values: np.ndarray, period: int) -> np.ndarray:
    """Wilder's smoothing (RMA). Seeded with the simple mean of the first
    `period` values; NaN before that."""
    out = np.full(len(values), np.nan)
    if len(values) < period:
        return out
    out[period - 1] = np.nanmean(values[:period])
    alpha = 1.0 / period
    for i in range(period, len(values)):
        prev = out[i - 1]
        v = values[i]
        out[i] = prev + alpha * (v - prev) if not np.isnan(v) else prev
    return out


def true_range(df: pd.DataFrame) -> np.ndarray:
    h, lo, c = df["high"].to_numpy(), df["low"].to_numpy(), df["close"].to_numpy()
    prev_c = np.roll(c, 1)
    prev_c[0] = c[0]
    tr = np.maximum.reduce([h - lo, np.abs(h - prev_c), np.abs(lo - prev_c)])
    return tr  # type: ignore[no-any-return]  # numpy ufunc returns Any


def atr(df: pd.DataFrame, period: int = 14) -> np.ndarray:
    return _wilder(true_range(df), period)


def adx(df: pd.DataFrame, period: int = 14) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Returns (adx, plus_di, minus_di)."""
    h, lo = df["high"].to_numpy(), df["low"].to_numpy()
    up = h - np.roll(h, 1)
    down = np.roll(lo, 1) - lo
    up[0] = down[0] = 0.0
    plus_dm = np.where((up > down) & (up > 0), up, 0.0)
    minus_dm = np.where((down > up) & (down > 0), down, 0.0)
    tr = true_range(df)
    tr_s = _wilder(tr, period)
    plus_s = _wilder(plus_dm, period)
    minus_s = _wilder(minus_dm, period)
    with np.errstate(divide="ignore", invalid="ignore"):
        plus_di = 100.0 * plus_s / tr_s
        minus_di = 100.0 * minus_s / tr_s
        dx = 100.0 * np.abs(plus_di - minus_di) / (plus_di + minus_di)
    adx_v = _wilder(np.nan_to_num(dx, nan=0.0), period)
    return adx_v, plus_di, minus_di


def ema(values: np.ndarray, period: int) -> np.ndarray:
    out = np.full(len(values), np.nan)
    if len(values) == 0:
        return out
    alpha = 2.0 / (period + 1)
    out[0] = values[0]
    for i in range(1, len(values)):
        out[i] = alpha * values[i] + (1 - alpha) * out[i - 1]
    return out


def rsi(values: np.ndarray, period: int = 14) -> np.ndarray:
    delta = np.diff(values, prepend=values[0])
    gain = np.where(delta > 0, delta, 0.0)
    loss = np.where(delta < 0, -delta, 0.0)
    avg_gain = _wilder(gain, period)
    avg_loss = _wilder(loss, period)
    with np.errstate(divide="ignore", invalid="ignore"):
        rs = avg_gain / avg_loss
        out = 100.0 - 100.0 / (1.0 + rs)
    out[np.isinf(rs)] = 100.0
    return out  # type: ignore[no-any-return]  # numpy expression returns Any


def session_vwap(df: pd.DataFrame) -> np.ndarray:
    """VWAP that resets each calendar day (RTH session anchored)."""
    tp = (df["high"] + df["low"] + df["close"]).to_numpy() / 3.0
    vol = df["volume"].to_numpy()
    days = df.index.normalize()
    out = np.empty(len(df))
    cum_pv = 0.0
    cum_v = 0.0
    cur_day = None
    for i in range(len(df)):
        if days[i] != cur_day:
            cur_day = days[i]
            cum_pv = 0.0
            cum_v = 0.0
        cum_pv += tp[i] * vol[i]
        cum_v += vol[i]
        out[i] = cum_pv / cum_v if cum_v > 0 else tp[i]
    return out


def confirmed_swings(df: pd.DataFrame, k: int = 3) -> tuple[np.ndarray, np.ndarray]:
    """Fractal pivots confirmed k bars later.

    Returns two arrays giving, *as known at bar i*, the price of the most
    recent confirmed swing high / swing low. NaN until one exists.
    """
    h, lo = df["high"].to_numpy(), df["low"].to_numpy()
    n = len(df)
    last_sh = np.full(n, np.nan)
    last_sl = np.full(n, np.nan)
    sh_val = np.nan
    sl_val = np.nan
    for i in range(n):
        # a pivot centred at j = i-k is confirmable now (needs k bars each side)
        j = i - k
        if j - k >= 0:
            window_h = h[j - k:j + k + 1]
            window_l = lo[j - k:j + k + 1]
            if h[j] == window_h.max() and (window_h == h[j]).sum() == 1:
                sh_val = h[j]
            if lo[j] == window_l.min() and (window_l == lo[j]).sum() == 1:
                sl_val = lo[j]
        last_sh[i] = sh_val
        last_sl[i] = sl_val
    return last_sh, last_sl


def fair_value_gaps(df: pd.DataFrame) -> list[dict[str, Any]]:
    """Detect 3-candle FVGs. Returns a list of dicts:
    {created_at, dir, low, high}. Available for trading at bars > created_at.
    Bullish FVG: low[i] > high[i-2]  -> gap [high[i-2], low[i]]
    Bearish FVG: high[i] < low[i-2]  -> gap [high[i], low[i-2]]
    """
    h, lo = df["high"].to_numpy(), df["low"].to_numpy()
    gaps = []
    for i in range(2, len(df)):
        if lo[i] > h[i - 2]:
            gaps.append({"created_at": i, "dir": 1, "low": float(h[i - 2]), "high": float(lo[i])})
        elif h[i] < lo[i - 2]:
            gaps.append({"created_at": i, "dir": -1, "low": float(h[i]), "high": float(lo[i - 2])})
    return gaps


def order_blocks(df: pd.DataFrame) -> list[dict[str, Any]]:
    """Pragmatic order-block detection: the last opposing candle immediately
    before a displacement candle that creates an FVG.
    Returns list of {created_at, dir, low, high}."""
    o, h, lo, c = (df["open"].to_numpy(), df["high"].to_numpy(),
                   df["low"].to_numpy(), df["close"].to_numpy())
    blocks = []
    for i in range(2, len(df)):
        if lo[i] > h[i - 2]:  # bullish displacement
            # nearest down candle in the run-up (i-1 or i-2)
            for j in (i - 1, i - 2):
                if c[j] < o[j]:
                    blocks.append({"created_at": i, "dir": 1,
                                   "low": float(lo[j]), "high": float(h[j])})
                    break
        elif h[i] < lo[i - 2]:  # bearish displacement
            for j in (i - 1, i - 2):
                if c[j] > o[j]:
                    blocks.append({"created_at": i, "dir": -1,
                                   "low": float(lo[j]), "high": float(h[j])})
                    break
    return blocks


def prior_day_levels(df: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
    """Per-bar PDH/PDL: the high/low of the *previous* calendar day,
    known from the first bar of the current day onward."""
    days = df.index.normalize()
    n = len(df)
    pdh = np.full(n, np.nan)
    pdl = np.full(n, np.nan)
    day_high: dict[Any, Any] = {}
    day_low: dict[Any, Any] = {}
    h, lo = df["high"].to_numpy(), df["low"].to_numpy()
    unique_days = list(pd.unique(days))
    for d in unique_days:
        mask = days == d
        day_high[d] = h[mask].max()
        day_low[d] = lo[mask].min()
    prev = {unique_days[i]: unique_days[i - 1] for i in range(1, len(unique_days))}
    for i in range(n):
        d = days[i]
        if d in prev:
            pdh[i] = day_high[prev[d]]
            pdl[i] = day_low[prev[d]]
    return pdh, pdl


RTH_OPEN_MINUTE = 9 * 60 + 30  # 09:30 ET cash open — OR anchors here, not pre-market


def opening_range(df: pd.DataFrame, minutes: int = 15) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Per-bar opening-range high/low for the current day, finalised after the
    first `minutes` of the **09:30 cash open** (so pre-market bars don't pollute
    the OR). Known only after the OR window closes."""
    days = df.index.normalize()
    n = len(df)
    or_high = np.full(n, np.nan)
    or_low = np.full(n, np.nan)
    or_done = np.zeros(n, dtype=bool)
    h, lo = df["high"].to_numpy(), df["low"].to_numpy()
    cur_day = None
    or_start_ts = None
    running_h = -np.inf
    running_l = np.inf
    finalized_h = np.nan
    finalized_l = np.nan
    done = False
    for i in range(n):
        ts = df.index[i]
        if days[i] != cur_day:
            cur_day = days[i]
            or_start_ts = None
            running_h, running_l = -np.inf, np.inf
            finalized_h, finalized_l = np.nan, np.nan
            done = False
        minute_of_day = ts.hour * 60 + ts.minute
        if or_start_ts is None and minute_of_day >= RTH_OPEN_MINUTE:
            or_start_ts = ts
        if or_start_ts is not None:
            if (ts - or_start_ts).total_seconds() < minutes * 60:
                running_h = max(running_h, h[i])
                running_l = min(running_l, lo[i])
            elif not done:
                finalized_h, finalized_l = running_h, running_l
                done = True
        or_high[i] = finalized_h
        or_low[i] = finalized_l
        or_done[i] = done
    return or_high, or_low, or_done
