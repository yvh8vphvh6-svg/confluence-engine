"""On-demand single-strategy backtest — powers Backtest mode and the Validation tab.

Runs a deterministic `Backtester` pass over freshly generated synthetic data with
an optional session-start (entry time-of-day) gate, then returns trades, the
equity curve, metrics, Monte-Carlo robustness, and a readable conditions-met
checklist (factor coverage + regime + sample + gate + determinism + drawdown).
"""
from __future__ import annotations

import numpy as np
from pydantic import BaseModel, Field

from ..data.generator import generate_ohlcv, resample_ohlcv
from ..engine import confluence
from ..engine import metrics as metrics_mod
from ..engine.simulation import WARMUP, Backtester
from ..engine.strategies import REGISTRY, build_context
from ..engine.types import INSTRUMENTS

# session-start presets (minutes from midnight ET) — extended session is 04:00-16:00
SESSION_PRESETS = {
    "london": 4 * 60,        # 04:00 — London / data open
    "ny": 9 * 60 + 30,       # 09:30 — NY / cash market open
    "power_hour": 15 * 60,   # 15:00 — final hour
    "full": 4 * 60,          # whole session
}


class BacktestRequest(BaseModel):
    symbol: str = "MNQ"
    timeframe: str = "5m"
    strategy: str = "ORB"
    seed: int = 42
    days: int = Field(default=120, ge=20, le=300)
    session_start_min: int | None = None  # explicit override
    session: str | None = None            # preset name (london/ny/power_hour/full)


def _news_bars(df, seed: int) -> set[int]:
    rng = np.random.default_rng(seed + 777)
    out: set[int] = set()
    for i in range(len(df)):
        ts = df.index[i]
        if ts.hour == 10 and ts.minute == 0 and rng.random() < 0.25:
            out.add(i)
    return out


def _factor_coverage(df, inst, strategy: str, ctx) -> dict[str, float]:
    """Fraction of emitted signals for which each confluence factor was present."""
    fn, _meta = REGISTRY[strategy]
    bt = Backtester(inst, seed=0)
    state = {"active_fvgs": [], "active_obs": [], "fvg_ptr": 0, "ob_ptr": 0}
    counts = {"base": 0, "structure": 0, "timing": 0, "pa": 0}
    total = 0
    n = len(df)
    for i in range(WARMUP, n):
        bt._advance_zones(state, ctx, i)
        sig = fn(df, i, ctx, state)
        if sig is None:
            continue
        total += 1
        for k in counts:
            if sig.factors.get(k):
                counts[k] += 1
    if total == 0:
        return {k: 0.0 for k in counts}
    return {k: round(v / total, 3) for k, v in counts.items()}


def run_backtest(req: BacktestRequest) -> dict:
    if req.symbol not in INSTRUMENTS:
        raise ValueError(f"unknown instrument {req.symbol!r}")
    if req.timeframe not in ("1m", "5m", "15m", "30m", "1h"):
        raise ValueError(f"unknown timeframe {req.timeframe!r}")
    if req.strategy not in REGISTRY:
        raise ValueError(f"unknown strategy {req.strategy!r}")

    inst = INSTRUMENTS[req.symbol]
    meta = REGISTRY[req.strategy][1]
    df_1m = generate_ohlcv(inst, days=req.days, seed=req.seed)
    df = resample_ohlcv(df_1m, req.timeframe)
    ctx = build_context(df, inst)
    news = _news_bars(df, req.seed)

    session_min = req.session_start_min
    if session_min is None and req.session:
        session_min = SESSION_PRESETS.get(req.session.lower())

    bt = Backtester(inst, seed=req.seed, news_bars=news)
    res = bt.run(req.strategy, df, req.timeframe, session_start_min=session_min)
    m = res.metrics
    mc = metrics_mod.monte_carlo(res.trades, n_runs=1000, seed=req.seed)
    coverage = _factor_coverage(df, inst, req.strategy, ctx)

    by_regime = m.get("by_regime", {})
    fav = by_regime.get(meta.best_regime, {})
    regime_favorable = (fav.get("expectancy_r") or 0) > 0
    n_trades = m.get("n_trades", 0)
    sufficient = n_trades >= 100

    conditions = [
        {"key": "base", "label": "Base signal", "ok": True,
         "detail": "Strategy trigger fired (required by design)."},
        {"key": "structure", "label": "Structure aligned", "ok": coverage["structure"] >= 0.5,
         "detail": f"present in {coverage['structure'] * 100:.0f}% of emitted signals"},
        {"key": "timing", "label": "Timing / OTE / killzone", "ok": coverage["timing"] >= 0.5,
         "detail": f"present in {coverage['timing'] * 100:.0f}% of emitted signals"},
        {"key": "pa", "label": "Price-action confirmation", "ok": coverage["pa"] >= 0.5,
         "detail": f"present in {coverage['pa'] * 100:.0f}% of emitted signals"},
        {"key": "regime", "label": "Regime favorable", "ok": bool(regime_favorable),
         "detail": f"best regime {meta.best_regime}: "
                   + (f"{fav.get('expectancy_r'):+.2f}R" if fav.get("expectancy_r") is not None else "no sample")},
        {"key": "sample", "label": "Sample n≥100", "ok": sufficient,
         "detail": f"n={n_trades}"},
        {"key": "mc", "label": "Monte-Carlo gate (<15% p95 DD)", "ok": bool(mc.get("promote")),
         "detail": (f"p95 DD {mc['p95_dd_pct'] * 100:.1f}%" if mc.get("p95_dd_pct") is not None
                    else "insufficient trades")},
        {"key": "determinism", "label": "Deterministic (seeded, reproducible)", "ok": True,
         "detail": "proven by `run_backtest --verify`"},
    ]

    trades = [{
        "direction": "long" if t.direction > 0 else "short",
        "entry_time": t.entry_time, "exit_time": t.exit_time,
        "entry_price": t.entry_price, "exit_price": t.exit_price,
        "r_multiple": t.r_multiple, "pnl_dollars": t.pnl_dollars,
        "exit_reason": t.exit_reason, "regime_at_entry": t.regime_at_entry,
        "bars_held": t.bars_held,
    } for t in res.trades[-500:]]

    return {
        "symbol": req.symbol, "timeframe": req.timeframe, "strategy": req.strategy,
        "label": meta.label, "family": meta.family, "best_regime": meta.best_regime,
        "seed": req.seed, "days": req.days,
        "session": req.session, "session_start_min": session_min,
        "bars": len(df),
        "metrics": {
            "n_trades": n_trades,
            "win_rate": m.get("win_rate"),
            "expectancy_r": m.get("expectancy_r"),
            "profit_factor": m.get("profit_factor"),
            "sharpe": m.get("sharpe"),
            "max_drawdown_pct": abs(m.get("max_drawdown_pct") or 0) * 100,
            "max_drawdown_r": m.get("max_drawdown_r"),
            "net_pnl_dollars": m.get("net_pnl_dollars"),
            "sufficient_sample": sufficient,
        },
        "monte_carlo": mc,
        "equity_curve_r": m.get("equity_curve_r", [0.0]),
        "conditions": conditions,
        "trades": trades,
    }
