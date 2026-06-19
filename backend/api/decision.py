"""Decision-point training — server-authoritative.

Serves a chart window paused at a decision bar (no future leaked), then scores
the user's Buy/Sell/Wait/Pass + stop/target by simulating the *real* next bars.
Difficulty selects the regime (Beginner = clean trend, Advanced = choppy/high-vol).
Decisions are logged so accuracy can be tracked. Synthetic data — practice only.
"""
from __future__ import annotations

import random
import sqlite3

from pydantic import BaseModel

from ..data.generator import generate_ohlcv, resample_ohlcv
from ..engine.simulation import WARMUP
from ..engine.strategies import build_context
from ..engine.types import INSTRUMENTS
from ..journal import DB_PATH

DAYS = 60
CONTEXT_BARS = 90
HORIZON = 30           # bars revealed / simulated forward
DIFFICULTY_REGIME = {
    "beginner": "trending",
    "intermediate": "ranging",
    "advanced": "high_vol",
}
_SYMS = ["MNQ", "MGC"]
_TFS = ["5m", "15m"]


def _ensure_table() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), timeout=5)
    conn.row_factory = sqlite3.Row
    conn.executescript(
        """CREATE TABLE IF NOT EXISTS decisions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            difficulty TEXT, symbol TEXT, timeframe TEXT, action TEXT,
            direction_correct INTEGER, score INTEGER, r_multiple REAL,
            outcome TEXT, why TEXT
        )""")
    return conn


class NewResponse(BaseModel):
    id: str
    difficulty: str
    symbol: str
    timeframe: str
    decision_index: int
    candles: list[dict]
    atr: float
    regime: str
    suggested_stop_pts: float
    suggested_target_pts: float
    last_close: float


class ScoreRequest(BaseModel):
    id: str
    action: str            # buy | sell | wait | pass
    why: str = ""
    stop: float | None = None
    target: float | None = None


def _candles(df, lo: int, hi: int) -> list[dict]:
    out = []
    for k in range(lo, hi):
        ts = df.index[k]
        r = df.iloc[k]
        out.append({"time": int(ts.timestamp()), "open": round(float(r.open), 4),
                    "high": round(float(r.high), 4), "low": round(float(r.low), 4),
                    "close": round(float(r.close), 4)})
    return out


def _build(symbol: str, timeframe: str, seed: int):
    inst = INSTRUMENTS[symbol]
    df = resample_ohlcv(generate_ohlcv(inst, days=DAYS, seed=seed), timeframe)
    return inst, df


def new_scenario(difficulty: str) -> NewResponse:
    difficulty = difficulty if difficulty in DIFFICULTY_REGIME else "beginner"
    want = DIFFICULTY_REGIME[difficulty]
    for _ in range(8):  # a few tries to find a decision bar in the wanted regime
        symbol = random.choice(_SYMS)
        timeframe = random.choice(_TFS)
        seed = random.randint(1, 9999)
        inst, df = _build(symbol, timeframe, seed)
        ctx = build_context(df, inst)
        n = len(df)
        lo, hi = WARMUP + CONTEXT_BARS, n - HORIZON - 1
        if hi <= lo:
            continue
        cands = [i for i in range(lo, hi) if ctx.regimes[i] == want]
        if not cands:
            cands = list(range(lo, hi))  # fall back to any bar
        i = random.choice(cands)
        atr = float(ctx.atr[i]) if ctx.atr[i] == ctx.atr[i] else 0.0
        stop_pts = round(max(inst.tick_size * 4, atr * 1.5), 2)
        return NewResponse(
            id=f"{symbol}:{timeframe}:{seed}:{i}:{difficulty}",
            difficulty=difficulty, symbol=symbol, timeframe=timeframe, decision_index=i,
            candles=_candles(df, i - CONTEXT_BARS, i + 1),
            atr=round(atr, 4), regime=ctx.regimes[i],
            suggested_stop_pts=stop_pts, suggested_target_pts=round(stop_pts * 2, 2),
            last_close=round(float(df.iloc[i].close), 4))
    raise ValueError("could not build a decision scenario")


def _simulate(df, i: int, direction: int, entry: float, stop: float, target: float):
    """Walk forward up to HORIZON bars; return (outcome, exit_price, bars)."""
    for k in range(i + 1, min(i + 1 + HORIZON, len(df))):
        hi = float(df.iloc[k].high); lo = float(df.iloc[k].low)
        if direction > 0:
            if lo <= stop:
                return "stop", stop, k - i
            if hi >= target:
                return "target", target, k - i
        else:
            if hi >= stop:
                return "stop", stop, k - i
            if lo <= target:
                return "target", target, k - i
    return "timeout", float(df.iloc[min(i + HORIZON, len(df) - 1)].close), HORIZON


