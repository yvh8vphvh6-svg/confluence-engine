"""Deterministic synthetic OHLCV generator (v4 — realistic market dynamics).

Upgraded IN PLACE from the v3 AR(1)+seasonality model. The generation maths now
uses ONLY the Python stdlib `random` (no numpy on the core path) so it is
seed-stable and byte-reproducible; pandas is used only as the output container.
The same seed produces identical bars (determinism gate).

This is the synthetic `MarketDataSource`/feed implementation. A real-historical
`ReplayDataSource` swaps in later behind the same `generate_ohlcv -> DataFrame`
contract, unchanged.

Dynamics modelled (per 1-minute bar, 04:00-15:59 ET, 720 bars/day):
  1. Regime-switching MARKOV process over {trend_up, trend_down, ranging,
     high_vol} with high persistence + a transition matrix; each regime sets
     drift + base volatility (the ADX/ATR detector then classifies them).
  2. Volatility CLUSTERING — an EWMA vol state that persists and spikes.
  3. Intraday SEASONALITY — U-shaped session vol + London/NY killzone bumps.
  4. Structural LEVELS + LIQUIDITY — tracked swing/prior-day/session highs &
     lows; liquidity sweeps (wick beyond a level then close back inside) with
     PROBABILISTIC follow-through; trends break structure naturally.
  5. NEWS — a synthetic economic calendar of scheduled events + random shocks →
     vol expansion + a directional impulse + a marked ±15m window (the execution
     layer widens spreads there).
  6. Realistic candles — sane wick/body ratios, occasional gaps and fakeouts.

HONEST OUTCOMES: dynamics are realistic but setups are NOT rigged to win.
Sweeps/BOS follow through only probabilistically, so valid-looking setups fail
at realistic base rates. Difficulty changes CLARITY (textbook vs messy), not a
guaranteed edge. Clearly labelled SYNTHETIC in the UI; simulation only.
"""
from __future__ import annotations

import math
import random
import zlib
from datetime import date
from functools import lru_cache
from typing import Any

import pandas as pd

from ..engine.types import Instrument

SESSION_START_MIN = 4 * 60        # 04:00 ET
SESSION_END_MIN = 16 * 60         # 16:00 ET (exclusive)
MINUTES_PER_DAY = SESSION_END_MIN - SESSION_START_MIN   # 720
RTH_OPEN_MIN = 9 * 60 + 30        # 09:30 ET cash open
MINUTES_PER_YEAR = 252 * MINUTES_PER_DAY
SUBSTEPS = 3
NEWS_WINDOW_MIN = 15              # +/- minutes around an event = elevated vol + wide spread

Regime = str
REGIMES: tuple[str, ...] = ("trend_up", "trend_down", "ranging", "high_vol")

# Markov transition matrix (rows = from, cols = to). High diagonals = persistence.
_TRANSITION: dict[str, dict[str, float]] = {
    "trend_up":   {"trend_up": 0.90, "ranging": 0.06, "high_vol": 0.03, "trend_down": 0.01},
    "trend_down": {"trend_down": 0.90, "ranging": 0.06, "high_vol": 0.03, "trend_up": 0.01},
    "ranging":    {"ranging": 0.88, "trend_up": 0.05, "trend_down": 0.05, "high_vol": 0.02},
    "high_vol":   {"high_vol": 0.78, "ranging": 0.12, "trend_up": 0.05, "trend_down": 0.05},
}
# per-regime drift (per-minute sigma units) + base vol multiplier + momentum
# persistence + reversion strength. Trends CARRY momentum and barely revert;
# ranges KILL momentum and snap back to fair (so the ADX/ATR detector reads them
# as ranging, not trending). This separation is what makes regimes learnable.
_REGIME: dict[str, dict[str, float]] = {
    "trend_up":   {"drift": 0.78, "vol": 1.05, "mom": 0.85, "pull": 0.04},
    "trend_down": {"drift": -0.78, "vol": 1.05, "mom": 0.85, "pull": 0.04},
    "ranging":    {"drift": 0.0, "vol": 0.70, "mom": 0.55, "pull": 0.22},
    "high_vol":   {"drift": 0.0, "vol": 1.85, "mom": 0.80, "pull": 0.05},
}
_REGIME_SWITCH_PROB = 0.012       # ~ once per 80 bars on average

# Difficulty -> CLARITY (1 = clean textbook, 0 = real-market messy). Lower tiers
# get cleaner structure + fewer ambiguous failures; Master ~ real-market noise.
DIFFICULTY_LEVELS: tuple[str, ...] = ("novice", "apprentice", "journeyman", "master")
_CLARITY: dict[str, float] = {"novice": 1.0, "apprentice": 0.72, "journeyman": 0.45, "master": 0.18}
DEFAULT_DIFFICULTY = "apprentice"


