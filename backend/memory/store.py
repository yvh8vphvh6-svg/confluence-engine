"""Persistent 'AI memory' for backtest runs (SQLite).

Stores one row per (strategy, symbol, timeframe, seed) run plus its trades so
results can be compared across sessions and strategies.
"""
from __future__ import annotations

import json
import sqlite3
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from ..engine.simulation import BacktestResult

DEFAULT_DB = "trading_memory.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    strategy TEXT NOT NULL,
    symbol TEXT NOT NULL,
    timeframe TEXT NOT NULL,
    seed INTEGER NOT NULL,
    n_trades INTEGER,
    win_rate REAL,
    profit_factor REAL,
    expectancy_r REAL,
    max_drawdown_r REAL,
    max_drawdown_pct REAL,
    sharpe REAL,
    net_pnl_dollars REAL,
    sufficient_sample INTEGER,
    mc_p95_dd_pct REAL,
    mc_promote INTEGER,
    metrics_json TEXT,
    UNIQUE(strategy, symbol, timeframe, seed)
);
CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL,
    strategy TEXT, symbol TEXT, timeframe TEXT, direction INTEGER,
    entry_time TEXT, exit_time TEXT, entry_price REAL, exit_price REAL,
    risk_per_unit REAL, pnl_dollars REAL, r_multiple REAL,
    regime_at_entry TEXT, confidence REAL, exit_reason TEXT, bars_held INTEGER,
    FOREIGN KEY(run_id) REFERENCES runs(id) ON DELETE CASCADE
);
"""


class MemoryStore:
    def __init__(self, path: str = DEFAULT_DB):
        self.conn = sqlite3.connect(path)
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(SCHEMA)
        self.conn.commit()

    def save_run(self, result: BacktestResult, monte_carlo: dict[str, Any] | None = None) -> int:
        m = result.metrics
        mc = monte_carlo or {}
        cur = self.conn.execute(
            """INSERT OR REPLACE INTO runs
               (created_at, strategy, symbol, timeframe, seed, n_trades, win_rate,
                profit_factor, expectancy_r, max_drawdown_r, max_drawdown_pct, sharpe,
                net_pnl_dollars, sufficient_sample, mc_p95_dd_pct, mc_promote, metrics_json)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (datetime.now(UTC).isoformat(), result.strategy, result.symbol,
             result.timeframe, result.seed, m.get("n_trades"), m.get("win_rate"),
             m.get("profit_factor"), m.get("expectancy_r"), m.get("max_drawdown_r"),
             m.get("max_drawdown_pct"), m.get("sharpe"), m.get("net_pnl_dollars"),
             int(bool(m.get("sufficient_sample"))), mc.get("p95_dd_pct"),
             int(bool(mc.get("promote"))), json.dumps(m)))
        run_id = int(cur.lastrowid or 0)
        self.conn.execute("DELETE FROM trades WHERE run_id=?", (run_id,))
        self.conn.executemany(
            """INSERT INTO trades
               (run_id, strategy, symbol, timeframe, direction, entry_time, exit_time,
                entry_price, exit_price, risk_per_unit, pnl_dollars, r_multiple,
                regime_at_entry, confidence, exit_reason, bars_held)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            [(run_id, t.strategy, t.symbol, t.timeframe, t.direction, t.entry_time,
              t.exit_time, t.entry_price, t.exit_price, t.risk_per_unit, t.pnl_dollars,
              t.r_multiple, t.regime_at_entry, t.confidence, t.exit_reason, t.bars_held)
             for t in result.trades])
        self.conn.commit()
        return run_id

    def leaderboard(self, symbol: str | None = None, timeframe: str | None = None) -> list[dict[str, Any]]:
        q = "SELECT * FROM runs"
        clauses, params = [], []
        if symbol:
            clauses.append("symbol=?")
            params.append(symbol)
        if timeframe:
            clauses.append("timeframe=?")
            params.append(timeframe)
        if clauses:
            q += " WHERE " + " AND ".join(clauses)
        q += " ORDER BY expectancy_r DESC NULLS LAST"
        return [dict(r) for r in self.conn.execute(q, params).fetchall()]

    def close(self) -> None:
        self.conn.close()
