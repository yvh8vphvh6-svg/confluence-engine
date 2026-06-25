"""Phase-E "translation" layer — bridges synthetic practice to real markets.

All four features read what prior phases already record (journal trades, the
deterministic engine, the bundled Replay bars) and derive everything from real
records — no fabricated stats. Persistence is raw sqlite in the journal DB with
idempotent CREATE TABLE / ALTER-on-open, so the deployed DB survives restart.

  1. compare_payload   — synthetic vs recorded-real bars, same axis, same overlays
  2. pattern drills     — "which strategy fits?" with the answer derived from the
                          engine's own qualified setup; idempotent XP per scenario
  3. risk_counterfactual— real equity (stops honored) vs a labelled no-stop model
  4. (Real Mode uses data.market_source directly; see that module)
"""
from __future__ import annotations

import random
import sqlite3
from typing import Any

import pandas as pd
from pydantic import BaseModel

from .data.generator import generate_ohlcv, resample_ohlcv
from .data.market_source import ReplayDataSource
from .engine.simulation import WARMUP
from .engine.strategies import REGISTRY, all_strategies, build_context
from .engine.types import INSTRUMENTS
from .journal import DB_PATH

# overlay window (matches the live engine's declutter caps)
MAX_ZONE_OVERLAYS = 3
ZONE_TTL_BARS = 60
CONTEXT_BARS = 90
MIN_SAMPLE = 10  # project minimum for a user-stats view (matches calibration)
NO_STOP_LOSS_R = -2.5  # teaching MODEL: an unstopped loser runs to ~ -2.5R
XP_PATTERN_DRILL = 5  # small XP per distinct scenario answered correctly

_SYMS = ["MNQ", "MGC"]
_TFS = ["5m", "15m"]


