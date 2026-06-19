"""Read access to the batch backtest results (the 'AI memory').

Everything here reads what `run_backtest` produced: the SQLite memory DB and
results.json under ./output. The live stream never writes here; these are the
real, gated numbers shown in the leaderboard / strategies / validation tabs.
"""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

from ..config.settings import get_settings
from ..engine.strategies import REGISTRY
from ..engine.types import INSTRUMENTS

_settings = get_settings()


def memory_ready() -> bool:
    path = _settings.memory_db_path
    if not Path(path).exists():
        return False
    try:
        with _connect() as conn:
            row = conn.execute("SELECT COUNT(*) FROM runs").fetchone()
        return bool(row and row[0] > 0)
    except sqlite3.Error:
        return False


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(str(_settings.memory_db_path), timeout=5)
    conn.row_factory = sqlite3.Row
    return conn


def _runs() -> list[dict[str, Any]]:
    if not Path(_settings.memory_db_path).exists():
        return []
    try:
        with _connect() as conn:
            conn.execute(
                "CREATE TABLE IF NOT EXISTS runs (id INTEGER PRIMARY KEY)")
            rows = conn.execute("SELECT * FROM runs ORDER BY expectancy_r DESC").fetchall()
        return [dict(r) for r in rows]
    except sqlite3.Error:
        return []


def leaderboard() -> list[dict[str, Any]]:
    """All runs, ranked by expectancy. n<100 -> insufficient_sample True."""
    out = []
    for r in _runs():
        n = r.get("n_trades") or 0
        out.append({
            "strategy": r["strategy"],
            "label": REGISTRY[r["strategy"]][1].label if r["strategy"] in REGISTRY else r["strategy"],
            "symbol": r["symbol"],
            "timeframe": r["timeframe"],
            "n_trades": n,
            "win_rate": r.get("win_rate"),
            "profit_factor": r.get("profit_factor"),
            "expectancy_r": r.get("expectancy_r"),
            "max_drawdown_pct": r.get("max_drawdown_pct"),
            "sharpe": r.get("sharpe"),
            "net_pnl_dollars": r.get("net_pnl_dollars"),
            "mc_p95_dd_pct": r.get("mc_p95_dd_pct"),
            "promote": bool(r.get("mc_promote")),
            "sufficient_sample": n >= 100,
        })
    return out


def _metrics_json(r: dict[str, Any]) -> dict[str, Any]:
    try:
        return json.loads(r.get("metrics_json") or "{}")
    except (json.JSONDecodeError, TypeError):
        return {}


def strategies() -> list[dict[str, Any]]:
    """The 8 strategies with their meta and aggregated real stats."""
    runs = _runs()
    by_strat: dict[str, list[dict]] = {}
    for r in runs:
        by_strat.setdefault(r["strategy"], []).append(r)
    out = []
    for name, (_fn, meta) in REGISTRY.items():
        rs = by_strat.get(name, [])
        total_n = sum((r.get("n_trades") or 0) for r in rs)
        best = max(rs, key=lambda r: (r.get("expectancy_r") or -9), default=None)
        out.append({
            "name": name,
            "label": meta.label,
            "family": meta.family,
            "best_regime": meta.best_regime,
            "recommended_timeframes": meta.recommended_timeframes,
            "description": meta.description,
            "indicators_used": meta.indicators_used,
            "total_trades": total_n,
            "best_run": {
                "symbol": best["symbol"], "timeframe": best["timeframe"],
                "expectancy_r": best.get("expectancy_r"), "win_rate": best.get("win_rate"),
                "profit_factor": best.get("profit_factor"), "n_trades": best.get("n_trades"),
                "promote": bool(best.get("mc_promote")),
            } if best else None,
            "runs": [{
                "symbol": r["symbol"], "timeframe": r["timeframe"],
                "n_trades": r.get("n_trades"), "win_rate": r.get("win_rate"),
                "expectancy_r": r.get("expectancy_r"), "profit_factor": r.get("profit_factor"),
                "max_drawdown_pct": r.get("max_drawdown_pct"), "sharpe": r.get("sharpe"),
                "mc_p95_dd_pct": r.get("mc_p95_dd_pct"), "promote": bool(r.get("mc_promote")),
                "sufficient_sample": (r.get("n_trades") or 0) >= 100,
            } for r in sorted(rs, key=lambda r: (r.get("expectancy_r") or -9), reverse=True)],
        })
    return out


