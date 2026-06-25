"""Phase-F social layer — multiplayer stubbed behind a swappable interface.

`SocialDataSource` is the swap seam: every social feature talks ONLY to it, so a
future `RemoteSocialSource` (real users) plugs in with zero feature rewrites.
`LocalSocialSource` is the DEFAULT and complete: it serves the user's REAL local
stats plus a small set of CLEARLY-LABELED sample profiles. No accounts, no
network — all of F works solo today.

HONESTY (project rule: no fabricated stats): every non-user/example entry is
flagged (`is_example` / `is_sample`). Sample profiles are illustrative teaching
aids, never presented as real rival traders. Real numbers only ever come from the
user's own journal.

Persistence is raw sqlite in the journal DB with idempotent CREATE TABLE, so the
deployed DB survives restart.
"""
from __future__ import annotations

import json
import sqlite3
import zlib
from abc import ABC, abstractmethod
from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel, Field

from .data.generator import generate_ohlcv, resample_ohlcv
from .engine.simulation import WARMUP
from .engine.types import INSTRUMENTS
from .journal import DB_PATH

DUEL_DAYS = 30
CONTEXT_BARS = 90
HORIZON = 30
ROLLING = 50  # the project's rolling-trade window for trader expectancy
WEEKLY_TARGET = 20  # community challenge: trades logged this ISO week
XP_DUEL_WIN = 6
_SYMS = ["MNQ", "MGC"]
_TFS = ["5m", "15m"]

# --------------------------------------------------------------------------- #
# bundled SAMPLE profiles — illustrative teaching aids, NOT real people.
# Every consumer surfaces the is_example flag so they're never shown as rivals.
# --------------------------------------------------------------------------- #
SAMPLE_TRADERS: list[dict[str, Any]] = [
    {"name": "Sample · Patient Breakout", "rolling_expectancy_r": 0.42, "n_trades": 50, "blurb": "waits for the retest"},
    {"name": "Sample · Mean Reverter", "rolling_expectancy_r": 0.18, "n_trades": 50, "blurb": "fades extremes in range"},
    {"name": "Sample · Trend Rider", "rolling_expectancy_r": 0.31, "n_trades": 50, "blurb": "pyramids with the trend"},
    {"name": "Sample · Over-trader", "rolling_expectancy_r": -0.12, "n_trades": 50, "blurb": "takes too many marginal setups"},
]

SAMPLE_SUCCESS: list[dict[str, Any]] = [
    {"name": "Illustrative · From tilt to discipline", "is_example": True,
     "story": "An illustrative arc: a trader who kept breaking their daily stop learned to honor it and turned a drawdown into a flat-then-up curve. Example, not a real account."},
    {"name": "Illustrative · Process over outcome", "is_example": True,
     "story": "An illustrative arc: chasing wins gave way to grading setups; win rate barely moved but expectancy rose as the bad trades were cut. Example, not a real account."},
]

SAMPLE_STUDENT_TRADES: list[dict[str, Any]] = [
    {"strategy": "FVG_RETEST", "direction": "long", "regime": "trending", "r_multiple": 1.8, "exit_reason": "target", "mistakes": ""},
    {"strategy": "ORB", "direction": "long", "regime": "trending", "r_multiple": -1.0, "exit_reason": "stop", "mistakes": "moved stop"},
    {"strategy": "VWAP_REVERSION", "direction": "short", "regime": "ranging", "r_multiple": 0.0, "exit_reason": "manual", "mistakes": "early exit"},
    {"strategy": "OB_RETEST", "direction": "long", "regime": "trending", "r_multiple": 2.1, "exit_reason": "target", "mistakes": ""},
    {"strategy": "BOS_CONTINUATION", "direction": "short", "regime": "high_vol", "r_multiple": -1.0, "exit_reason": "stop", "mistakes": "oversized"},
]


