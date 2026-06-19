"""User-defined custom strategies (saved plans).

A custom strategy is a declarative PLAN — conditions, entry trigger, stop logic,
target R:R, sizing — not engine-executable code. You save it, trade it manually
in Practice (tagging the trade with its name), and its performance shows up in the
per-strategy breakdown alongside the built-ins. Honest framing: this tracks how
*you* trade the plan, it does not auto-backtest arbitrary rules.
"""
from __future__ import annotations

import sqlite3

from pydantic import BaseModel

from ..journal import DB_PATH


class CustomStrategy(BaseModel):
    name: str
    family: str = "custom"
    description: str = ""
    conditions: list[str] = []
    entry_trigger: str = ""
    stop_logic: str = ""
    target_rr: float = 2.0
    sizing: str = "1% risk"
    timeframes: list[str] = []
    notes: str = ""


def _conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), timeout=5)
    conn.row_factory = sqlite3.Row
    conn.executescript(
        """CREATE TABLE IF NOT EXISTS custom_strategies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL, name TEXT UNIQUE, family TEXT, description TEXT,
            conditions TEXT, entry_trigger TEXT, stop_logic TEXT, target_rr REAL,
            sizing TEXT, timeframes TEXT, notes TEXT
        )""")
    return conn


def save(s: CustomStrategy) -> int:
    with _conn() as c:
        cur = c.execute(
            """INSERT INTO custom_strategies
               (created_at, name, family, description, conditions, entry_trigger,
                stop_logic, target_rr, sizing, timeframes, notes)
               VALUES (datetime('now'),?,?,?,?,?,?,?,?,?,?)
               ON CONFLICT(name) DO UPDATE SET
                 family=excluded.family, description=excluded.description,
                 conditions=excluded.conditions, entry_trigger=excluded.entry_trigger,
                 stop_logic=excluded.stop_logic, target_rr=excluded.target_rr,
                 sizing=excluded.sizing, timeframes=excluded.timeframes, notes=excluded.notes""",
            (s.name, s.family, s.description, "\n".join(s.conditions), s.entry_trigger,
             s.stop_logic, s.target_rr, s.sizing, ",".join(s.timeframes), s.notes))
        c.commit()
        return int(cur.lastrowid)


def listing() -> list[dict]:
    with _conn() as c:
        rows = c.execute("SELECT * FROM custom_strategies ORDER BY id DESC").fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["conditions"] = [x for x in (d.get("conditions") or "").split("\n") if x]
        d["timeframes"] = [x for x in (d.get("timeframes") or "").split(",") if x]
        out.append(d)
    return out


def delete(name: str) -> None:
    with _conn() as c:
        c.execute("DELETE FROM custom_strategies WHERE name=?", (name,))
        c.commit()
