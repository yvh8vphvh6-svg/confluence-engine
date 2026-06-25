"""Trading journal — the user's own practice record (SQLite at output/journal.db).

Stores paper trades (with prediction + trade-quality breakdowns), missed
qualified setups, free-text notes, mood sessions, and generated session reviews;
computes performance stats, a weekly review, and confidence calibration. Paper
trades only — no real execution. Honesty: every number is computed from the
user's own logged records; with no data the outputs are empty, never invented.

Persistence is raw sqlite3 (this repo has no ORM); schema changes are applied
idempotently on connect via CREATE TABLE IF NOT EXISTS + ALTER TABLE ADD COLUMN.
"""
from __future__ import annotations

import json
import sqlite3
from collections import Counter
from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel, Field

from .config.settings import get_settings

_settings = get_settings()
DB_PATH = _settings.memory_db_path.parent / "journal.db"
_DB = DB_PATH  # backward-compat alias

SCHEMA = """
CREATE TABLE IF NOT EXISTS paper_trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    symbol TEXT, timeframe TEXT, strategy TEXT, direction TEXT, regime TEXT,
    entry_price REAL, exit_price REAL, stop REAL, target REAL,
    contracts REAL, r_multiple REAL, pnl_dollars REAL, exit_reason TEXT,
    opened_at TEXT, closed_at TEXT, note TEXT, emotion TEXT, mistakes TEXT
);
CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    text TEXT NOT NULL, emotion TEXT, trade_id INTEGER
);
CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    mood TEXT, confidence INTEGER, goals TEXT, notes TEXT
);
CREATE TABLE IF NOT EXISTS missed_setups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    symbol TEXT, timeframe TEXT, strategy TEXT, direction TEXT, regime TEXT,
    r_potential REAL, confluence REAL, confidence INTEGER, decision_ms INTEGER,
    predicted_direction TEXT, rationale TEXT
);
CREATE TABLE IF NOT EXISTS session_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    started_at TEXT, ended_at TEXT,
    setups_seen INTEGER, taken INTEGER, wins INTEGER, losses INTEGER,
    skipped_qualified INTEGER, missed_r REAL, avg_quality REAL,
    calibration TEXT, focuses TEXT, reason TEXT
);
CREATE TABLE IF NOT EXISTS cooldown_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    type TEXT NOT NULL,          -- 'tilt' | 'max_loss'
    started_at TEXT,
    length_min INTEGER,
    ended_early INTEGER,         -- nullable bool: 1 = ended early, 0 = ran full
    session_id INTEGER
);
"""

# Columns added after the original paper_trades schema shipped; applied via
# ALTER TABLE on connect so pre-existing DBs upgrade cleanly.
_TRADE_MIGRATIONS: dict[str, str] = {
    "mistakes": "TEXT",
    "predicted_direction": "TEXT",
    "prediction_correct": "INTEGER",
    "confidence": "INTEGER",
    "decision_ms": "INTEGER",
    "take_skip_rationale": "TEXT",
    "quality_setup": "REAL",
    "quality_risk": "REAL",
    "quality_execution": "REAL",
    "quality_outcome": "REAL",
    "quality_total": "REAL",
    "won_lost_factors": "TEXT",
    "snapshot": "TEXT",  # pattern-library: JSON bar-window + overlays captured at trade time
    # discipline layer (all nullable so deployed DBs upgrade cleanly)
    "post_trade_feeling": "TEXT",      # "good" | "neutral" | "bad"
    "was_post_tilt": "INTEGER",         # 1 = taken while a tilt warning was active
    "was_revenge_override": "INTEGER",  # 1 = taken by overriding a tilt cooldown
    "pre_emotional_state": "TEXT",      # denormalized session check-in, for correlation
}

# sessions predate the discipline layer; add its column idempotently on connect.
_SESSION_MIGRATIONS: dict[str, str] = {
    "pre_emotional_state": "TEXT",
}

# canonical mistake tags surfaced in the UI
MISTAKE_TAGS = ["FOMO", "moved stop", "oversized", "traded news", "revenge",
                "off-plan", "early entry", "late entry"]

# one-tap rationale chips captured on Take / Skip
RATIONALE_CHIPS = ["Setup quality", "Timing", "Risk", "Gut feeling"]


class QualityIn(BaseModel):
    setup: float = 0.0
    risk: float = 0.0
    execution: float = 0.0
    outcome: float = 0.0
    total: float = 0.0