def clarity_for(difficulty: str | None) -> float:
    return _CLARITY.get(difficulty or DEFAULT_DIFFICULTY, _CLARITY[DEFAULT_DIFFICULTY])


# scheduled economic-calendar slots: (ET minute, probability/day, impact, kind)
_EVENT_SLOTS: tuple[tuple[int, float, str, str], ...] = (
    (8 * 60 + 30, 0.35, "high", "data-0830"),
    (10 * 60, 0.30, "high", "data-1000"),
    (14 * 60, 0.12, "high", "fomc-1400"),
)
_SHOCK_PROB = 0.10                 # extra unscheduled shock on ~10% of days


def _intraday_profile() -> list[float]:
    """U-shaped session vol (elevated open/close, midday lull) + killzone bumps."""
    prof: list[float] = []
    for m in range(MINUTES_PER_DAY):
        x = m / (MINUTES_PER_DAY - 1)                      # 0..1 across the session
        u = 0.65 + 0.8 * (math.cos(2 * math.pi * x) * 0.5 + 0.5) ** 2
        et = SESSION_START_MIN + m
        bump = 0.0
        # NY cash open killzone (09:30-11:00) and London open (~04:00-05:30)
        if RTH_OPEN_MIN <= et <= 11 * 60:
            bump += 0.6 * math.exp(-((et - RTH_OPEN_MIN) ** 2) / (2 * 25.0 ** 2))
        if 4 * 60 <= et <= 5 * 60 + 30:
            bump += 0.25
        # power hour (15:00-16:00)
        if et >= 15 * 60:
            bump += 0.2
        prof.append(u + bump)
    return prof


def _day_events(day: date, seed: int) -> list[dict[str, Any]]:
    """Deterministic synthetic economic-calendar events for one day. Order-
    independent (seeded by the date) so the generator and the news-window
    derivation agree without replaying the whole series."""
    r = random.Random(seed * 1_000_003 + day.toordinal())
    out: list[dict[str, Any]] = []
    for et_min, prob, impact, kind in _EVENT_SLOTS:
        if r.random() < prob:
            out.append({
                "et_minute": et_min, "impact": impact, "kind": kind,
                "direction": 1 if r.random() < 0.5 else -1,
                "magnitude": round(r.uniform(2.0, 4.0), 4),
            })
    if r.random() < _SHOCK_PROB:
        out.append({
            "et_minute": r.randint(RTH_OPEN_MIN, 15 * 60), "impact": "high", "kind": "shock",
            "direction": 1 if r.random() < 0.5 else -1, "magnitude": round(r.uniform(3.0, 5.0), 4),
        })
    return out


def _next_regime(current: str, r: random.Random) -> str:
    row = _TRANSITION[current]
    x = r.random()
    cum = 0.0
    for nxt, p in row.items():
        cum += p
        if x < cum:
            return nxt
    return current


def _round_tick(value: float, tick: float) -> float:
    return round(round(value / tick) * tick, 6)


def _clip(v: float, lo: float, hi: float) -> float:
    return lo if v < lo else hi if v > hi else v


def _nearest_level(price: float, levels: list[float], tol: float) -> tuple[float, str] | None:
    """The closest tracked level within `tol`; side = 'high' if at/above price."""
    best: tuple[float, str] | None = None
    best_d = tol
    for lv in levels:
        d = abs(lv - price)
        if d <= best_d:
            best_d = d
            best = (lv, "high" if lv >= price else "low")
    return best


