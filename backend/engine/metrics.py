"""Performance metrics and Monte Carlo robustness analysis.

Drawdown is reported two ways:
  * max_drawdown_r  - peak-to-trough of the cumulative R curve (units of R)
  * max_drawdown_pct - under fixed-fractional sizing (risk `f` of equity per
    trade), the standard way to make the '< 15%' promotion gate meaningful.
"""
from __future__ import annotations

import math

import numpy as np

from .types import Trade

RISK_FRACTION = 0.01  # 1% of equity risked per trade for %-based drawdown


def _equity_curve_r(rs: list[float]) -> np.ndarray:
    return np.cumsum([0.0] + rs)


def _max_dd_r(rs: list[float]) -> float:
    eq = _equity_curve_r(rs)
    peak = np.maximum.accumulate(eq)
    dd = eq - peak
    return float(dd.min()) if len(dd) else 0.0


def _max_dd_pct(rs: list[float], f: float = RISK_FRACTION) -> float:
    eq = 1.0
    peak = 1.0
    max_dd = 0.0
    for r in rs:
        eq *= (1.0 + f * r)
        peak = max(peak, eq)
        max_dd = min(max_dd, eq / peak - 1.0)
    return float(max_dd)


def compute_metrics(trades: list[Trade]) -> dict:
    n = len(trades)
    if n == 0:
        return {"n_trades": 0, "win_rate": None, "profit_factor": None,
                "expectancy_r": None, "max_drawdown_r": 0.0, "max_drawdown_pct": 0.0,
                "avg_win_r": None, "avg_loss_r": None, "sharpe": None,
                "net_pnl_dollars": 0.0, "gross_profit": 0.0, "gross_loss": 0.0,
                "equity_curve_r": [0.0], "by_regime": {}, "sufficient_sample": False}

    rs = [t.r_multiple for t in trades]
    pnl = [t.pnl_dollars for t in trades]
    wins = [r for r in rs if r > 0]
    losses = [r for r in rs if r <= 0]
    gross_profit = sum(p for p in pnl if p > 0)
    gross_loss = sum(p for p in pnl if p < 0)
    pf = (gross_profit / abs(gross_loss)) if gross_loss < 0 else (math.inf if gross_profit > 0 else 0.0)
    mean_r = float(np.mean(rs))
    std_r = float(np.std(rs, ddof=1)) if n > 1 else 0.0
    sharpe = (mean_r / std_r * math.sqrt(n)) if std_r > 0 else 0.0

    by_regime: dict[str, dict] = {}
    for reg in sorted({t.regime_at_entry for t in trades}):
        sub = [t.r_multiple for t in trades if t.regime_at_entry == reg]
        w = [r for r in sub if r > 0]
        by_regime[reg] = {
            "n": len(sub),
            "win_rate": round(len(w) / len(sub), 4) if sub else None,
            "expectancy_r": round(float(np.mean(sub)), 4) if sub else None,
            "sufficient_sample": len(sub) >= 100,
        }

    return {
        "n_trades": n,
        "win_rate": round(len(wins) / n, 4),
        "profit_factor": round(pf, 4) if pf != math.inf else None,
        "expectancy_r": round(mean_r, 4),
        "avg_win_r": round(float(np.mean(wins)), 4) if wins else 0.0,
        "avg_loss_r": round(float(np.mean(losses)), 4) if losses else 0.0,
        "max_drawdown_r": round(_max_dd_r(rs), 4),
        "max_drawdown_pct": round(_max_dd_pct(rs), 4),
        "sharpe": round(sharpe, 4),
        "net_pnl_dollars": round(sum(pnl), 2),
        "gross_profit": round(gross_profit, 2),
        "gross_loss": round(gross_loss, 2),
        "equity_curve_r": [round(x, 4) for x in _equity_curve_r(rs).tolist()],
        "by_regime": by_regime,
        "sufficient_sample": n >= 100,
    }


def monte_carlo(trades: list[Trade], n_runs: int = 1000, seed: int = 7) -> dict:
    """Shuffle the realised R sequence n_runs times; report the distribution of
    max drawdown under fixed-fractional sizing and the share of runs that stay
    inside the 15% promotion limit."""
    rs = [t.r_multiple for t in trades]
    if len(rs) < 2:
        return {"runs": 0, "p5_dd_pct": None, "median_dd_pct": None,
                "p95_dd_pct": None, "worst_dd_pct": None, "pct_runs_under_15pct": None,
                "promote": False}
    rng = np.random.default_rng(seed)
    arr = np.array(rs, dtype=float)
    dds = np.empty(n_runs)
    for k in range(n_runs):
        rng.shuffle(arr)
        dds[k] = _max_dd_pct(arr.tolist())
    dds_abs = -dds  # positive magnitudes
    pct_under = float(np.mean(dds_abs < 0.15))
    return {
        "runs": n_runs,
        "p5_dd_pct": round(float(np.percentile(dds_abs, 5)), 4),
        "median_dd_pct": round(float(np.percentile(dds_abs, 50)), 4),
        "p95_dd_pct": round(float(np.percentile(dds_abs, 95)), 4),
        "worst_dd_pct": round(float(dds_abs.max()), 4),
        "pct_runs_under_15pct": round(pct_under, 4),
        "promote": bool(np.percentile(dds_abs, 95) < 0.15 and len(rs) >= 100),
    }