class WonLostFactor(BaseModel):
    label: str
    score: float
    note: str = ""


class PaperTradeIn(BaseModel):
    symbol: str = ""
    timeframe: str = ""
    strategy: str = ""
    direction: str = ""
    regime: str = ""
    entry_price: float = 0.0
    exit_price: float = 0.0
    stop: float = 0.0
    target: float = 0.0
    contracts: float = 0.0
    r_multiple: float = 0.0
    pnl_dollars: float = 0.0
    exit_reason: str = ""
    opened_at: str = ""
    closed_at: str = ""
    note: str = ""
    emotion: str = ""
    mistakes: list[str] = Field(default_factory=list)
    # learning-loop fields (all optional / nullable)
    predicted_direction: str = ""
    prediction_correct: bool | None = None
    confidence: int | None = None
    decision_ms: int | None = None
    take_skip_rationale: str = ""
    quality: QualityIn | None = None
    won_lost_factors: list[WonLostFactor] = Field(default_factory=list)
    snapshot: dict[str, Any] | None = None  # pattern-library bar-window + overlays
    # discipline layer (all optional / nullable)
    post_trade_feeling: str = ""
    was_post_tilt: bool | None = None
    was_revenge_override: bool | None = None
    pre_emotional_state: str = ""


class NoteIn(BaseModel):
    text: str
    emotion: str = ""
    trade_id: int | None = None


class SessionIn(BaseModel):
    mood: str = ""
    confidence: int = 3
    goals: str = ""
    notes: str = ""
    pre_emotional_state: str = ""  # pre-session check-in: Focused/Frustrated/Tired/Excited


class MissedSetupIn(BaseModel):
    symbol: str = ""
    timeframe: str = ""
    strategy: str = ""
    direction: str = ""
    regime: str = ""
    r_potential: float = 0.0
    confluence: float = 0.0
    confidence: int | None = None
    decision_ms: int | None = None
    predicted_direction: str = ""
    rationale: str = ""


class SessionReviewIn(BaseModel):
    started_at: str = ""
    ended_at: str = ""
    setups_seen: int = 0
    taken: int = 0
    wins: int = 0
    losses: int = 0
    skipped_qualified: int = 0
    missed_r: float = 0.0
    avg_quality: float | None = None
    calibration: list[dict[str, Any]] = Field(default_factory=list)
    focuses: list[str] = Field(default_factory=list)
    reason: str = "manual"


class CooldownEventIn(BaseModel):
    type: str = "tilt"  # "tilt" | "max_loss"
    started_at: str = ""
    length_min: int = 0
    ended_early: bool | None = None
    session_id: int | None = None


def ensure_columns(conn: sqlite3.Connection, table: str, columns: dict[str, str]) -> None:
    """Idempotently add any missing columns. Checks PRAGMA table_info first AND
    tolerates a duplicate-column race, so it's safe to run on every connect
    against an already-deployed DB. Every added column is nullable (no NOT NULL,
    no default required) so existing rows stay valid."""
    existing = {r[1] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()}
    for name, decl in columns.items():
        if name in existing:
            continue
        try:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {decl}")
        except sqlite3.OperationalError as exc:  # pragma: no cover - race guard
            if "duplicate column" not in str(exc).lower():
                raise


def _conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), timeout=5)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    ensure_columns(conn, "paper_trades", _TRADE_MIGRATIONS)
    ensure_columns(conn, "sessions", _SESSION_MIGRATIONS)
    return conn


