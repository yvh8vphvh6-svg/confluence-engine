"""Market context — a pre-session read computed from the latest synthetic bar.

Prior-day range/close, overnight (pre-RTH) action, current session, key levels
(PDH/PDL, opening range, VWAP), and a simple, transparent bias with reasoning +
what invalidates it. SYNTHETIC data — labelled as such; not a forecast.
"""
from __future__ import annotations

import numpy as np

from ..data.generator import generate_ohlcv, resample_ohlcv
from ..engine.strategies import build_context
from ..engine.types import INSTRUMENTS

DAYS = 30


def _session(minute: int) -> str:
    if minute < 8 * 60:
        return "London / overnight"
    if minute < 9 * 60 + 30:
        return "NY pre-market"
    if minute < 15 * 60:
        return "NY regular hours"
    return "Power hour (final hour)"


def _next_event(minute: int) -> str:
    for mark, label in [(9 * 60 + 30, "NY cash open"), (10 * 60, "10:00 data window"),
                        (15 * 60, "power hour"), (16 * 60, "session close")]:
        if minute < mark:
            mins = mark - minute
            return f"{label} in ~{mins} min"
    return "session closed"


def market_context(symbol: str, timeframe: str, seed: int = 42) -> dict:
    if symbol not in INSTRUMENTS:
        raise ValueError(f"unknown instrument {symbol!r}")
    if timeframe not in ("1m", "5m", "15m", "30m", "1h"):
        raise ValueError(f"unknown timeframe {timeframe!r}")
    inst = INSTRUMENTS[symbol]
    df = resample_ohlcv(generate_ohlcv(inst, days=DAYS, seed=seed), timeframe)
    ctx = build_context(df, inst)
    i = len(df) - 1
    ts = df.index[i]
    minute = ts.hour * 60 + ts.minute
    close = float(df.iloc[i].close)
    vwap = float(ctx.vwap[i]) if ctx.vwap[i] == ctx.vwap[i] else close
    pdh = float(ctx.pdh[i]) if ctx.pdh[i] == ctx.pdh[i] else None
    pdl = float(ctx.pdl[i]) if ctx.pdl[i] == ctx.pdl[i] else None
    orh = float(ctx.or_high[i]) if ctx.or_done[i] and ctx.or_high[i] == ctx.or_high[i] else None
    orl = float(ctx.or_low[i]) if ctx.or_done[i] and ctx.or_low[i] == ctx.or_low[i] else None

    # prior calendar day range/close
    days = df.index.normalize()
    uniq = list(dict.fromkeys(days))
    prior_hi = prior_lo = prior_close = None
    if len(uniq) >= 2:
        mask = days == uniq[-2]
        prior_hi = round(float(df.high[mask].max()), 2)
        prior_lo = round(float(df.low[mask].min()), 2)
        prior_close = round(float(df.close[mask].iloc[-1]), 2)

    # overnight / pre-RTH action of the current day (04:00 → 09:30)
    today = days == uniq[-1]
    pre = df[today & (df.index.map(lambda t: t.hour * 60 + t.minute < 9 * 60 + 30))]
    overnight = None
    if len(pre):
        overnight = {"high": round(float(pre.high.max()), 2), "low": round(float(pre.low.min()), 2),
                     "change_pts": round(float(pre.close.iloc[-1] - pre.open.iloc[0]), 2)}

    regime = ctx.regimes[i]
    above_vwap = close >= vwap
    bias = "balanced"
    reasons: list[str] = []
    invalidation = None
    if pdh is not None and close > pdh and above_vwap:
        bias = "bullish"
        reasons.append("trading above the prior-day high and above session VWAP")
        invalidation = f"a close back below VWAP ({vwap:.2f}) or the prior-day high ({pdh:.2f})"
    elif pdl is not None and close < pdl and not above_vwap:
        bias = "bearish"
        reasons.append("trading below the prior-day low and below session VWAP")
        invalidation = f"a close back above VWAP ({vwap:.2f}) or the prior-day low ({pdl:.2f})"
    else:
        reasons.append(f"price is {'above' if above_vwap else 'below'} VWAP but inside the prior-day range")
        invalidation = f"a decisive break of VWAP ({vwap:.2f}) with follow-through"
    reasons.append(f"regime reads as {regime.replace('_', ' ')}")

    return {
        "symbol": symbol, "timeframe": timeframe, "synthetic": True,
        "as_of": ts.isoformat(), "session": _session(minute), "next_event": _next_event(minute),
        "last_close": round(close, 2), "vwap": round(vwap, 2), "regime": regime,
        "prior_day": {"high": prior_hi, "low": prior_lo, "close": prior_close},
        "overnight": overnight,
        "key_levels": {"pdh": round(pdh, 2) if pdh else None, "pdl": round(pdl, 2) if pdl else None,
                       "or_high": round(orh, 2) if orh else None, "or_low": round(orl, 2) if orl else None,
                       "vwap": round(vwap, 2)},
        "bias": bias, "bias_reasons": reasons, "invalidation": invalidation,
        "disclaimer": "Synthetic data, illustrative only — not a forecast or financial advice.",
    }
