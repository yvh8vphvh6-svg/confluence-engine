"""Strategy registry.

Each strategy is a pure function (df, i, ctx, state) -> Optional[Signal].
It may read precomputed arrays in `ctx` and per-run bookkeeping in `state`
(zone pools, pending setups, per-day flags). It must never read df at j > i.

Stops/targets are expressed so that the simulator can compute an R multiple as
(exit - entry) * direction / |entry - initial_stop|.
"""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd

from . import indicators as ind
from . import regime as rg
from .types import Instrument, Signal, StrategyMeta

TP_R = 2.0  # default reward:risk for breakout/trend setups


@dataclass
class Ctx:
    df: pd.DataFrame
    inst: Instrument
    atr: np.ndarray
    atr_avg: np.ndarray
    adx: np.ndarray
    plus_di: np.ndarray
    minus_di: np.ndarray
    vwap: np.ndarray
    ema20: np.ndarray
    ema50: np.ndarray
    rsi: np.ndarray
    vol_avg: np.ndarray
    last_sh: np.ndarray
    last_sl: np.ndarray
    pdh: np.ndarray
    pdl: np.ndarray
    or_high: np.ndarray
    or_low: np.ndarray
    or_done: np.ndarray
    fvgs: list[dict[str, Any]]
    obs: list[dict[str, Any]]
    regimes: list[str]
    avg_daily_volume: float


def build_context(df: pd.DataFrame, inst: Instrument) -> Ctx:
    close = df["close"].to_numpy()
    atr = ind.atr(df, 14)
    atr_avg = pd.Series(atr).rolling(20, min_periods=1).mean().to_numpy()
    adx_v, plus_di, minus_di = ind.adx(df, 14)
    vwap = ind.session_vwap(df)
    ema20 = ind.ema(close, 20)
    ema50 = ind.ema(close, 50)
    rsi = ind.rsi(close, 14)
    vol_avg = pd.Series(df["volume"].to_numpy()).rolling(20, min_periods=1).mean().to_numpy()
    last_sh, last_sl = ind.confirmed_swings(df, 3)
    pdh, pdl = ind.prior_day_levels(df)
    or_high, or_low, or_done = ind.opening_range(df, 15)
    fvgs = ind.fair_value_gaps(df)
    obs = ind.order_blocks(df)
    regimes = rg.regime_series(df, adx_v, atr, atr_avg, vwap)
    daily_vol = df["volume"].groupby(df.index.normalize()).sum()
    adv = float(daily_vol.mean()) if len(daily_vol) else float(df["volume"].sum())
    return Ctx(df, inst, atr, atr_avg, adx_v, plus_di, minus_di, vwap, ema20, ema50,
               rsi, vol_avg, last_sh, last_sl, pdh, pdl, or_high, or_low, or_done,
               fvgs, obs, regimes, adv)


def _atr(ctx: Ctx, i: int) -> float:
    a = ctx.atr[i]
    return a if (a is not None and not np.isnan(a) and a > 0) else float("nan")


def _mk(strategy: str, direction: int, entry: float, stop: float, ctx: Ctx, i: int, order_type: str,
        structure: bool, timing: bool, reason: str, target: float | None = None) -> Signal | None:
    """Assemble a Signal, computing target from TP_R if not supplied,
    and attaching the four confluence factor booleans."""
    risk = abs(entry - stop)
    min_risk = max(ctx.inst.tick_size * 4, _atr(ctx, i) * 0.2 if not np.isnan(_atr(ctx, i)) else 0)
    if risk < min_risk or np.isnan(risk):
        return None
    if target is None:
        target = entry + direction * TP_R * risk
    pa = rg.pa_confirm(ctx.df, i, direction, ctx.vol_avg[i])
    factors = {"base": True, "structure": bool(structure),
               "timing": bool(timing), "pa": bool(pa)}
    return Signal(strategy=strategy, direction=direction, entry=float(entry),
                  stop=float(stop), target=float(target), order_type=order_type,
                  factors=factors, reason=reason)