def _simulate(
    inst: Instrument, days: int, seed: int, start_date: str, difficulty: str,
) -> tuple[list[tuple[pd.Timestamp, float, float, float, float, int]], list[str], set[int]]:
    """Core path — stdlib random only. Returns (rows, per-bar regime, news bar idx)."""
    clar = clarity_for(difficulty)
    sym_offset = zlib.crc32(inst.symbol.encode()) % 10_000
    rng = random.Random(seed + sym_offset)
    per_min_sigma = inst.annual_vol / math.sqrt(MINUTES_PER_YEAR)
    profile = _intraday_profile()
    tick = inst.tick_size
    base_vol_unit = 800 if inst.symbol == "MNQ" else 400
    extra_noise = 1.0 + (1.0 - clar) * 0.55           # messier at high tiers
    sweep_prob = 0.040 + (1.0 - clar) * 0.030
    fakeout_prob = 0.010 + (1.0 - clar) * 0.045

    dates = pd.bdate_range(start=start_date, periods=days)
    rows: list[tuple[pd.Timestamp, float, float, float, float, int]] = []
    regimes: list[str] = []
    news: set[int] = set()

    price = float(inst.start_price)
    fair = price
    mom = 0.0
    vol_state = 1.0                                   # EWMA volatility multiplier
    regime = "ranging"
    reversal_bias = 0.0                               # transient drift from sweeps/BOS
    bias_ttl = 0
    recent_high: list[float] = []
    recent_low: list[float] = []
    prior_day_high = price
    prior_day_low = price
    abs_idx = 0

    for day in dates:
        events = _day_events(day.date(), seed)
        ev_by_min: dict[int, dict[str, Any]] = {e["et_minute"]: e for e in events}
        windows: set[int] = set()
        for e in events:
            windows.update(range(e["et_minute"] - NEWS_WINDOW_MIN, e["et_minute"] + NEWS_WINDOW_MIN + 1))
        day_open = pd.Timestamp(day.year, day.month, day.day) + pd.Timedelta(minutes=SESSION_START_MIN)
        fair *= 1.0 + rng.gauss(0.0, 0.003)           # modest overnight gap on the anchor
        sess_high = -math.inf
        sess_low = math.inf

        for m in range(MINUTES_PER_DAY):
            et = SESSION_START_MIN + m
            if rng.random() < _REGIME_SWITCH_PROB:
                regime = _next_regime(regime, rng)
            rp = _REGIME[regime]

            target_vol = rp["vol"]
            vol_state = 0.96 * vol_state + 0.04 * target_vol     # clustering
            news_mult = 1.0
            if et in windows:
                news_mult = 1.8
                news.add(abs_idx)
            sigma = per_min_sigma * profile[m] * vol_state * news_mult * extra_noise

            drift = rp["drift"] * per_min_sigma * 0.5 + reversal_bias
            mom = rp["mom"] * mom + rng.gauss(0.0, sigma * 0.5)
            if rng.random() < 0.006:                  # bounded displacement burst (forms FVG/OB)
                mom += (1 if rng.random() < 0.5 else -1) * rng.uniform(2.0, 3.2) * sigma
            ev = ev_by_min.get(et)
            if ev is not None:                        # news directional impulse
                mom += ev["direction"] * ev["magnitude"] * sigma
            # reversion to a slowly-drifting fair value — STRONG in ranges (snap
            # back) and weak in trends (so pullbacks don't resume deterministically).
            pull = rp["pull"] * (fair - price) / max(price, 1e-9)
            fair *= 1.0 + rp["drift"] * per_min_sigma * 0.16 + rng.gauss(0.0, sigma * 0.2)
            ret = _clip(drift + mom + pull, -0.014, 0.014)

            o = price
            p = price
            hi_path = o
            lo_path = o
            sub = ret / SUBSTEPS
            for _ in range(SUBSTEPS):
                p = p * (1.0 + sub + rng.gauss(0.0, sigma * 0.45))
                hi_path = max(hi_path, p)
                lo_path = min(lo_path, p)
            c = p
            raw_h = max(o, hi_path)
            raw_l = min(o, lo_path)

            # ---- liquidity sweep: wick beyond a tracked level, close back inside ----
            swing_high = max(recent_high) if recent_high else price
            swing_low = min(recent_low) if recent_low else price
            levels = [swing_high, swing_low, prior_day_high, prior_day_low]
            if sess_high > -math.inf:
                levels += [sess_high, sess_low]
            near = _nearest_level(o, levels, sigma * price * 1.2)
            if near is not None and rng.random() < sweep_prob:
                lvl, side = near
                buf = sigma * price * rng.uniform(0.3, 0.9)
                # follow-through is PROBABILISTIC and REGIME-COHERENT: a sweep in
                # the trend direction more often CONTINUES (liquidity grab then go),
                # a counter-trend sweep more often REVERSES. Not rigged — base ~50%,
                # tilted by trend; cleaner (more decisive) at low difficulty.
                trend_dir = 1 if regime == "trend_up" else -1 if regime == "trend_down" else 0
                base_rev = 0.5 + 0.08 * clar
                impulse = abs(rp["drift"]) * per_min_sigma + sigma * 0.8
                if side == "high":                                 # probe up -> reversal is DOWN
                    raw_h = max(raw_h, lvl + buf)
                    if c > lvl:
                        c = lvl - tick * rng.uniform(1.0, 4.0)     # close back below the swept high
                    rev_p = _clip(base_rev - 0.20 * trend_dir, 0.15, 0.85)
                    reversal_bias = -impulse if rng.random() < rev_p else sigma * 0.5
                else:                                              # probe down -> reversal is UP
                    raw_l = min(raw_l, lvl - buf)
                    if c < lvl:
                        c = lvl + tick * rng.uniform(1.0, 4.0)
                    rev_p = _clip(base_rev + 0.20 * trend_dir, 0.15, 0.85)
                    reversal_bias = impulse if rng.random() < rev_p else -sigma * 0.5
                bias_ttl = rng.randint(3, 8)

            # ---- fakeout wick (more frequent at higher difficulty) ----
            if rng.random() < fakeout_prob:
                if rng.random() < 0.5:
                    raw_h = max(raw_h, c * (1.0 + sigma * rng.uniform(0.5, 1.2)))
                else:
                    raw_l = min(raw_l, c * (1.0 - sigma * rng.uniform(0.5, 1.2)))

            if bias_ttl > 0:
                bias_ttl -= 1
            else:
                reversal_bias = 0.0

            o_r = _round_tick(o, tick)
            c_r = _round_tick(c, tick)
            h_r = round(max(o_r, c_r, math.ceil(raw_h / tick) * tick), 6)
            l_r = round(max(min(o_r, c_r, math.floor(raw_l / tick) * tick), tick), 6)
            rng_frac = abs(c - o) / max(o, 1e-9)
            volume = int(base_vol_unit * profile[m] * news_mult * (1.0 + 18.0 * rng_frac) * rng.uniform(0.75, 1.25))
            ts = day_open + pd.Timedelta(minutes=m)
            rows.append((ts, o_r, h_r, l_r, c_r, max(volume, 1)))
            regimes.append(regime)

            price = c
            sess_high = max(sess_high, h_r)
            sess_low = min(sess_low, l_r)
            recent_high.append(h_r)
            recent_low.append(l_r)
            if len(recent_high) > 40:
                recent_high.pop(0)
                recent_low.pop(0)
            abs_idx += 1

        prior_day_high = sess_high if sess_high > -math.inf else prior_day_high
        prior_day_low = sess_low if sess_low < math.inf else prior_day_low

    return rows, regimes, news


