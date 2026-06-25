"""Tests for the v4 synthetic OHLCV generator.

These cover the four guarantees the upgraded generator must keep:

  * DETERMINISM — same seed => byte-identical bars (the replay/verify gate).
  * REALISTIC DYNAMICS — all four regimes occur, persist, and the ADX/ATR
    detector can actually tell trends from ranges; FVG/OB/BOS/sweep structures
    form and are tradeable; news windows + an economic calendar exist.
  * HONEST OUTCOMES — setups are NOT rigged to win. Win rates land in a
    realistic band (~45-60% on average, never ~100%), at least one strategy has
    a discoverable edge and at least one loses. This is the anti-rigging gate.
  * DIFFICULTY — changes CLARITY (textbook vs messy), not determinism.
"""
from __future__ import annotations

from collections import Counter
from typing import Any, cast

import numpy as np
import pandas as pd

from backend.data.generator import (
    DIFFICULTY_LEVELS,
    clarity_for,
    economic_calendar,
    generate_labeled,
    generate_ohlcv,
    news_bars,
    resample_ohlcv,
)
from backend.engine.simulation import Backtester
from backend.engine.strategies import all_strategies, build_context
from backend.engine.types import INSTRUMENTS, Instrument

MNQ = INSTRUMENTS["MNQ"]
MGC = INSTRUMENTS["MGC"]


def _fresh(inst: Instrument, **kw: Any) -> pd.DataFrame:
    """Bypass the module lru_cache so determinism is proven by re-simulation,
    not by returning the same cached object."""
    fn = generate_ohlcv.__wrapped__  # lru_cache exposes the undecorated fn
    return cast("pd.DataFrame", fn(inst, **kw))


# --------------------------------------------------------------------------
# Determinism
# --------------------------------------------------------------------------
def test_same_seed_is_byte_identical() -> None:
    a = _fresh(MNQ, days=12, seed=42)
    b = _fresh(MNQ, days=12, seed=42)
    assert a.to_csv() == b.to_csv()


def test_different_seed_diverges() -> None:
    a = _fresh(MNQ, days=12, seed=42)
    b = _fresh(MNQ, days=12, seed=43)
    assert a.to_csv() != b.to_csv()


def test_different_instrument_diverges() -> None:
    assert _fresh(MNQ, days=8, seed=1).to_csv() != _fresh(MGC, days=8, seed=1).to_csv()


# --------------------------------------------------------------------------
# OHLC sanity + price level
# --------------------------------------------------------------------------
def test_ohlc_invariants_hold() -> None:
    df = _fresh(MNQ, days=20, seed=5)
    body_hi = df[["open", "close"]].max(axis=1)
    body_lo = df[["open", "close"]].min(axis=1)
    assert (df["high"] >= body_hi - 1e-9).all()
    assert (df["low"] <= body_lo + 1e-9).all()
    assert (df["high"] >= df["low"]).all()
    assert (df["volume"] > 0).all()


def test_prices_track_the_instrument() -> None:
    assert _fresh(MNQ, days=5, seed=5)["close"].iloc[0] > 10_000
    assert 1_000 < _fresh(MGC, days=5, seed=5)["close"].iloc[0] < 5_000


# --------------------------------------------------------------------------
# Regimes: all four occur, persist, and stay balanced (Markov switching)
# --------------------------------------------------------------------------
def test_all_four_regimes_occur() -> None:
    _df, regimes = generate_labeled(MNQ, days=40, seed=5)
    present = set(regimes)
    assert present == {"trend_up", "trend_down", "ranging", "high_vol"}


def test_no_single_regime_dominates() -> None:
    _df, regimes = generate_labeled(MNQ, days=40, seed=5)
    share = {k: v / len(regimes) for k, v in Counter(regimes).items()}
    # each meaningfully present, none swallowing the whole series
    assert all(0.02 <= s <= 0.70 for s in share.values()), share


def test_regimes_persist() -> None:
    """Persistence (high transition-matrix diagonals) => long runs, not flicker."""
    _df, regimes = generate_labeled(MNQ, days=40, seed=5)
    runs = []
    cur, ln = regimes[0], 1
    for r in regimes[1:]:
        if r == cur:
            ln += 1
        else:
            runs.append(ln)
            cur, ln = r, 1
    runs.append(ln)
    avg_run = sum(runs) / len(runs)
    assert avg_run > 60  # mean regime lasts well over an hour of 1m bars


def test_detector_discriminates_trend_from_range() -> None:
    """The ADX/ATR detector must classify generated trend_up/trend_down bars as
    'trending' more often than it does generated ranging bars. (Generator labels
    {trend_up,trend_down,ranging,high_vol}; detector emits {trending,ranging,
    high_vol,low_vol} — so this is a discriminative, not exact-match, check.)"""
    df, true_regimes = generate_labeled(MNQ, days=40, seed=5)
    ctx = build_context(df, MNQ)
    detected = ctx.regimes
    truth = np.array(true_regimes)
    det = np.array(detected)
    is_trend = (truth == "trend_up") | (truth == "trend_down")
    is_range = truth == "ranging"
    trend_share = float((det[is_trend] == "trending").mean())
    range_share = float((det[is_range] == "trending").mean())
    assert trend_share > range_share
    assert trend_share > 0.20  # the detector actually fires 'trending' in trends