# --------------------------------------------------------------------------
# 1. Opening Range Breakout
# --------------------------------------------------------------------------
def orb(df: pd.DataFrame, i: int, ctx: Ctx, state: dict[str, Any]) -> Signal | None:
    if not ctx.or_done[i] or np.isnan(ctx.or_high[i]):
        return None
    ts = df.index[i]
    day = ts.normalize()
    if state.get("orb_day") == day:
        return None  # one ORB attempt per day
    minutes_since_open = (ts.hour * 60 + ts.minute) - (9 * 60 + 30)
    if minutes_since_open > 150:  # only the first 2.5h after OR closes
        return None
    c = df["close"].iat[i]
    pc = df["close"].iat[i - 1]
    orh, orl = ctx.or_high[i], ctx.or_low[i]
    long_break = pc <= orh < c
    short_break = pc >= orl > c
    if not (long_break or short_break):
        return None
    direction = 1 if long_break else -1
    entry = c
    stop = orl if direction > 0 else orh
    structure = (c > ctx.vwap[i]) if direction > 0 else (c < ctx.vwap[i])
    timing = rg.in_killzone(ts)
    sig = _mk("ORB", direction, entry, stop, ctx, i, "market", structure, timing,
              f"OR[{orl:.2f},{orh:.2f}] {'break up' if direction>0 else 'break down'} close {c:.2f}")
    if sig:
        state["orb_day"] = day
    return sig


# --------------------------------------------------------------------------
# 2. Fair Value Gap retest (limit)
# --------------------------------------------------------------------------
def fvg_retest(df: pd.DataFrame, i: int, ctx: Ctx, state: dict[str, Any]) -> Signal | None:
    low_i, high_i, c = df["low"].iat[i], df["high"].iat[i], df["close"].iat[i]
    for z in state["active_fvgs"]:
        d = z["dir"]
        # price must trade back into the gap
        tapped = low_i <= z["high"] and high_i >= z["low"]
        if not tapped:
            continue
        if d > 0:  # bullish gap -> long
            entry = z["high"]
            stop = z["low"]
        else:      # bearish gap -> short
            entry = z["low"]
            stop = z["high"]
        leg_low, leg_high = ctx.last_sl[i], ctx.last_sh[i]
        timing = rg.in_ote(c, leg_low, leg_high, d) or abs(c - ctx.vwap[i]) < _atr(ctx, i) * 0.5
        structure = (c > ctx.last_sl[i]) if d > 0 else (c < ctx.last_sh[i])
        sig = _mk("FVG_RETEST", d, entry, stop, ctx, i, "limit", structure, timing,
                  f"retest {'bull' if d>0 else 'bear'} FVG [{z['low']:.2f},{z['high']:.2f}]")
        if sig:
            z["consumed"] = True
            return sig
    return None


# --------------------------------------------------------------------------
# 3. Order Block retest (limit)
# --------------------------------------------------------------------------
def ob_retest(df: pd.DataFrame, i: int, ctx: Ctx, state: dict[str, Any]) -> Signal | None:
    low_i, high_i, c = df["low"].iat[i], df["high"].iat[i], df["close"].iat[i]
    for z in state["active_obs"]:
        d = z["dir"]
        tapped = low_i <= z["high"] and high_i >= z["low"]
        if not tapped:
            continue
        if d > 0:
            entry = z["high"]
            stop = z["low"]
        else:
            entry = z["low"]
            stop = z["high"]
        structure = (c > ctx.last_sl[i]) if d > 0 else (c < ctx.last_sh[i])
        timing = rg.in_killzone(df.index[i])
        sig = _mk("OB_RETEST", d, entry, stop, ctx, i, "limit", structure, timing,
                  f"mitigate {'bull' if d>0 else 'bear'} OB [{z['low']:.2f},{z['high']:.2f}]")
        if sig:
            z["consumed"] = True
            return sig
    return None


# --------------------------------------------------------------------------
# 4. Break of Structure continuation (pullback, market)
# --------------------------------------------------------------------------
def bos_continuation(df: pd.DataFrame, i: int, ctx: Ctx, state: dict[str, Any]) -> Signal | None:
    c = df["close"].iat[i]
    sh, sl = ctx.last_sh[i], ctx.last_sl[i]
    pend = state.get("bos_pending")
    # detect a fresh break of structure
    if not np.isnan(sh) and c > sh and (pend is None or pend["dir"] != 1):
        state["bos_pending"] = {"dir": 1, "level": float(sh), "bar": i}
        return None
    if not np.isnan(sl) and c < sl and (pend is None or pend["dir"] != -1):
        state["bos_pending"] = {"dir": -1, "level": float(sl), "bar": i}
        return None
    if pend is None or i - pend["bar"] > 12:
        if pend and i - pend["bar"] > 12:
            state["bos_pending"] = None
        return None
    d = pend["dir"]
    lvl = pend["level"]
    atrv = _atr(ctx, i)
    near = abs(c - lvl) < atrv * 0.4
    if not near:
        return None
    entry = c
    stop = (sl if d > 0 else sh)
    if np.isnan(stop):
        stop = entry - d * 1.5 * atrv
    structure = True
    timing = rg.in_killzone(df.index[i])
    sig = _mk("BOS_CONTINUATION", d, entry, stop, ctx, i, "market", structure, timing,
              f"BOS {'up' if d>0 else 'down'} @ {lvl:.2f}, pullback entry")
    if sig:
        state["bos_pending"] = None
    return sig