def strategy_detail(name: str) -> dict[str, Any] | None:
    if name not in REGISTRY:
        return None
    detail = next((s for s in strategies() if s["name"] == name), None)
    if detail is None:
        return None
    # by-regime breakdown from the richest run's metrics_json
    by_regime: dict[str, dict] = {}
    best_run = None
    for r in _runs():
        if r["strategy"] != name:
            continue
        mj = _metrics_json(r)
        regs = mj.get("by_regime", {})
        if regs and (best_run is None or (r.get("n_trades") or 0) > (best_run.get("n_trades") or 0)):
            best_run = r
            by_regime = regs
    detail["by_regime"] = by_regime
    return detail


def regime_stats() -> dict[str, dict[str, dict[str, Any]]]:
    """{strategy: {regime: {win_rate, expectancy_r, n}}} aggregated across runs
    (trade-weighted)."""
    agg: dict[str, dict[str, dict[str, float]]] = {}
    for r in _runs():
        strat = r["strategy"]
        for reg, d in _metrics_json(r).get("by_regime", {}).items():
            n = d.get("n") or 0
            wr = d.get("win_rate")
            exp = d.get("expectancy_r")
            if not n or wr is None:
                continue
            slot = agg.setdefault(strat, {}).setdefault(
                reg, {"wins": 0.0, "exp": 0.0, "n": 0})
            slot["wins"] += wr * n
            slot["exp"] += (exp or 0.0) * n
            slot["n"] += n
    out: dict[str, dict[str, dict[str, Any]]] = {}
    for strat, regs in agg.items():
        for reg, s in regs.items():
            if s["n"] >= 1:
                out.setdefault(strat, {})[reg] = {
                    "win_rate": round(s["wins"] / s["n"], 4),
                    "expectancy_r": round(s["exp"] / s["n"], 4),
                    "n": int(s["n"])}
    return out


def gate_for(symbol: str, timeframe: str) -> dict[str, bool]:
    """{strategy: mc_promote} for runs on this symbol/timeframe — the gate a live
    setup must clear to be 'recommended'."""
    out: dict[str, bool] = {}
    for r in _runs():
        if r["symbol"] == symbol and r["timeframe"] == timeframe:
            out[r["strategy"]] = bool(r.get("mc_promote"))
    return out


def validation() -> dict[str, Any]:
    results_path = Path(_settings.results_path)
    payload: dict[str, Any] = {"available": False, "runs": []}
    if results_path.exists():
        try:
            data = json.loads(results_path.read_text())
            payload["available"] = True
            payload["days"] = data.get("days")
            payload["seed"] = data.get("seed")
            payload["timeframes"] = data.get("timeframes")
            runs = data.get("runs", [])
            payload["runs"] = [{
                "strategy": r["strategy"], "label": r.get("label", r["strategy"]),
                "symbol": r["symbol"], "timeframe": r["timeframe"],
                "metrics": {k: r["metrics"].get(k) for k in (
                    "n_trades", "win_rate", "expectancy_r", "profit_factor",
                    "max_drawdown_pct", "sharpe", "sufficient_sample")},
                "monte_carlo": r.get("monte_carlo", {}),
                "by_regime": r["metrics"].get("by_regime", {}),
            } for r in runs]
            payload["total_runs"] = len(runs)
            payload["promoted"] = sum(1 for r in runs if r.get("monte_carlo", {}).get("promote"))
            payload["sufficient"] = sum(1 for r in runs if r["metrics"].get("sufficient_sample"))
        except (json.JSONDecodeError, KeyError, TypeError):
            payload["available"] = False
    return payload


def instruments() -> list[dict[str, Any]]:
    return [{
        "symbol": i.symbol, "name": i.name, "point_value": i.point_value,
        "tick_size": i.tick_size, "commission_per_side": i.commission_per_side,
        "start_price": i.start_price,
    } for i in INSTRUMENTS.values()]


def education_text() -> str:
    path = Path(_settings.education_path)
    return path.read_text(encoding="utf-8") if path.exists() else ""