# --------------------------------------------------------------------------- #
# persistence (journal DB; idempotent)
# --------------------------------------------------------------------------- #
def _conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), timeout=5)
    conn.row_factory = sqlite3.Row
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS setup_comparisons (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            symbol TEXT, timeframe TEXT,
            synthetic_take INTEGER,   -- 1 = would take on synthetic
            real_take INTEGER         -- 1 = would take on real, 0 = would skip
        );
        CREATE TABLE IF NOT EXISTS pattern_drills (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            scenario TEXT NOT NULL,   -- SYMBOL:TF:SEED:INDEX (idempotency key for XP)
            answer TEXT, correct INTEGER, optimal TEXT
        );
        """
    )
    return conn


# --------------------------------------------------------------------------- #
# overlays on arbitrary bars (reuses the engine's build_context, read-only)
# --------------------------------------------------------------------------- #
def _df_from_candles(candles: list[Any]) -> Any:
    df = pd.DataFrame(
        [{"open": c["open"], "high": c["high"], "low": c["low"], "close": c["close"],
          "volume": c.get("volume", 0.0)} for c in candles],
        index=pd.to_datetime([int(c["time"]) for c in candles], unit="s", utc=True).tz_convert(None),
    )
    return df


def overlays_for(candles: list[Any], symbol: str) -> list[dict[str, Any]]:
    """FVG / OB / ORB / BOS zones at the last bar of `candles`, rendered as the
    same overlay shape the live stream uses (so synthetic and real are comparable)."""
    if symbol not in INSTRUMENTS or len(candles) < 5:
        return []
    df = _df_from_candles(candles)
    inst = INSTRUMENTS[symbol]
    ctx = build_context(df, inst)
    i = len(df) - 1
    out: list[dict[str, Any]] = []

    def _recent(zones: list[Any]) -> list[Any]:
        active = [z for z in zones if z["created_at"] <= i and i - z["created_at"] <= ZONE_TTL_BARS]
        return active[-MAX_ZONE_OVERLAYS:]

    for z in _recent(list(ctx.fvgs)):
        out.append({"kind": "FVG", "direction": "long" if z["dir"] > 0 else "short",
                    "low": round(float(z["low"]), 4), "high": round(float(z["high"]), 4),
                    "label": f"{'Bull' if z['dir'] > 0 else 'Bear'} FVG"})
    for z in _recent(list(ctx.obs)):
        out.append({"kind": "OB", "direction": "long" if z["dir"] > 0 else "short",
                    "low": round(float(z["low"]), 4), "high": round(float(z["high"]), 4),
                    "label": f"{'Bull' if z['dir'] > 0 else 'Bear'} OB"})
    if bool(ctx.or_done[i]) and float(ctx.or_high[i]) == float(ctx.or_high[i]):  # not NaN
        out.append({"kind": "ORB", "direction": "flat",
                    "low": round(float(ctx.or_low[i]), 4), "high": round(float(ctx.or_high[i]), 4),
                    "label": "Opening Range"})
    return out


def _candles_from_df(df: Any, lo: int, hi: int, axis_times: list[int] | None = None) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for j, k in enumerate(range(lo, hi)):
        r = df.iloc[k]
        t = axis_times[j] if axis_times is not None and j < len(axis_times) else int(df.index[k].timestamp())
        out.append({"time": int(t), "open": round(float(r.open), 4), "high": round(float(r.high), 4),
                    "low": round(float(r.low), 4), "close": round(float(r.close), 4),
                    "volume": round(float(r.volume), 2)})
    return out


# --------------------------------------------------------------------------- #
# 1) synthetic-vs-real side-by-side
# --------------------------------------------------------------------------- #
def compare_payload(symbol: str, timeframe: str, seed: int = 42, limit: int = 160) -> dict[str, Any]:
    if symbol not in INSTRUMENTS:
        raise ValueError(f"unknown instrument {symbol!r}")
    replay = ReplayDataSource()
    real_bars = replay.bars(symbol, timeframe, limit=limit)
    if not real_bars:
        raise ValueError("no recorded real bars bundled for this instrument/timeframe")

    inst = INSTRUMENTS[symbol]
    sdf = resample_ohlcv(generate_ohlcv(inst, days=30, seed=seed), timeframe)
    k = min(limit, len(real_bars), len(sdf))
    real_window = real_bars[-k:]
    axis = [b["time"] for b in real_window]  # share the recorded timestamp axis
    synth = _candles_from_df(sdf, len(sdf) - k, len(sdf), axis_times=axis)

    return {
        "symbol": symbol, "timeframe": timeframe, "seed": seed,
        "synthetic": {"candles": synth, "overlays": overlays_for(synth, symbol), "label": "Synthetic (seeded)"},
        "real": {"candles": real_window, "overlays": overlays_for(real_window, symbol),
                 **replay.provenance(symbol, timeframe)},
        "note": "Synthetic bars are aligned onto the recorded timestamp axis for comparison. "
                "Synthetic = practice data; real = recorded delayed bars.",
    }


class CompareMarkIn(BaseModel):
    symbol: str = ""
    timeframe: str = ""
    synthetic_take: bool = False
    real_take: bool = False  # True = would take on real, False = would skip


def add_comparison(m: CompareMarkIn) -> int:
    with _conn() as c:
        cur = c.execute(
            "INSERT INTO setup_comparisons (created_at, symbol, timeframe, synthetic_take, real_take) "
            "VALUES (datetime('now'),?,?,?,?)",
            (m.symbol, m.timeframe, int(m.synthetic_take), int(m.real_take)))
        c.commit()
        return int(cur.lastrowid or 0)


# --------------------------------------------------------------------------- #
# 2) pattern-matching drills
# --------------------------------------------------------------------------- #
class PatternScoreIn(BaseModel):
    scenario: str
    answer: str  # strategy name chosen by the user


def _strategy_labels() -> dict[str, str]:
    return {name: REGISTRY[name][1].label for name in all_strategies()}


def _live(symbol: str, timeframe: str, seed: int) -> Any:
    from .engine.live import LiveSimulation
    return LiveSimulation(symbol=symbol, timeframe=timeframe, seed=seed)


def _executing_setup(snap: Any) -> str:
    """The strategy whose confluence actually executed in this window (highest
    confidence among executing signals) — the 'optimal answer' for a drill."""
    best_name = ""
    best_conf = -1.0
    for v in snap.get("signals", []):
        c = v.get("confluence")
        if c and c.get("execute") and v.get("entry") is not None and float(c.get("confidence", 0)) > best_conf:
            best_conf = float(c["confidence"])
            best_name = str(v["name"])
    return best_name


def new_pattern_drill() -> dict[str, Any]:
    labels = _strategy_labels()
    for _ in range(10):
        symbol = random.choice(_SYMS)
        timeframe = random.choice(_TFS)
        seed = random.randint(1, 9999)
        sim = _live(symbol, timeframe, seed)
        snaps: list[Any] = sim.snaps
        lo = WARMUP + CONTEXT_BARS
        cands = [i for i in range(lo, len(snaps)) if _executing_setup(snaps[i])]
        if not cands:
            continue
        i = random.choice(cands)
        candles = _candles_from_df(sim.df, i - CONTEXT_BARS, i + 1)
        return {
            "scenario": f"{symbol}:{timeframe}:{seed}:{i}",
            "symbol": symbol, "timeframe": timeframe, "decision_index": i,
            "candles": candles, "overlays": overlays_for(candles, symbol),
            "regime": str(snaps[i].get("regime", "")),
            "choices": [{"name": k, "label": v} for k, v in labels.items()],
        }
    raise ValueError("could not build a pattern drill (no qualified setup found)")


def score_pattern_drill(req: PatternScoreIn) -> dict[str, Any]:
    try:
        symbol, timeframe, seed_s, idx_s = req.scenario.split(":")
        seed, i = int(seed_s), int(idx_s)
    except (ValueError, IndexError) as exc:
        raise ValueError("bad scenario id") from exc
    sim = _live(symbol, timeframe, seed)
    snaps: list[Any] = sim.snaps
    if not (0 <= i < len(snaps)):
        raise ValueError("scenario index out of range")
    snap = snaps[i]
    optimal = _executing_setup(snap)
    labels = _strategy_labels()
    correct = req.answer == optimal
    # one-line "why" from the qualified signal's own evidence + regime
    why = ""
    for v in snap.get("signals", []):
        if v.get("name") == optimal:
            why = f"{labels.get(optimal, optimal)} — regime was {snap.get('regime')}; {v.get('evidence') or v.get('reason') or ''}".strip()
            break

    with _conn() as c:
        c.execute(
            "INSERT INTO pattern_drills (created_at, scenario, answer, correct, optimal) "
            "VALUES (datetime('now'),?,?,?,?)",
            (req.scenario, req.answer, int(correct), optimal))
        c.commit()
    return {"correct": correct, "optimal": optimal, "optimal_label": labels.get(optimal, optimal),
            "why": why, "stats": pattern_drill_stats()}


def pattern_drill_stats() -> dict[str, Any]:
    with _conn() as c:
        rows = [dict(r) for r in c.execute("SELECT * FROM pattern_drills").fetchall()]
    n = len(rows)
    correct = sum(1 for r in rows if r["correct"])
    by_strat: dict[str, dict[str, int]] = {}
    for r in rows:
        key = str(r["optimal"] or "?")
        d = by_strat.setdefault(key, {"n": 0, "correct": 0})
        d["n"] += 1
        d["correct"] += int(r["correct"] or 0)
    return {
        "n": n,
        "accuracy": round(correct / n, 4) if n else None,
        "by_strategy": {k: {"n": v["n"], "accuracy": round(v["correct"] / v["n"], 3)} for k, v in by_strat.items()},
    }


def pattern_drill_correct_count() -> int:
    """Distinct scenarios answered correctly at least once — idempotent XP source."""
    with _conn() as c:
        row = c.execute(
            "SELECT COUNT(DISTINCT scenario) AS n FROM pattern_drills WHERE correct = 1").fetchone()
    return int(row["n"] or 0)


# --------------------------------------------------------------------------- #
# 3) risk-education counterfactual (real trades vs a labelled no-stop model)
# --------------------------------------------------------------------------- #
def risk_counterfactual() -> dict[str, Any]:
    from . import journal
    trades = [t for t in journal.fetch_all()["trades"]]
    chrono = sorted(trades, key=lambda t: int(t["id"]))
    n = len(chrono)
    if n < MIN_SAMPLE:
        return {"available": False, "n": n, "min_sample": MIN_SAMPLE,
                "note": f"Need {MIN_SAMPLE} closed trades for a meaningful comparison — you have {n}."}

    actual_curve: list[float] = [0.0]
    model_curve: list[float] = [0.0]
    a = m = 0.0
    losers = 0
    for t in chrono:
        r = float(t["r_multiple"] or 0.0)
        a += r
        # MODEL: if this was a loss (stop hit), assume no stop → it runs to NO_STOP_LOSS_R
        if r < 0:
            m += NO_STOP_LOSS_R
            losers += 1
        else:
            m += r
        actual_curve.append(round(a, 4))
        model_curve.append(round(m, 4))
    return {
        "available": True, "n": n, "min_sample": MIN_SAMPLE,
        "actual_r": round(a, 2), "model_r": round(m, 2),
        "gap_r": round(a - m, 2), "losers": losers, "no_stop_loss_r": NO_STOP_LOSS_R,
        "actual_curve": actual_curve, "model_curve": model_curve,
        "headline": f"Ignoring stops on these {n} trades: {round(m, 1)}R vs your {round(a, 1)}R.",
        "note": "The no-stop line is a TEACHING MODEL, not a record: it assumes every losing trade "
                f"runs to {NO_STOP_LOSS_R}R without a stop. Your real curve uses the stops you honored.",
    }


def clear() -> None:
    with _conn() as c:
        c.execute("DELETE FROM setup_comparisons")
        c.execute("DELETE FROM pattern_drills")
        c.commit()