def score(req: ScoreRequest) -> dict:
    try:
        parts = req.id.split(":")
        symbol, timeframe, seed_s, idx_s = parts[0], parts[1], parts[2], parts[3]
        difficulty = parts[4] if len(parts) > 4 else "?"
        seed, i = int(seed_s), int(idx_s)
    except (ValueError, IndexError):
        raise ValueError("bad scenario id")
    inst, df = _build(symbol, timeframe, seed)
    entry = float(df.iloc[i].close)
    reveal = _candles(df, i + 1, min(i + 1 + HORIZON, len(df)))
    fwd = float(df.iloc[min(i + HORIZON, len(df) - 1)].close) - entry
    atr = float(build_context(df, inst).atr[i])
    atr = atr if atr == atr else abs(entry) * 0.002

    action = req.action.lower()
    direction = 1 if action == "buy" else (-1 if action == "sell" else 0)
    dir_score = 0
    risk_score = 0
    outcome = "no-trade"
    r_mult = 0.0
    notes: list[str] = []

    if direction != 0:
        stop = req.stop if req.stop is not None else (entry - direction * 1.5 * atr)
        target = req.target if req.target is not None else (entry + direction * 3 * atr)
        # risk management scoring (0-40)
        stop_ok = (stop < entry) if direction > 0 else (stop > entry)
        tgt_ok = (target > entry) if direction > 0 else (target < entry)
        risk = abs(entry - stop)
        rr = abs(target - entry) / risk if risk > 0 else 0
        if stop_ok:
            risk_score += 12
        else:
            notes.append("Your stop was on the wrong side of entry — that's not a stop.")
        if tgt_ok:
            risk_score += 8
        if rr >= 2:
            risk_score += 20
        elif rr >= 1.5:
            risk_score += 15
        elif rr >= 1:
            risk_score += 8
        else:
            notes.append(f"Reward:risk was only {rr:.1f}:1 — aim for ≥1.5:1.")
        if stop_ok and tgt_ok:
            outcome, exit_price, _bars = _simulate(df, i, direction, entry, stop, target)
            r_mult = round((exit_price - entry) * direction / risk, 3) if risk > 0 else 0.0
            # direction scoring (0-60)
            if outcome == "target":
                dir_score = 60; notes.append("Target hit before stop — clean read.")
            elif outcome == "timeout" and r_mult > 0:
                dir_score = 40; notes.append("Moved your way but didn't reach target in time.")
            elif outcome == "timeout":
                dir_score = 25; notes.append("Chopped sideways — no follow-through.")
            else:
                dir_score = 0; notes.append("Stopped out — the read was wrong or early.")
        else:
            outcome = "invalid"
            notes.append("Trade not simulated — fix the stop/target sides.")
    else:
        # Wait / Pass — reward patience when there was no clean move to miss
        outcome = "no-trade"
        if abs(fwd) < 0.6 * atr:
            dir_score = 55; notes.append("Good patience — there was no clean move to catch.")
        else:
            dir_score = 25; notes.append(f"Price did move {fwd:+.1f} pts — a setup may have been there.")
        risk_score = 30  # no capital risked
        notes.append("No trade = no risk. Capital preservation is a valid choice.")

    total = int(max(0, min(100, dir_score + risk_score)))
    direction_correct = bool((direction > 0 and fwd > 0) or (direction < 0 and fwd < 0)
                             or (direction == 0 and abs(fwd) < 0.6 * atr))

    conn = _ensure_table()
    with conn:
        conn.execute(
            """INSERT INTO decisions (created_at, difficulty, symbol, timeframe, action,
               direction_correct, score, r_multiple, outcome, why)
               VALUES (datetime('now'),?,?,?,?,?,?,?,?,?)""",
            (difficulty, symbol, timeframe, action, int(direction_correct), total, r_mult, outcome, req.why[:500]))
        conn.commit()
    return {
        "reveal": reveal, "decision_index": i, "entry": round(entry, 4),
        "outcome": outcome, "r_multiple": r_mult, "direction_correct": direction_correct,
        "direction_score": dir_score, "risk_score": risk_score, "total_score": total,
        "forward_move": round(fwd, 2), "notes": notes, "stats": stats(),
    }


def stats() -> dict:
    conn = _ensure_table()
    rows = [dict(r) for r in conn.execute("SELECT * FROM decisions").fetchall()]
    conn.close()
    n = len(rows)
    if n == 0:
        return {"n": 0, "accuracy": None, "avg_score": None, "by_difficulty": {}}
    correct = sum(1 for r in rows if r["direction_correct"])
    by_diff: dict[str, dict] = {}
    for r in rows:
        d = by_diff.setdefault(r["difficulty"] or "?", {"n": 0, "correct": 0, "score": 0})
        d["n"] += 1; d["correct"] += int(r["direction_correct"]); d["score"] += r["score"]
    return {
        "n": n,
        "accuracy": round(correct / n, 4),
        "avg_score": round(sum(r["score"] for r in rows) / n, 1),
        "by_difficulty": {k: {"n": v["n"], "accuracy": round(v["correct"] / v["n"], 3),
                              "avg_score": round(v["score"] / v["n"], 1)} for k, v in by_diff.items()},
    }


def clear() -> None:
    conn = _ensure_table()
    with conn:
        conn.execute("DELETE FROM decisions")
        conn.commit()