# --------------------------------------------------------------------------
# 5. Breakout-retest of prior-day high/low (market)
# --------------------------------------------------------------------------
def breakout_retest(df: pd.DataFrame, i: int, ctx: Ctx, state: dict[str, Any]) -> Signal | None:
    c = df["close"].iat[i]
    pdh, pdl = ctx.pdh[i], ctx.pdl[i]
    atrv = _atr(ctx, i)
    pend = state.get("brk_pending")
    if not np.isnan(pdh) and c > pdh and (pend is None or pend["dir"] != 1):
        state["brk_pending"] = {"dir": 1, "level": float(pdh), "bar": i}
        return None
    if not np.isnan(pdl) and c < pdl and (pend is None or pend["dir"] != -1):
        state["brk_pending"] = {"dir": -1, "level": float(pdl), "bar": i}
        return None
    if pend is None or i - pend["bar"] > 15:
        if pend and i - pend["bar"] > 15:
            state["brk_pending"] = None
        return None
    d = pend["dir"]
    lvl = pend["level"]
    near = abs(c - lvl) < atrv * 0.4
    if not near:
        return None
    entry = c
    stop = lvl - d * atrv  # buffer beyond the reclaimed level
    structure = (c > ctx.vwap[i]) if d > 0 else (c < ctx.vwap[i])
    timing = rg.in_killzone(df.index[i])
    sig = _mk("BREAKOUT_RETEST", d, entry, stop, ctx, i, "market", structure, timing,
              f"{'PDH' if d>0 else 'PDL'} break+retest @ {lvl:.2f}")
    if sig:
        state["brk_pending"] = None
    return sig


# --------------------------------------------------------------------------
# 6. VWAP mean reversion (ranging only, limit)
# --------------------------------------------------------------------------
def vwap_reversion(df: pd.DataFrame, i: int, ctx: Ctx, state: dict[str, Any]) -> Signal | None:
    if ctx.regimes[i] != "ranging":
        return None
    c = df["close"].iat[i]
    vw = ctx.vwap[i]
    atrv = _atr(ctx, i)
    if np.isnan(vw) or np.isnan(atrv):
        return None
    stretch = (c - vw) / atrv
    r = ctx.rsi[i]
    if stretch < -1.2 and r < 40:            # oversold below VWAP -> long
        d = 1
        entry = c
        stop = c - 1.0 * atrv
        target = vw
    elif stretch > 1.2 and r > 60:           # overbought above VWAP -> short
        d = -1
        entry = c
        stop = c + 1.0 * atrv
        target = vw
    else:
        return None
    structure = True            # counter-trend is acceptable in a range
    timing = abs(stretch) > 1.2  # mean-reversion timing = the stretch itself
    return _mk("VWAP_REVERSION", d, entry, stop, ctx, i, "limit", structure, timing,
               f"VWAP revert stretch={stretch:.2f} rsi={r:.0f}", target=target)


# --------------------------------------------------------------------------
# 7. EMA trend pullback (trending only, market)
# --------------------------------------------------------------------------
def ema_trend_pullback(df: pd.DataFrame, i: int, ctx: Ctx, state: dict[str, Any]) -> Signal | None:
    if ctx.regimes[i] != "trending":
        return None
    c = df["close"].iat[i]
    lo = df["low"].iat[i]
    hi = df["high"].iat[i]
    e20, e50 = ctx.ema20[i], ctx.ema50[i]
    atrv = _atr(ctx, i)
    if np.isnan(e20) or np.isnan(e50) or np.isnan(atrv):
        return None
    up = e20 > e50 and ctx.plus_di[i] > ctx.minus_di[i]
    dn = e20 < e50 and ctx.minus_di[i] > ctx.plus_di[i]
    if up and lo <= e20 and c > e20:         # pullback to EMA in uptrend
        d = 1
        entry = c
        stop = ctx.last_sl[i] if not np.isnan(ctx.last_sl[i]) else c - 1.5 * atrv
    elif dn and hi >= e20 and c < e20:       # pullback to EMA in downtrend
        d = -1
        entry = c
        stop = ctx.last_sh[i] if not np.isnan(ctx.last_sh[i]) else c + 1.5 * atrv
    else:
        return None
    leg_low, leg_high = ctx.last_sl[i], ctx.last_sh[i]
    timing = rg.in_ote(c, leg_low, leg_high, d) or rg.in_killzone(df.index[i])
    return _mk("EMA_TREND_PULLBACK", d, entry, stop, ctx, i, "market", True, timing,
               f"EMA20 pullback in {'up' if d>0 else 'down'}trend (ADX={ctx.adx[i]:.0f})")