def add_trade(t: PaperTradeIn) -> int:
    q = t.quality
    with _conn() as c:
        cur = c.execute(
            """INSERT INTO paper_trades
               (created_at, symbol, timeframe, strategy, direction, regime,
                entry_price, exit_price, stop, target, contracts, r_multiple,
                pnl_dollars, exit_reason, opened_at, closed_at, note, emotion, mistakes,
                predicted_direction, prediction_correct, confidence, decision_ms,
                take_skip_rationale, quality_setup, quality_risk, quality_execution,
                quality_outcome, quality_total, won_lost_factors, snapshot,
                post_trade_feeling, was_post_tilt, was_revenge_override, pre_emotional_state)
               VALUES (datetime('now'),?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (t.symbol, t.timeframe, t.strategy, t.direction, t.regime,
             t.entry_price, t.exit_price, t.stop, t.target, t.contracts, t.r_multiple,
             t.pnl_dollars, t.exit_reason, t.opened_at, t.closed_at, t.note, t.emotion,
             ",".join(t.mistakes),
             t.predicted_direction,
             None if t.prediction_correct is None else int(t.prediction_correct),
             t.confidence, t.decision_ms, t.take_skip_rationale,
             q.setup if q else None, q.risk if q else None, q.execution if q else None,
             q.outcome if q else None, q.total if q else None,
             json.dumps([f.model_dump() for f in t.won_lost_factors]),
             json.dumps(t.snapshot) if t.snapshot is not None else None,
             t.post_trade_feeling or None,
             None if t.was_post_tilt is None else int(t.was_post_tilt),
             None if t.was_revenge_override is None else int(t.was_revenge_override),
             t.pre_emotional_state or None))
        c.commit()
        return int(cur.lastrowid or 0)


def set_trade_feeling(trade_id: int, feeling: str) -> None:
    """Attach an optional post-trade micro check-in to an already-logged trade.
    Idempotent: re-tapping just overwrites the same row's column."""
    with _conn() as c:
        c.execute("UPDATE paper_trades SET post_trade_feeling = ? WHERE id = ?", (feeling, trade_id))
        c.commit()


def add_note(n: NoteIn) -> int:
    with _conn() as c:
        cur = c.execute(
            "INSERT INTO notes (created_at, text, emotion, trade_id) VALUES (datetime('now'),?,?,?)",
            (n.text, n.emotion, n.trade_id))
        c.commit()
        return int(cur.lastrowid or 0)


def add_session(s: SessionIn) -> int:
    with _conn() as c:
        cur = c.execute(
            "INSERT INTO sessions (created_at, mood, confidence, goals, notes, pre_emotional_state) "
            "VALUES (datetime('now'),?,?,?,?,?)",
            (s.mood, s.confidence, s.goals, s.notes, s.pre_emotional_state))
        c.commit()
        return int(cur.lastrowid or 0)


def add_cooldown_event(e: CooldownEventIn) -> int:
    with _conn() as c:
        cur = c.execute(
            """INSERT INTO cooldown_events
               (created_at, type, started_at, length_min, ended_early, session_id)
               VALUES (datetime('now'),?,?,?,?,?)""",
            (e.type, e.started_at, e.length_min,
             None if e.ended_early is None else int(e.ended_early), e.session_id))
        c.commit()
        return int(cur.lastrowid or 0)


def add_missed_setup(m: MissedSetupIn) -> int:
    with _conn() as c:
        cur = c.execute(
            """INSERT INTO missed_setups
               (created_at, symbol, timeframe, strategy, direction, regime,
                r_potential, confluence, confidence, decision_ms, predicted_direction, rationale)
               VALUES (datetime('now'),?,?,?,?,?,?,?,?,?,?,?)""",
            (m.symbol, m.timeframe, m.strategy, m.direction, m.regime,
             m.r_potential, m.confluence, m.confidence, m.decision_ms, m.predicted_direction, m.rationale))
        c.commit()
        return int(cur.lastrowid or 0)


def add_session_review(s: SessionReviewIn) -> int:
    with _conn() as c:
        cur = c.execute(
            """INSERT INTO session_reviews
               (created_at, started_at, ended_at, setups_seen, taken, wins, losses,
                skipped_qualified, missed_r, avg_quality, calibration, focuses, reason)
               VALUES (datetime('now'),?,?,?,?,?,?,?,?,?,?,?,?)""",
            (s.started_at, s.ended_at, s.setups_seen, s.taken, s.wins, s.losses,
             s.skipped_qualified, s.missed_r, s.avg_quality,
             json.dumps(s.calibration), json.dumps(s.focuses), s.reason))
        c.commit()
        return int(cur.lastrowid or 0)


def clear() -> None:
    with _conn() as c:
        c.execute("DELETE FROM paper_trades")
        c.execute("DELETE FROM notes")
        c.execute("DELETE FROM sessions")
        c.execute("DELETE FROM missed_setups")
        c.execute("DELETE FROM session_reviews")
        c.execute("DELETE FROM cooldown_events")
        c.commit()


def _streaks(rs: list[float]) -> dict[str, int]:
    """Current and best win/loss streaks over the (chronological) R sequence."""
    best_win = best_loss = cur = 0
    cur_sign = 0
    for r in rs:
        s = 1 if r > 0 else (-1 if r < 0 else 0)
        if s == 0:
            cur = 0
            cur_sign = 0
            continue
        cur = cur + 1 if s == cur_sign else 1
        cur_sign = s
        if s > 0:
            best_win = max(best_win, cur)
        else:
            best_loss = max(best_loss, cur)
    current = cur * cur_sign
    return {"current": current, "best_win": best_win, "best_loss": best_loss}


def _hold_minutes(t: dict[str, Any]) -> float | None:
    try:
        o, cl = int(float(t["opened_at"])), int(float(t["closed_at"]))
        if cl >= o:
            return (cl - o) / 60.0
    except (ValueError, TypeError, KeyError):
        return None
    return None


def _stats(trades: list[dict[str, Any]]) -> dict[str, Any]:
    n = len(trades)
    if n == 0:
        return {"n": 0, "wins": 0, "losses": 0, "breakeven": 0, "win_rate": None,
                "expectancy_r": None, "avg_win_r": None, "avg_loss_r": None,
                "profit_factor": None, "net_pnl": 0.0, "max_drawdown_r": 0.0,
                "avg_hold_min": None, "streaks": {"current": 0, "best_win": 0, "best_loss": 0},
                "by_exit": {}, "by_emotion": {}, "by_strategy": {}, "by_mistake": {},
                "mistakes": [], "avg_quality": None, "prediction_accuracy": None}
    # chronological order (oldest first) for streaks / equity / drawdown
    chrono = sorted(trades, key=lambda t: t["id"])
    rs = [t["r_multiple"] or 0.0 for t in chrono]
    wins = [r for r in rs if r > 0]
    losses = [r for r in rs if r < 0]
    be = [r for r in rs if r == 0]
    gp = sum(t["pnl_dollars"] or 0 for t in chrono if (t["pnl_dollars"] or 0) > 0)
    gl = sum(t["pnl_dollars"] or 0 for t in chrono if (t["pnl_dollars"] or 0) < 0)
    pf = (gp / abs(gl)) if gl < 0 else None
    # max drawdown on cumulative R
    cum = 0.0
    peak = 0.0
    maxdd = 0.0
    for r in rs:
        cum += r
        peak = max(peak, cum)
        maxdd = min(maxdd, cum - peak)
    by_exit: dict[str, int] = {}
    by_emotion: dict[str, dict[str, float]] = {}
    by_strategy: dict[str, dict[str, float]] = {}
    by_mistake: Counter[str] = Counter()
    holds: list[float] = []
    quals: list[float] = []
    preds = [t for t in chrono if t.get("prediction_correct") is not None]
    for t in chrono:
        by_exit[t["exit_reason"] or "?"] = by_exit.get(t["exit_reason"] or "?", 0) + 1
        emo = t["emotion"] or "untagged"
        es = by_emotion.setdefault(emo, {"n": 0, "r": 0.0})
        es["n"] += 1
        es["r"] += t["r_multiple"] or 0.0
        strat = t["strategy"] or "?"
        ss = by_strategy.setdefault(strat, {"n": 0, "r": 0.0, "wins": 0})
        ss["n"] += 1
        ss["r"] += t["r_multiple"] or 0.0
        if (t["r_multiple"] or 0) > 0:
            ss["wins"] += 1
        for m in (t.get("mistakes") or "").split(","):
            if m.strip():
                by_mistake[m.strip()] += 1
        hm = _hold_minutes(t)
        if hm is not None:
            holds.append(hm)
        if t.get("quality_total") is not None:
            quals.append(float(t["quality_total"]))
    mistakes_summary: list[str] = []
    losers = [t for t in chrono if (t["r_multiple"] or 0) <= 0]
    if losers and sum(1 for t in losers if "stop" in (t["exit_reason"] or "")) / len(losers) > 0.6:
        mistakes_summary.append("Most losses hit the stop — entries may be early or stops too tight.")
    for m, cnt in by_mistake.most_common(3):
        mistakes_summary.append(f"'{m}' tagged on {cnt} trade(s) — a recurring leak.")
    pred_acc = round(sum(1 for t in preds if t["prediction_correct"]) / len(preds), 4) if preds else None
    return {
        "n": n, "wins": len(wins), "losses": len(losses), "breakeven": len(be),
        "win_rate": round(len(wins) / n, 4),
        "expectancy_r": round(sum(rs) / n, 4),
        "avg_win_r": round(sum(wins) / len(wins), 4) if wins else None,
        "avg_loss_r": round(sum(losses) / len(losses), 4) if losses else None,
        "profit_factor": round(pf, 4) if pf is not None else None,
        "net_pnl": round(sum(t["pnl_dollars"] or 0.0 for t in chrono), 2),
        "max_drawdown_r": round(maxdd, 4),
        "avg_hold_min": round(sum(holds) / len(holds), 1) if holds else None,
        "streaks": _streaks(rs),
        "by_exit": by_exit,
        "by_emotion": {k: {"n": v["n"], "avg_r": round(v["r"] / v["n"], 3)} for k, v in by_emotion.items()},
        "by_strategy": {k: {"n": v["n"], "avg_r": round(v["r"] / v["n"], 3),
                            "win_rate": round(v["wins"] / v["n"], 3)} for k, v in by_strategy.items()},
        "by_mistake": dict(by_mistake),
        "mistakes": mistakes_summary,
        "avg_quality": round(sum(quals) / len(quals), 2) if quals else None,
        "prediction_accuracy": pred_acc,
    }


# confidence calibration bands; each band's stated confidence implies an expected
# win rate (band midpoint / 10) we compare against the actual outcome
_CALIB_BANDS: list[tuple[str, int, int]] = [("1-3", 1, 3), ("4-6", 4, 6), ("7-8", 7, 8), ("9-10", 9, 10)]


def _calib_verdict(expected: float, actual: float) -> str:
    diff = actual - expected
    if diff <= -0.12:
        return "overconfident"
    if diff <= -0.05:
        return "slightly overconfident"
    if diff >= 0.12:
        return "underconfident"
    if diff >= 0.05:
        return "slightly underconfident"
    return "well-calibrated"


def calibration(trades: list[dict[str, Any]]) -> dict[str, Any]:
    """Bucket graded trades (have a confidence + a definite win/loss) by stated
    confidence and compare to the actual win rate. Deterministic; surfaced only
    when there are >=10 graded trades, flagged provisional under ~30."""
    graded = [t for t in trades
              if t.get("confidence") is not None and (t.get("r_multiple") or 0) != 0]
    n = len(graded)
    buckets: list[dict[str, Any]] = []
    for label, lo, hi in _CALIB_BANDS:
        group = [t for t in graded if lo <= int(t["confidence"]) <= hi]
        gn = len(group)
        if gn == 0:
            buckets.append({"band": label, "n": 0, "won": 0, "win_rate": None,
                            "expected": round((lo + hi) / 20.0, 3), "verdict": None})
            continue
        won = sum(1 for t in group if (t["r_multiple"] or 0) > 0)
        win_rate = won / gn
        expected = sum(int(t["confidence"]) for t in group) / gn / 10.0
        buckets.append({
            "band": label, "n": gn, "won": won, "win_rate": round(win_rate, 4),
            "expected": round(expected, 3), "verdict": _calib_verdict(expected, win_rate),
        })
    return {"available": n >= 10, "provisional": n < 30, "n": n, "buckets": buckets}


def _iso_week(unix_str: str) -> str | None:
    try:
        dt = datetime.fromtimestamp(int(float(unix_str)), tz=UTC)
        y, w, _ = dt.isocalendar()
        return f"{y}-W{w:02d}"
    except (ValueError, TypeError):
        return None


def weekly_review(trades: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Per-ISO-week summary (most recent first) with progress vs the prior week."""
    weeks: dict[str, list[dict[str, Any]]] = {}
    for t in trades:
        wk = _iso_week(t.get("opened_at") or "") or _iso_week(t.get("created_at") or "")
        if wk:
            weeks.setdefault(wk, []).append(t)
    out: list[dict[str, Any]] = []
    ordered = sorted(weeks.keys())
    prev_exp: float | None = None
    for wk in ordered:
        st = _stats(weeks[wk])
        worked = max(st["by_strategy"].items(), key=lambda kv: kv[1]["avg_r"], default=(None, None))
        repeated = max(st["by_mistake"].items(), key=lambda kv: kv[1], default=(None, 0))
        delta = None if prev_exp is None else round((st["expectancy_r"] or 0) - prev_exp, 4)
        out.append({
            "week": wk, "n": st["n"], "win_rate": st["win_rate"], "expectancy_r": st["expectancy_r"],
            "best_strategy": worked[0], "repeated_mistake": repeated[0] if repeated[1] else None,
            "expectancy_delta_vs_prev": delta,
        })
        prev_exp = st["expectancy_r"] or 0
    return list(reversed(out))


# --- discipline correlations (deterministic, real logs; sample-gated) ---------
# Each bucket needs >=10 trades to be shown; the whole view is flagged provisional
# under ~30 — mirrors the calibration honesty rules. Nothing is invented: a bucket
# with too few trades is returned but marked not-shown ("insufficient data").
_CORR_MIN_N = 10
_SPEED_BANDS: list[tuple[str, int, int]] = [("<5s", 0, 5000), ("5-10s", 5000, 10000), (">10s", 10000, 1_000_000_000)]


def _corr_buckets(groups: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    """Win rate / expectancy per group, gated at _CORR_MIN_N trades per bucket."""
    total = sum(len(v) for v in groups.values())
    buckets: list[dict[str, Any]] = []
    for key, rows in groups.items():
        n = len(rows)
        rs = [t.get("r_multiple") or 0.0 for t in rows]
        won = sum(1 for r in rs if r > 0)
        buckets.append({
            "key": key, "n": n, "won": won,
            "win_rate": round(won / n, 4) if n else None,
            "expectancy_r": round(sum(rs) / n, 4) if n else None,
            "shown": n >= _CORR_MIN_N,
        })
    return {"available": any(b["shown"] for b in buckets), "provisional": total < 30,
            "n": total, "min_n": _CORR_MIN_N, "buckets": buckets}


def emotion_correlation(trades: list[dict[str, Any]]) -> dict[str, Any]:
    """Win rate / expectancy bucketed by the pre-session emotional state recorded
    on each trade (denormalized at trade time)."""
    groups: dict[str, list[dict[str, Any]]] = {}
    for t in trades:
        state = (t.get("pre_emotional_state") or "").strip()
        if state:
            groups.setdefault(state, []).append(t)
    return _corr_buckets(groups)


def decision_speed(trades: list[dict[str, Any]]) -> dict[str, Any]:
    """Win rate / expectancy bucketed by how long the pre-trade read took
    (decision_ms). Observed correlation, not advice."""
    groups: dict[str, list[dict[str, Any]]] = {label: [] for label, _, _ in _SPEED_BANDS}
    for t in trades:
        ms = t.get("decision_ms")
        if ms is None:
            continue
        for label, lo, hi in _SPEED_BANDS:
            if lo <= int(ms) < hi:
                groups[label].append(t)
                break
    return _corr_buckets(groups)


def fetch_all() -> dict[str, Any]:
    with _conn() as c:
        trades = [dict(r) for r in c.execute("SELECT * FROM paper_trades ORDER BY id DESC").fetchall()]
        notes = [dict(r) for r in c.execute("SELECT * FROM notes ORDER BY id DESC").fetchall()]
        sessions = [dict(r) for r in c.execute("SELECT * FROM sessions ORDER BY id DESC").fetchall()]
        missed = [dict(r) for r in c.execute("SELECT * FROM missed_setups ORDER BY id DESC").fetchall()]
        reviews_raw = [dict(r) for r in c.execute("SELECT * FROM session_reviews ORDER BY id DESC").fetchall()]
        cooldowns = [dict(r) for r in c.execute("SELECT * FROM cooldown_events ORDER BY id DESC").fetchall()]
    # decode JSON columns back into structures for the client
    for t in trades:
        t["won_lost_factors"] = json.loads(t.get("won_lost_factors") or "[]")
        t["snapshot"] = json.loads(t["snapshot"]) if t.get("snapshot") else None
    reviews: list[dict[str, Any]] = []
    for r in reviews_raw:
        r["calibration"] = json.loads(r.get("calibration") or "[]")
        r["focuses"] = json.loads(r.get("focuses") or "[]")
        reviews.append(r)
    return {"trades": trades, "notes": notes, "sessions": sessions,
            "missed_setups": missed, "session_reviews": reviews,
            "cooldown_events": cooldowns,
            "stats": _stats(trades), "weekly": weekly_review(trades),
            "calibration": calibration(trades),
            "emotion_correlation": emotion_correlation(trades),
            "decision_speed": decision_speed(trades)}
