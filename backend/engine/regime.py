"""Regime detection and shared confirmation helpers."""
from __future__ import annotations

import numpy as np
import pandas as pd


def classify_regime(adx_v: float, atr_v: float, atr_avg: float,
                    vwap_slope: float, vol: float, vol_avg: float) -> str:
    """Priority: high_vol > trending > ranging > low_vol.

    - high_vol : ATR > 1.5x its 20-bar average AND volume spike
    - trending : ADX > 25
    - ranging  : ADX < 20 AND ~flat VWAP
    - low_vol  : everything else
    """
    if np.isnan(adx_v) or np.isnan(atr_v) or np.isnan(atr_avg):
        return "low_vol"
    if atr_v > 1.5 * atr_avg and vol > 1.5 * vol_avg:
        return "high_vol"
    if adx_v > 25:
        return "trending"
    if adx_v < 20 and abs(vwap_slope) < 0.0005:
        return "ranging"
    return "low_vol"


def regime_series(df: pd.DataFrame, adx_v, atr_v, atr_avg, vwap) -> list[str]:
    vol = df["volume"].to_numpy()
    vol_avg = pd.Series(vol).rolling(20, min_periods=1).mean().to_numpy()
    vwap_slope = np.zeros(len(df))
    vwap_slope[5:] = (vwap[5:] - vwap[:-5]) / np.where(vwap[:-5] == 0, 1, vwap[:-5])
    return [
        classify_regime(adx_v[i], atr_v[i], atr_avg[i], vwap_slope[i], vol[i], vol_avg[i])
        for i in range(len(df))
    ]


def pa_confirm(df: pd.DataFrame, i: int, direction: int, vol_avg: float) -> bool:
    """Strict price-action confirmation:
      close in the trade direction within the bar's range (closes strong),
      a rejection wick on the opposing side, and a volume spike.
    """
    o = df["open"].iat[i]; h = df["high"].iat[i]
    l = df["low"].iat[i]; c = df["close"].iat[i]
    v = df["volume"].iat[i]
    rng = max(h - l, 1e-9)
    body_top = max(o, c)
    body_bot = min(o, c)
    upper_wick = h - body_top
    lower_wick = body_bot - l
    closes_strong = (c > o) if direction > 0 else (c < o)
    # rejection wick on the opposing side (>= 30% of range)
    rejection = (lower_wick / rng >= 0.30) if direction > 0 else (upper_wick / rng >= 0.30)
    vol_spike = v > 1.4 * vol_avg
    close_pos = (c - l) / rng
    located = close_pos > 0.6 if direction > 0 else close_pos < 0.4
    return bool(closes_strong and rejection and vol_spike and located)


def in_killzone(ts: pd.Timestamp) -> bool:
    """RTH 'killzone': first 90 minutes after the 09:30 ET open, and the
    final-hour run. Data is generated in naive ET wall-clock."""
    minutes = ts.hour * 60 + ts.minute
    open_kz = 9 * 60 + 30 <= minutes <= 11 * 60          # 09:30-11:00
    pm_kz = 14 * 60 <= minutes <= 15 * 60 + 30           # 14:00-15:30
    return open_kz or pm_kz


def in_ote(price: float, leg_low: float, leg_high: float, direction: int) -> bool:
    """Optimal Trade Entry: price inside the 0.618-0.786 retrace of the leg."""
    if np.isnan(leg_low) or np.isnan(leg_high) or leg_high <= leg_low:
        return False
    span = leg_high - leg_low
    if direction > 0:  # retracing down into discount
        lo = leg_high - 0.786 * span
        hi = leg_high - 0.618 * span
    else:              # retracing up into premium
        lo = leg_low + 0.618 * span
        hi = leg_low + 0.786 * span
    return lo <= price <= hi