# --------------------------------------------------------------------------
# 8. Liquidity sweep reversal (ICT stop-hunt, market)
# --------------------------------------------------------------------------
def liquidity_sweep(df: pd.DataFrame, i: int, ctx: Ctx, state: dict[str, Any]) -> Signal | None:
    o = df["open"].iat[i]
    h = df["high"].iat[i]
    lo = df["low"].iat[i]
    c = df["close"].iat[i]
    sh, sl = ctx.last_sh[i], ctx.last_sl[i]
    atrv = _atr(ctx, i)
    if np.isnan(atrv):
        return None
    # sweep above swing high then close back below -> short
    if not np.isnan(sh) and h > sh and c < sh and c < o:
        d = -1
        entry = c
        stop = h + 0.2 * atrv
    # sweep below swing low then close back above -> long
    elif not np.isnan(sl) and lo < sl and c > sl and c > o:
        d = 1
        entry = c
        stop = lo - 0.2 * atrv
    else:
        return None
    structure = True            # liquidity was taken
    timing = rg.in_killzone(df.index[i])
    return _mk("LIQUIDITY_SWEEP", d, entry, stop, ctx, i, "market", structure, timing,
               f"liquidity sweep {'of highs' if d<0 else 'of lows'} reversal")


# --------------------------------------------------------------------------
# registry
# --------------------------------------------------------------------------
StrategyFn = Callable[[pd.DataFrame, int, Ctx, dict[str, Any]], Signal | None]

REGISTRY: dict[str, tuple[StrategyFn, StrategyMeta]] = {
    "ORB": (orb, StrategyMeta(
        "ORB", "Opening Range Breakout", "breakout", "high_vol", ["15m", "5m"],
        "Breaks the first 15-minute range in the direction of the open drive.",
        ["opening_range", "VWAP", "ATR", "volume"])),
    "FVG_RETEST": (fvg_retest, StrategyMeta(
        "FVG_RETEST", "Fair Value Gap Retest", "smc", "trending", ["5m", "1m"],
        "Limit entry on a retrace into an unfilled 3-candle imbalance.",
        ["FVG", "swings", "OTE_fib", "VWAP"])),
    "OB_RETEST": (ob_retest, StrategyMeta(
        "OB_RETEST", "Order Block Mitigation", "smc", "trending", ["5m", "15m"],
        "Limit entry when price mitigates the last opposing candle before displacement.",
        ["order_block", "FVG", "swings"])),
    "BOS_CONTINUATION": (bos_continuation, StrategyMeta(
        "BOS_CONTINUATION", "Break of Structure Continuation", "smc", "trending", ["5m", "15m"],
        "Enters the pullback after price breaks a confirmed swing.",
        ["swings", "ATR", "killzone"])),
    "BREAKOUT_RETEST": (breakout_retest, StrategyMeta(
        "BREAKOUT_RETEST", "PDH/PDL Break & Retest", "breakout", "trending", ["5m", "15m"],
        "Breaks prior-day high/low then enters the retest of the reclaimed level.",
        ["PDH/PDL", "VWAP", "ATR"])),
    "VWAP_REVERSION": (vwap_reversion, StrategyMeta(
        "VWAP_REVERSION", "VWAP Mean Reversion", "mean_reversion", "ranging", ["1m", "5m"],
        "Fades stretched, RSI-extreme moves back to session VWAP. Range regime only.",
        ["VWAP", "RSI", "ATR"])),
    "EMA_TREND_PULLBACK": (ema_trend_pullback, StrategyMeta(
        "EMA_TREND_PULLBACK", "EMA Trend Pullback", "trend", "trending", ["5m", "15m"],
        "Buys/sells pullbacks to EMA20 with ADX/DI trend confirmation. Trend regime only.",
        ["EMA", "ADX", "DI", "OTE_fib"])),
    "LIQUIDITY_SWEEP": (liquidity_sweep, StrategyMeta(
        "LIQUIDITY_SWEEP", "Liquidity Sweep Reversal", "smc", "high_vol", ["1m", "5m"],
        "Reversal after a stop-run that sweeps a swing then closes back inside.",
        ["swings", "ATR", "killzone"])),
}


def all_strategies() -> list[str]:
    return list(REGISTRY.keys())