# --------------------------------------------------------------------------
# Structures form and are tradeable (FVG / OB / BOS / sweep)
# --------------------------------------------------------------------------
def test_ict_structures_form_and_trade() -> None:
    """Each structure-dependent strategy must find real setups on the synthetic
    stream — proves FVGs, order blocks, BOS and liquidity sweeps actually occur.
    """
    df = resample_ohlcv(_fresh(MNQ, days=60, seed=5), "5m")
    bt = Backtester(MNQ, seed=5, news_bars=news_bars(df, 5))
    for strat in ("FVG_RETEST", "OB_RETEST", "BOS_CONTINUATION", "LIQUIDITY_SWEEP"):
        res = bt.run(strat, df, "5m")
        assert res.metrics["n_trades"] >= 5, f"{strat} found no structures"


# --------------------------------------------------------------------------
# News: economic calendar + ±15m windows feeding the spread/vol logic
# --------------------------------------------------------------------------
def test_economic_calendar_and_news_windows() -> None:
    cal = economic_calendar(seed=5, days=30)
    assert len(cal) > 0
    for ev in cal:
        assert ev["synthetic"] is True
        assert ev["direction"] in (1, -1)
        assert ":" in ev["time_et"]

    df_1m = _fresh(MNQ, days=30, seed=5)
    nb = news_bars(df_1m, 5)
    assert 0 < len(nb) < len(df_1m) * 0.25   # some bars, far from all


def test_news_windows_survive_resampling() -> None:
    df_1m = _fresh(MNQ, days=20, seed=5)
    df_5m = resample_ohlcv(df_1m, "5m")
    assert len(news_bars(df_5m, 5)) > 0


# --------------------------------------------------------------------------
# HONEST OUTCOMES — the anti-rigging gate
# --------------------------------------------------------------------------
def _winrates(seed: int = 42, days: int = 120,
              tf: str = "5m") -> dict[str, tuple[int, float | None, float | None]]:
    df = resample_ohlcv(_fresh(MNQ, days=days, seed=seed), tf)
    bt = Backtester(MNQ, seed=seed, news_bars=news_bars(df, seed))
    out: dict[str, tuple[int, float | None, float | None]] = {}
    for s in all_strategies():
        m = bt.run(s, df, tf).metrics
        out[s] = (m["n_trades"], m["win_rate"], m["expectancy_r"])
    return out


def test_win_rates_are_honest_not_rigged() -> None:
    stats = _winrates()
    wrs = [wr for n, wr, _ in stats.values() if n >= 20 and wr is not None]
    mean_wr = sum(wrs) / len(wrs)
    # 1. average setup is a near-coinflip, NOT a guaranteed winner
    assert 0.40 <= mean_wr <= 0.62, f"mean win rate {mean_wr:.3f} outside honest band"
    # 2. nothing is rigged to ~always win (no strategy ~100%)
    best = max(wr for _n, wr, _e in stats.values() if wr is not None)
    assert best < 0.80, f"a strategy wins {best:.3f} of the time — looks rigged"


def test_some_strategies_win_and_some_lose() -> None:
    """Learnable AND honest: at least one discoverable edge, at least one loser.
    A market where everything wins is rigged; where nothing wins isn't learnable.
    """
    exps = [e for n, _wr, e in _winrates().values() if e is not None and n >= 20]
    assert any(e > 0.02 for e in exps), "no strategy has a discoverable edge"
    assert any(e < -0.05 for e in exps), "every strategy profits — not honest"


def test_representative_setup_win_rate_in_band() -> None:
    """VWAP mean-reversion is the highest-sample strategy => statistically stable
    representative. Its win rate must sit in a realistic ~45-60% band."""
    n, wr, _e = _winrates()["VWAP_REVERSION"]
    assert n >= 100
    assert wr is not None
    assert 0.42 <= wr <= 0.62, f"representative win rate {wr:.3f} not realistic"


# --------------------------------------------------------------------------
# Difficulty = clarity, not determinism
# --------------------------------------------------------------------------
def test_difficulty_levels_are_ordered() -> None:
    cs = [clarity_for(d) for d in DIFFICULTY_LEVELS]
    assert cs == sorted(cs, reverse=True)        # novice cleanest, master noisiest
    assert cs[0] > cs[-1]


def test_difficulty_changes_bars_but_stays_deterministic() -> None:
    base = _fresh(MNQ, days=12, seed=42, difficulty="novice")
    again = _fresh(MNQ, days=12, seed=42, difficulty="novice")
    harder = _fresh(MNQ, days=12, seed=42, difficulty="master")
    assert base.to_csv() == again.to_csv()       # deterministic within a tier
    assert base.to_csv() != harder.to_csv()      # clarity actually changes the path