# --------------------------------------------------------------------------- #
# persistence (journal DB; idempotent)
# --------------------------------------------------------------------------- #
def _conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), timeout=5)
    conn.row_factory = sqlite3.Row
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS duel_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            scenario TEXT NOT NULL,
            user_direction TEXT, user_confidence INTEGER,
            opponent_name TEXT, opponent_direction TEXT, opponent_confidence INTEGER,
            correct_direction TEXT, winner TEXT
        );
        CREATE TABLE IF NOT EXISTS mentor_feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            student_ref TEXT, per_trade TEXT, overall TEXT
        );
        CREATE TABLE IF NOT EXISTS imported_strategies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            name TEXT, origin TEXT
        );
        CREATE TABLE IF NOT EXISTS community_contributions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            challenge_id TEXT, progress INTEGER
        );
        """
    )
    return conn


# --------------------------------------------------------------------------- #
# real local stats (no fabrication — straight from the journal)
# --------------------------------------------------------------------------- #
def _rolling_expectancy() -> dict[str, Any]:
    from . import journal
    trades = journal.fetch_all()["trades"]
    chrono = sorted(trades, key=lambda t: int(t["id"]))[-ROLLING:]
    n = len(chrono)
    if n == 0:
        return {"n": 0, "expectancy_r": None}
    rs = [float(t["r_multiple"] or 0.0) for t in chrono]
    return {"n": n, "expectancy_r": round(sum(rs) / n, 4)}


# --------------------------------------------------------------------------- #
# duel scenario helpers (synthetic, deterministic, server-authoritative)
# --------------------------------------------------------------------------- #
def _synth_df(symbol: str, timeframe: str, seed: int) -> Any:
    inst = INSTRUMENTS[symbol]
    return resample_ohlcv(generate_ohlcv(inst, days=DUEL_DAYS, seed=seed), timeframe)


def _candles(df: Any, lo: int, hi: int) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for k in range(lo, hi):
        r = df.iloc[k]
        out.append({"time": int(df.index[k].timestamp()), "open": round(float(r.open), 4),
                    "high": round(float(r.high), 4), "low": round(float(r.low), 4),
                    "close": round(float(r.close), 4)})
    return out


def _correct_direction(symbol: str, timeframe: str, seed: int, i: int) -> str:
    df = _synth_df(symbol, timeframe, seed)
    j = min(i + HORIZON, len(df) - 1)
    fwd = float(df.iloc[j].close) - float(df.iloc[i].close)
    return "long" if fwd >= 0 else "short"


# --------------------------------------------------------------------------- #
# THE SWAP SEAM
# --------------------------------------------------------------------------- #
class SocialDataSource(ABC):
    """Everything social goes through this. LocalSocialSource is the default;
    a RemoteSocialSource (real users) can replace it later with no feature edits."""

    @abstractmethod
    def leaderboard(self) -> list[dict[str, Any]]: ...

    @abstractmethod
    def duel_opponent(self, scenario: str) -> dict[str, Any]: ...

    @abstractmethod
    def community_aggregate(self, challenge_id: str) -> dict[str, Any]: ...

    @abstractmethod
    def mentor_student(self, use_self: bool) -> dict[str, Any]: ...

    @abstractmethod
    def success_examples(self) -> list[dict[str, Any]]: ...


class LocalSocialSource(SocialDataSource):
    """Complete, production-ready local implementation: real user stats blended
    with clearly-labeled samples. No network, no accounts."""

    def leaderboard(self) -> list[dict[str, Any]]:
        me = _rolling_expectancy()
        rows: list[dict[str, Any]] = [{
            "name": "You", "is_user": True, "is_example": False,
            "rolling_expectancy_r": me["expectancy_r"], "n_trades": me["n"],
            "blurb": "your real rolling-50 expectancy" if me["n"] else "log trades to rank",
        }]
        for s in SAMPLE_TRADERS:
            rows.append({**s, "is_user": False, "is_example": True})
        # rank by expectancy; entries without enough data sort last
        rows.sort(key=lambda r: (r["rolling_expectancy_r"] is None, -(r["rolling_expectancy_r"] or 0.0)))
        for idx, r in enumerate(rows):
            r["rank"] = idx + 1
        return rows

    def duel_opponent(self, scenario: str) -> dict[str, Any]:
        h = zlib.crc32(scenario.encode())
        return {
            "name": "PracticeBot",
            "is_example": True,
            "direction": "long" if h % 2 == 0 else "short",
            "confidence": 5 + (h // 7) % 5,  # 5..9, deterministic
        }

    def community_aggregate(self, challenge_id: str) -> dict[str, Any]:
        # illustrative sample aggregate — clearly marked, never real participants
        h = zlib.crc32(challenge_id.encode())
        return {
            "is_sample": True,
            "participants": 120 + h % 80,
            "avg_progress": round(0.4 + (h % 30) / 100.0, 2),  # 0.40..0.69
            "target": WEEKLY_TARGET,
            "note": "Illustrative community aggregate (sample) — not real participants.",
        }

    def mentor_student(self, use_self: bool) -> dict[str, Any]:
        if use_self:
            from . import journal
            trades = journal.fetch_all()["trades"][:ROLLING]
            return {"name": "Your past session (self-review)", "is_example": False,
                    "trades": [{"strategy": t["strategy"], "direction": t["direction"], "regime": t["regime"],
                                "r_multiple": float(t["r_multiple"] or 0.0), "exit_reason": t["exit_reason"],
                                "mistakes": t.get("mistakes") or ""} for t in trades]}
        return {"name": "Sample student (example)", "is_example": True, "trades": list(SAMPLE_STUDENT_TRADES)}

    def success_examples(self) -> list[dict[str, Any]]:
        return list(SAMPLE_SUCCESS)


def get_source() -> SocialDataSource:
    """The active social source. LocalSocialSource today; swap here later."""
    return LocalSocialSource()


# --------------------------------------------------------------------------- #
# 3) duels
# --------------------------------------------------------------------------- #
def new_duel() -> dict[str, Any]:
    import random
    symbol = random.choice(_SYMS)
    timeframe = random.choice(_TFS)
    seed = random.randint(1, 9999)
    df = _synth_df(symbol, timeframe, seed)
    lo, hi = WARMUP + CONTEXT_BARS, len(df) - HORIZON - 1
    if hi <= lo:
        raise ValueError("could not build a duel scenario")
    i = random.randint(lo, hi)
    scenario = f"{symbol}:{timeframe}:{seed}:{i}"
    opp = get_source().duel_opponent(scenario)
    return {
        "scenario": scenario, "symbol": symbol, "timeframe": timeframe, "decision_index": i,
        "candles": _candles(df, i - CONTEXT_BARS, i + 1),
        "opponent": {"name": opp["name"], "is_example": opp["is_example"]},  # prediction hidden until score
    }


class DuelScoreIn(BaseModel):
    scenario: str
    direction: str       # long | short
    confidence: int = 5  # 1..10


def score_duel(req: DuelScoreIn) -> dict[str, Any]:
    try:
        symbol, timeframe, seed_s, idx_s = req.scenario.split(":")
        seed, i = int(seed_s), int(idx_s)
    except (ValueError, IndexError) as exc:
        raise ValueError("bad scenario id") from exc
    correct = _correct_direction(symbol, timeframe, seed, i)
    opp = get_source().duel_opponent(req.scenario)
    user_conf = max(1, min(10, int(req.confidence)))
    user_correct = req.direction == correct
    opp_correct = opp["direction"] == correct
    user_score = user_conf * (1 if user_correct else 0)
    opp_score = int(opp["confidence"]) * (1 if opp_correct else 0)
    winner = "user" if user_score > opp_score else "opponent" if opp_score > user_score else "tie"

    with _conn() as c:
        c.execute(
            """INSERT INTO duel_results (created_at, scenario, user_direction, user_confidence,
               opponent_name, opponent_direction, opponent_confidence, correct_direction, winner)
               VALUES (datetime('now'),?,?,?,?,?,?,?,?)""",
            (req.scenario, req.direction, user_conf, opp["name"], opp["direction"],
             int(opp["confidence"]), correct, winner))
        c.commit()
    return {"correct_direction": correct, "winner": winner,
            "user": {"direction": req.direction, "confidence": user_conf, "correct": user_correct, "score": user_score},
            "opponent": {**opp, "correct": opp_correct, "score": opp_score},
            "history": duel_history()}


def duel_history() -> dict[str, Any]:
    with _conn() as c:
        rows = [dict(r) for r in c.execute("SELECT * FROM duel_results ORDER BY id DESC LIMIT 50").fetchall()]
    wins = sum(1 for r in rows if r["winner"] == "user")
    losses = sum(1 for r in rows if r["winner"] == "opponent")
    ties = sum(1 for r in rows if r["winner"] == "tie")
    return {"n": len(rows), "wins": wins, "losses": losses, "ties": ties, "recent": rows[:20]}


def duel_wins_count() -> int:
    """Distinct scenarios the user has won — idempotent XP source."""
    with _conn() as c:
        row = c.execute("SELECT COUNT(DISTINCT scenario) AS n FROM duel_results WHERE winner='user'").fetchone()
    return int(row["n"] or 0)


# --------------------------------------------------------------------------- #
# 2) strategy sharing (import logging — export/encode is client-side)
# --------------------------------------------------------------------------- #
def log_import(name: str, origin: str) -> int:
    with _conn() as c:
        cur = c.execute("INSERT INTO imported_strategies (created_at, name, origin) VALUES (datetime('now'),?,?)",
                        (name, origin))
        c.commit()
        return int(cur.lastrowid or 0)


# --------------------------------------------------------------------------- #
# 4) community challenge
# --------------------------------------------------------------------------- #
def _iso_week(dt: datetime) -> str:
    y, w, _ = dt.isocalendar()
    return f"{y}-W{w:02d}"


def current_week() -> str:
    return _iso_week(datetime.now(tz=UTC))


def _row_week(t: dict[str, Any]) -> str | None:
    raw = str(t.get("created_at") or "")[:10]  # sqlite datetime('now') → "YYYY-MM-DD ..."
    try:
        return _iso_week(datetime.fromisoformat(raw).replace(tzinfo=UTC))
    except ValueError:
        return None


def community_challenge(now_week: str) -> dict[str, Any]:
    """User's REAL weekly progress (trades logged this ISO week) + a labeled
    sample community aggregate from the source."""
    from . import journal
    trades = journal.fetch_all()["trades"]
    mine = sum(1 for t in trades if _row_week(t) == now_week)
    challenge_id = f"weekly-trades-{now_week}"
    agg = get_source().community_aggregate(challenge_id)
    return {
        "challenge_id": challenge_id, "week": now_week, "title": f"Log {WEEKLY_TARGET} graded trades this week",
        "target": WEEKLY_TARGET, "user_progress": min(mine, WEEKLY_TARGET), "user_raw": mine,
        "user_complete": mine >= WEEKLY_TARGET, "community": agg,
    }


def record_contribution(challenge_id: str, progress: int) -> int:
    with _conn() as c:
        cur = c.execute("INSERT INTO community_contributions (created_at, challenge_id, progress) VALUES (datetime('now'),?,?)",
                        (challenge_id, int(progress)))
        c.commit()
        return int(cur.lastrowid or 0)


# --------------------------------------------------------------------------- #
# 5) mentor mode
# --------------------------------------------------------------------------- #
class MentorFeedbackIn(BaseModel):
    student_ref: str = "sample"
    per_trade: dict[str, str] = Field(default_factory=dict)
    overall: str = ""


def add_mentor_feedback(f: MentorFeedbackIn) -> int:
    with _conn() as c:
        cur = c.execute("INSERT INTO mentor_feedback (created_at, student_ref, per_trade, overall) VALUES (datetime('now'),?,?,?)",
                        (f.student_ref, json.dumps(f.per_trade), f.overall))
        c.commit()
        return int(cur.lastrowid or 0)


# --------------------------------------------------------------------------- #
# 6) success stories — REAL user milestones + labeled examples
# --------------------------------------------------------------------------- #
def success_stories() -> dict[str, Any]:
    from . import journal, progression
    stats = journal.fetch_all()["stats"]
    prog = progression.summary()
    n = int(stats["n"])
    milestones: list[dict[str, Any]] = []
    if n > 0:
        milestones.append({"label": "Trades logged", "value": str(n), "real": True})
        if stats.get("expectancy_r") is not None:
            milestones.append({"label": "Expectancy", "value": f"{stats['expectancy_r']}R", "real": True})
        milestones.append({"label": "Best win streak", "value": str(stats["streaks"]["best_win"]), "real": True})
        milestones.append({"label": "Tier", "value": str(prog["xp"]["tier"]["tier"]), "real": True})
    return {
        "has_real": n > 0,
        "milestones": milestones,
        "note": "Your milestones are computed from your real journal. Examples below are illustrative — not real traders.",
        "examples": get_source().success_examples(),
    }


def clear() -> None:
    with _conn() as c:
        c.execute("DELETE FROM duel_results")
        c.execute("DELETE FROM mentor_feedback")
        c.execute("DELETE FROM imported_strategies")
        c.execute("DELETE FROM community_contributions")
        c.commit()