@lru_cache(maxsize=16)
def generate_ohlcv(inst: Instrument, days: int, seed: int,
                   start_date: str = "2025-01-06", difficulty: str = DEFAULT_DIFFICULTY) -> pd.DataFrame:
    """Deterministic 1-minute OHLCV for `days` sessions. Same args -> identical bars."""
    rows, _regimes, _news = _simulate(inst, days, seed, start_date, difficulty)
    df = pd.DataFrame(rows, columns=["timestamp", "open", "high", "low", "close", "volume"])
    return df.set_index("timestamp").sort_index()


def generate_labeled(inst: Instrument, days: int, seed: int,
                     start_date: str = "2025-01-06",
                     difficulty: str = DEFAULT_DIFFICULTY) -> tuple[pd.DataFrame, list[str]]:
    """Like `generate_ohlcv` but also returns the per-bar TRUE regime (1m only).
    Used by tests to check the ADX/ATR detector classifies the regimes."""
    rows, regimes, _news = _simulate(inst, days, seed, start_date, difficulty)
    df = pd.DataFrame(rows, columns=["timestamp", "open", "high", "low", "close", "volume"])
    return df.set_index("timestamp").sort_index(), regimes


def economic_calendar(seed: int, days: int, start_date: str = "2025-01-06") -> list[dict[str, Any]]:
    """JSON-able schedule of synthetic events across the window (for the UI)."""
    out: list[dict[str, Any]] = []
    for day in pd.bdate_range(start=start_date, periods=days):
        for e in _day_events(day.date(), seed):
            et = e["et_minute"]
            out.append({
                "date": day.date().isoformat(),
                "time_et": f"{et // 60:02d}:{et % 60:02d}",
                "kind": e["kind"], "impact": e["impact"],
                "direction": e["direction"], "synthetic": True,
            })
    return out


def news_bars(df: pd.DataFrame, seed: int) -> set[int]:
    """Bar indices within +/-15m of a synthetic event — derived from the SAME
    per-day calendar the generator used, so vol expansion and spread widening
    line up. Works on any (resampled) timeframe via bar timestamps."""
    out: set[int] = set()
    per_day: dict[date, list[int]] = {}
    for i, ts in enumerate(df.index):
        d = ts.date()
        mins = per_day.get(d)
        if mins is None:
            mins = [e["et_minute"] for e in _day_events(d, seed)]
            per_day[d] = mins
        et = ts.hour * 60 + ts.minute
        if any(abs(et - em) <= NEWS_WINDOW_MIN for em in mins):
            out.add(i)
    return out


_RESAMPLE_RULES = {"5m": "5min", "15m": "15min", "30m": "30min", "1h": "60min"}


def resample_ohlcv(df_1m: pd.DataFrame, timeframe: str) -> pd.DataFrame:
    if timeframe == "1m":
        return df_1m.copy()
    rule = _RESAMPLE_RULES[timeframe]
    agg = {"open": "first", "high": "max", "low": "min", "close": "last", "volume": "sum"}
    out = df_1m.resample(rule, label="left", closed="left").agg(agg).dropna(subset=["open"])
    return out
