"""Trading journal — the user's own practice record (SQLite at output/journal.db).

Stores paper trades (with mistake tags), free-text notes, and session reviews,
and computes performance stats + a weekly review. Paper trades only — no real
execution. Honesty: stats are computed from the user's own logged trades; with
no trades the stats are empty, never invented.
"""
from __future__ import annotations

import sqlite3
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
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
"""

# canonical mistake tags surfaced in the UI
MISTAKE_TAGS = ["FOMO", "moved stop", "oversized", "traded news", "revenge",
                "off-plan", "early entry", "late entry"]


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


class NoteIn(BaseModel):
    text: str
    emotion: str = ""
    trade_id: int | None = None


class SessionIn(BaseModel):
    mood: str = ""
    confidence: int = 3
    goals: str = ""
    notes: str = ""


def _conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), timeout=5)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    # tolerate pre-existing DBs created before the `mistakes` column existed
    cols = {r[1] for r in conn.execute("PRAGMA table_info(paper_trades)").fetchall()}
    if "mistakes" not in cols:
        conn.execute("ALTER TABLE paper_trades ADD COLUMN mistakes TEXT")
    return conn


def add_trade(t: PaperTradeIn) -> int:
    with _conn() as c:
        cur = c.execute(
            """INSERT INTO paper_trades
               (created_at, symbol, timeframe, strategy, direction, regime,
                entry_price, exit_price, stop, target, contracts, r_multiple,
                pnl_dollars, exit_reason, opened_at, closed_at, note, emotion, mistakes)
               VALUES (datetime('now'),?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (t.symbol, t.timeframe, t.strategy, t.direction, t.regime,
             t.entry_price, t.exit_price, t.stop, t.target, t.contracts, t.r_multiple,
             t.pnl_dollars, t.exit_reason, t.opened_at, t.closed_at, t.note, t.emotion,
             ",".join(t.mistakes)))
        c.commit()
        return int(cur.lastrowid)


def add_note(n: NoteIn) -> int:
    with _conn() as c:
        cur = c.execute(
            "INSERT INTO notes (created_at, text, emotion, trade_id) VALUES (datetime('now'),?,?,?)",
            (n.text, n.emotion, n.trade_id))
        c.commit()
        return int(cur.lastrowid)


def add_session(s: SessionIn) -> int:
    with _conn() as c:
        cur = c.execute(
            "INSERT INTO sessions (created_at, mood, confidence, goals, notes) VALUES (datetime('now'),?,?,?,?)",
            (s.mood, s.confidence, s.goals, s.notes))
        c.commit()
        return int(cur.lastrowid)


def clear() -> None:
    with _conn() as c:
        c.execute("DELETE FROM paper_trades")
        c.execute("DELETE FROM notes")
        c.execute("DELETE FROM sessions")
        c.commit()


def _streaks(rs: list[float]) -> dict[str, int]:
    """Current and best win/loss streaks over the (chronological) R sequence."""
    best_win = best_loss = cur = 0
    cur_sign = 0
    for r in rs:
        s = 1 if r > 0 else (-1 if r < 0 else 0)
        if s == 0:
            cur = 0; cur_sign = 0; continue
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
                "by_exit": {}, "by_emotion": {}, "by_strategy": {}, "by_mistake": {}, "mistakes": []}
    # chronological order (oldest first) for streaks / equity / drawdown
    chrono = sorted(trades, key=lambda t: t["id"])
    rs = [t["r_multiple"] or 0.0 for t in chrono]
    wins = [r for r in rs if r > 0]
    losses = [r for r in rs if r < 0]
    be = [r for r in rs if r == 0]
    gp = sum(t["pnl_dollars"] or 0 for t in chrono if (t["pnl_dollars"] or 0) > 0)
    gl = sum(t["pnl_dollars"] or 0 for t in chrono if (t["pnl_dollars"] or 0) < 0)
    pf = (gp / abs(gl)) if gl < 0 else (None if gp == 0 else None)
    # max drawdown on cumulative R
    cum = 0.0; peak = 0.0; maxdd = 0.0
    for r in rs:
        cum += r; peak = max(peak, cum); maxdd = min(maxdd, cum - peak)
    by_exit: dict[str, int] = {}
    by_emotion: dict[str, dict[str, float]] = {}
    by_strategy: dict[str, dict[str, float]] = {}
    by_mistake: Counter = Counter()
    holds: list[float] = []
    for t in chrono:
        by_exit[t["exit_reason"] or "?"] = by_exit.get(t["exit_reason"] or "?", 0) + 1
        emo = t["emotion"] or "untagged"
        es = by_emotion.setdefault(emo, {"n": 0, "r": 0.0}); es["n"] += 1; es["r"] += t["r_multiple"] or 0.0
        strat = t["strategy"] or "?"
        ss = by_strategy.setdefault(strat, {"n": 0, "r": 0.0, "wins": 0})
        ss["n"] += 1; ss["r"] += t["r_multiple"] or 0.0
        if (t["r_multiple"] or 0) > 0:
            ss["wins"] += 1
        for m in (t.get("mistakes") or "").split(","):
            if m.strip():
                by_mistake[m.strip()] += 1
        hm = _hold_minutes(t)
        if hm is not None:
            holds.append(hm)
    mistakes_summary: list[str] = []
    losers = [t for t in chrono if (t["r_multiple"] or 0) <= 0]
    if losers and sum(1 for t in losers if "stop" in (t["exit_reason"] or "")) / len(losers) > 0.6:
        mistakes_summary.append("Most losses hit the stop — entries may be early or stops too tight.")
    for m, cnt in by_mistake.most_common(3):
        mistakes_summary.append(f"'{m}' tagged on {cnt} trade(s) — a recurring leak.")
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
    }


def _iso_week(unix_str: str) -> str | None:
    try:
        dt = datetime.fromtimestamp(int(float(unix_str)), tz=timezone.utc)
        y, w, _ = dt.isocalendar()
        return f"{y}-W{w:02d}"
    except (ValueError, TypeError):
        return None


def weekly_review(trades: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Per-ISO-week summary (most recent first) with progress vs the prior week."""
    weeks: dict[str, list[dict]] = {}
    for t in trades:
        wk = _iso_week(t.get("opened_at") or "") or _iso_week(t.get("created_at") or "")
        if wk:
            weeks.setdefault(wk, []).append(t)
    out = []
    ordered = sorted(weeks.keys())
    prev_exp = None
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


def fetch_all() -> dict[str, Any]:
    with _conn() as c:
        trades = [dict(r) for r in c.execute("SELECT * FROM paper_trades ORDER BY id DESC").fetchall()]
        notes = [dict(r) for r in c.execute("SELECT * FROM notes ORDER BY id DESC").fetchall()]
        sessions = [dict(r) for r in c.execute("SELECT * FROM sessions ORDER BY id DESC").fetchall()]
    return {"trades": trades, "notes": notes, "sessions": sessions,
            "stats": _stats(trades), "weekly": weekly_review(trades)}
