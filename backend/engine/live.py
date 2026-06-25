"""Live / replay simulation engine.

The batch `Backtester` is a one-shot state machine; the dashboard needs a
per-bar, controllable stream. `LiveSimulation` precomputes the entire timeline
in a single deterministic forward pass — reusing the *exact* building blocks the
Backtester uses (`build_context`, the 8 strategies in `REGISTRY`,
`confluence.evaluate`, `ExecutionModel`, and `Backtester`'s own zone-advance and
position-management helpers) — and records one lightweight per-bar snapshot. The
typed `SimulationTick` is materialised lazily in `tick_at` (one per streamed bar)
so building the whole timeline stays cheap.

It trades a *portfolio* of the user-selected strategies (one position at a time,
first armed strategy in registry order that clears confluence + fills). It is not
bit-identical to a single-strategy batch run — by design: the determinism gate
governs `Backtester`, and all leaderboard/validation numbers come from the batch
engine via SQLite, never from this live stream. See DECISIONS.md.
"""
from __future__ import annotations

import logging
import math
from typing import Any, cast

import numpy as np
import pandas as pd

from ..config.settings import Settings, get_settings
from ..schemas import SimulationTick
from . import confluence
from .execution import ExecutionModel
from .simulation import COOLDOWN_BARS, WARMUP, Backtester, Position
from .strategies import REGISTRY, all_strategies, build_context
from .types import INSTRUMENTS

log = logging.getLogger("live")

LIVE_DAYS = 30                 # synthetic days per live stream (snappy rebuilds)
MAX_RECENT_TRADES = 25
MAX_ZONE_OVERLAYS = 3          # declutter: only the most-recent few zones per kind
ZONE_TTL_BARS = 60
VALID_TIMEFRAMES = ("1m", "5m", "15m", "30m", "1h")


def _news_bars(df: pd.DataFrame, seed: int) -> set[int]:
    """Deterministic ~10:00 ET high-impact bars (matches run_backtest)."""
    rng = np.random.default_rng(seed + 777)
    out: set[int] = set()
    for i in range(len(df)):
        ts = df.index[i]
        if ts.hour == 10 and ts.minute == 0 and rng.random() < 0.25:
            out.add(i)
    return out


def _f(v: Any, default: float = 0.0) -> float:
    return float(v) if v is not None and not (isinstance(v, float) and math.isnan(v)) else default


def _dirstr(direction: int) -> str:
    return "long" if direction > 0 else "short"


def _in_killzone(ts: pd.Timestamp) -> bool:
    minutes = ts.hour * 60 + ts.minute
    return bool((9 * 60 + 30 <= minutes <= 11 * 60) or (14 * 60 <= minutes <= 15 * 60 + 30))


class LiveSimulation:
    def __init__(
        self,
        symbol: str = "MNQ",
        timeframe: str = "5m",
        seed: int = 42,
        strategies: list[str] | None = None,
        regime_filter: str | None = None,
        regime_stats: dict[str, Any] | None = None,
        gate: dict[str, Any] | None = None,
        settings: Settings | None = None,
    ) -> None:
        self.settings = settings or get_settings()
        if symbol not in INSTRUMENTS:
            raise ValueError(f"unknown instrument {symbol!r}")
        if timeframe not in VALID_TIMEFRAMES:
            raise ValueError(f"unknown timeframe {timeframe!r}")
        self.symbol = symbol
        self.timeframe = timeframe
        self.seed = int(seed)
        armed = [s for s in (strategies or all_strategies()) if s in REGISTRY]
        self.armed = armed or all_strategies()
        self.regime_filter = regime_filter if regime_filter in (
            "trending", "ranging", "high_vol", "low_vol") else None
        self.regime_stats = regime_stats or {}
        self.gate = gate or {}
        # whether this (symbol, timeframe) was covered by the batch validation sweep
        self.tf_validated = len(self.gate) > 0

        from ..data.feed import resolve_feed

        inst = INSTRUMENTS[symbol]
        self.inst = inst
        self.feed = resolve_feed()
        self.data_source = self.feed.source
        self.df = self.feed.ohlcv(inst, days=LIVE_DAYS, seed=self.seed, timeframe=timeframe)
        self.ctx = build_context(self.df, inst)
        self.news = _news_bars(self.df, self.seed)
        self.snaps: list[dict[str, Any]] = self._build()
        self.first_index = WARMUP
        self.bars_total = len(self.df)

    # ------------------------------------------------------------------ build
    def _build(self) -> list[dict[str, Any]]:
        df, ctx, inst = self.df, self.ctx, self.inst
        bt = Backtester(inst, seed=self.seed, news_bars=self.news)
        execu = ExecutionModel(inst, self.seed, self.news)
        cooldown_bars = COOLDOWN_BARS.get(self.timeframe, 3)
        point = inst.point_value
        starting = self.settings.starting_balance

        states: dict[str, dict[str, Any]] = {
            s: {"active_fvgs": [], "active_obs": [], "fvg_ptr": 0, "ob_ptr": 0}
            for s in self.armed
        }

        pos: Position | None = None
        pos_strategy: str | None = None
        balance = starting
        consec_losses = 0
        cooldown_until = -1
        cur_day = None
        day_r = 0.0
        day_pnl = 0.0
        day_locked = False
        trades_today = 0
        recent_bos: list[dict[str, Any]] = []
        recent_trade_dicts: list[dict[str, Any]] = []

        # incremental performance aggregates
        n_tr = 0
        wins = 0
        sum_r = 0.0
        sum_r2 = 0.0
        gross_profit = 0.0
        gross_loss = 0.0
        cum_r = 0.0
        peak_r = 0.0
        maxdd_r = 0.0
        eq_pct = 1.0
        peak_pct = 1.0
        maxdd_pct = 0.0
        equity_curve_r: list[float] = [0.0]

        # sliding overlay zone windows (pointers into ctx.fvgs / ctx.obs)
        fvg_ptr = 0
        ob_ptr = 0
        active_fvg: list[dict[str, Any]] = []
        active_ob: list[dict[str, Any]] = []

        snaps: list[dict[str, Any]] = []
        n = len(df)
        opens = df["open"].to_numpy()
        highs = df["high"].to_numpy()
        lows = df["low"].to_numpy()
        closes = df["close"].to_numpy()
        vols = df["volume"].to_numpy()
        index = df.index
        ctx_fvgs, ctx_obs = ctx.fvgs, ctx.obs

        for i in range(WARMUP, n):
            ts = index[i]
            day = ts.normalize()
            if day != cur_day:
                cur_day, day_r, day_pnl, day_locked, trades_today = day, 0.0, 0.0, False, 0

            atr_expanded = bool(
                not np.isnan(ctx.atr[i]) and not np.isnan(ctx.atr_avg[i])
                and ctx.atr[i] > 1.5 * ctx.atr_avg[i]
            )
            regime = ctx.regimes[i]
            regime_blocked = self.regime_filter is not None and regime != self.regime_filter

            # ---- evaluate every armed strategy --------------------------------
            signal_views: list[dict[str, Any]] = []
            entry_candidates: list[tuple[Any, ...]] = []
            for s in self.armed:
                fn, meta = REGISTRY[s]
                st = states[s]
                bt._advance_zones(st, ctx, i)
                sig = fn(df, i, ctx, st)
                conf_view = None
                view_dir = "flat"
                active = sig is not None
                if sig is not None:
                    cr = confluence.evaluate(sig.factors, atr_expanded)
                    conf_view = {
                        "execute": cr.execute, "confidence": cr.confidence, "threshold": cr.threshold,
                        "missing_factors": cr.missing_factors, "score_breakdown": cr.score_breakdown,
                    }
                    view_dir = _dirstr(sig.direction)
                    if cr.execute and not regime_blocked:
                        entry_candidates.append((s, sig, conf_view))
                rs = self.regime_stats.get(s, {}).get(regime)
                reg_n = (rs["n"] if rs else 0)
                reg_wr = (rs["win_rate"] if rs else None)
                reg_exp = (rs.get("expectancy_r") if rs else None)
                conf_val = float(cast(float, conf_view["confidence"])) if conf_view else 0.0
                sample_factor = min(1.0, float(reg_n) / 100.0)
                score = round(float(conf_val) * max(float(reg_exp or 0.0), 0.0) * sample_factor, 5) if active else 0.0
                promoted = bool(self.gate.get(s, False))
                executes = bool(conf_view and conf_view["execute"])
                # "qualified" = a genuinely worth-teaching setup: confluence executes
                # AND positive in-regime backtested edge (looser than full MC promote
                # so teaching moments actually occur; honesty preserved via evidence).
                qualified = bool(active and executes and (reg_exp or 0.0) > 0 and not regime_blocked)
                recommended = bool(active and reg_n >= 100 and (reg_exp or 0.0) > 0 and promoted)
                if not active:
                    evidence = "no setup this bar"
                elif reg_n < 100:
                    evidence = f"insufficient sample (n={reg_n}) in this regime"
                elif (reg_exp or 0.0) <= 0:
                    evidence = f"negative backtested edge in this regime ({reg_exp:+.2f}R)"
                elif not self.tf_validated:
                    evidence = f"{self.timeframe} not in the validation sweep — exploratory, no gate yet"
                elif not promoted:
                    evidence = "failed Monte-Carlo gate — not enough evidence yet"
                else:
                    evidence = f"promoted: {reg_exp:+.2f}R over {reg_n} trades in {regime}"
                signal_views.append({
                    "name": s, "label": meta.label, "family": meta.family, "best_regime": meta.best_regime,
                    "active": active, "armed": True, "direction": view_dir,
                    "order_type": getattr(sig, "order_type", None),
                    "entry": _f(getattr(sig, "entry", None)) if sig else None,
                    "stop": _f(getattr(sig, "stop", None)) if sig else None,
                    "target": _f(getattr(sig, "target", None)) if sig else None,
                    "reason": getattr(sig, "reason", "") if sig else "",
                    "factors": dict(getattr(sig, "factors", {})) if sig else {},
                    "confluence": conf_view,
                    "blocked_by_regime": bool(active and conf_view and conf_view["execute"] and regime_blocked),
                    "regime_win_rate": reg_wr, "regime_expectancy_r": reg_exp, "regime_sample": reg_n,
                    "score": score, "recommended": recommended, "qualified": qualified, "evidence": evidence,
                })

            # ---- manage an open position --------------------------------------
            if pos is not None:
                closed = bt._manage(pos, df, ctx, execu, i, self.timeframe)
                if closed is not None:
                    closed.strategy = pos_strategy or ""
                    closed.timeframe = self.timeframe
                    r = closed.r_multiple
                    pnl = closed.pnl_dollars
                    balance += pnl
                    day_pnl += pnl
                    day_r += r
                    n_tr += 1
                    if r > 0:
                        wins += 1
                    sum_r += r
                    sum_r2 += r * r
                    if pnl > 0:
                        gross_profit += pnl
                    elif pnl < 0:
                        gross_loss += pnl
                    cum_r += r
                    equity_curve_r.append(round(cum_r, 4))
                    peak_r = max(peak_r, cum_r)
                    maxdd_r = min(maxdd_r, cum_r - peak_r)
                    eq_pct *= (1.0 + 0.01 * r)
                    peak_pct = max(peak_pct, eq_pct)
                    maxdd_pct = min(maxdd_pct, eq_pct / peak_pct - 1.0)
                    recent_trade_dicts.append({
                        "strategy": closed.strategy, "direction": _dirstr(closed.direction),
                        "entry_time": closed.entry_time, "exit_time": closed.exit_time,
                        "entry_price": closed.entry_price, "exit_price": closed.exit_price,
                        "r_multiple": closed.r_multiple, "pnl_dollars": closed.pnl_dollars,
                        "exit_reason": closed.exit_reason, "regime_at_entry": closed.regime_at_entry,
                        "bars_held": closed.bars_held,
                    })
                    consec_losses = consec_losses + 1 if r <= 0 else 0
                    if consec_losses >= 3:
                        cooldown_until = i + cooldown_bars
                        consec_losses = 0
                    if day_r <= -2.0:
                        day_locked = True
                    pos = None
                    pos_strategy = None

            # ---- open a new position from the best candidate ------------------
            if pos is None and not day_locked and i > cooldown_until and entry_candidates:
                for s, sig, conf_view in entry_candidates:
                    fill = execu.fill(
                        direction=sig.direction, order_type=sig.order_type,
                        intended_price=sig.entry, atr_v=ctx.atr[i], bar_index=i,
                        ts_hour=ts.hour, bar_volume=vols[i],
                        avg_daily_volume=ctx.avg_daily_volume)
                    if fill.rejected or fill.filled_fraction <= 0:
                        continue
                    risk = abs(fill.price - sig.stop)
                    if risk <= 0:
                        continue
                    pos = Position(
                        direction=sig.direction, entry_price=fill.price, initial_stop=sig.stop,
                        stop=sig.stop, target=sig.target, risk=risk, entry_index=i,
                        entry_time=ts.isoformat(), regime=regime,
                        confidence=conf_view["confidence"], commission_paid=fill.commission)
                    pos_strategy = s
                    trades_today += 1
                    break

            # ---- structure markers (BOS) --------------------------------------
            sh, sl = ctx.last_sh[i], ctx.last_sl[i]
            c = closes[i]
            tsx = int(ts.timestamp())
            if not np.isnan(sh) and c > sh and (not recent_bos or recent_bos[-1]["end_time"] != tsx):
                recent_bos.append({"kind": "BOS", "direction": "long", "start_time": tsx, "end_time": tsx,
                                   "low": float(sh), "high": float(sh), "label": f"BOS up {sh:.2f}"})
            elif not np.isnan(sl) and c < sl and (not recent_bos or recent_bos[-1]["end_time"] != tsx):
                recent_bos.append({"kind": "BOS", "direction": "short", "start_time": tsx, "end_time": tsx,
                                   "low": float(sl), "high": float(sl), "label": f"BOS down {sl:.2f}"})
            recent_bos = recent_bos[-2:]

            # ---- sliding overlay zones (cheap; pointer + small window) --------
            while fvg_ptr < len(ctx_fvgs) and ctx_fvgs[fvg_ptr]["created_at"] <= i:
                active_fvg.append(ctx_fvgs[fvg_ptr])
                fvg_ptr += 1
            active_fvg = [z for z in active_fvg if i - z["created_at"] <= ZONE_TTL_BARS][-MAX_ZONE_OVERLAYS:]
            while ob_ptr < len(ctx_obs) and ctx_obs[ob_ptr]["created_at"] <= i:
                active_ob.append(ctx_obs[ob_ptr])
                ob_ptr += 1
            active_ob = [z for z in active_ob if i - z["created_at"] <= ZONE_TTL_BARS][-MAX_ZONE_OVERLAYS:]

            overlays: list[dict[str, Any]] = []
            for z in active_fvg:
                overlays.append({"kind": "FVG", "direction": _dirstr(z["dir"]),
                                 "start_time": int(index[z["created_at"]].timestamp()), "end_time": tsx,
                                 "low": round(float(z["low"]), 4), "high": round(float(z["high"]), 4),
                                 "label": f"{'Bull' if z['dir'] > 0 else 'Bear'} FVG"})
            for z in active_ob:
                overlays.append({"kind": "OB", "direction": _dirstr(z["dir"]),
                                 "start_time": int(index[z["created_at"]].timestamp()), "end_time": tsx,
                                 "low": round(float(z["low"]), 4), "high": round(float(z["high"]), 4),
                                 "label": f"{'Bull' if z['dir'] > 0 else 'Bear'} OB"})
            if ctx.or_done[i] and not np.isnan(ctx.or_high[i]):
                day0 = ts.normalize()
                overlays.append({"kind": "ORB", "direction": "flat",
                                 "start_time": int(day0.replace(hour=9, minute=30).timestamp()), "end_time": tsx,
                                 "low": round(float(ctx.or_low[i]), 4), "high": round(float(ctx.or_high[i]), 4),
                                 "label": "Opening Range"})
            overlays.extend(recent_bos)

            # ---- rank live setups (anti-flood) --------------------------------
            actionable = [v for v in signal_views
                          if v["active"] and v["entry"] is not None and not v["blocked_by_regime"]]
            actionable.sort(key=lambda v: (v["score"], v["confluence"]["confidence"] if v["confluence"] else 0.0),
                            reverse=True)
            best_setup = actionable[0]["name"] if actionable else None
            also_firing = [v["name"] for v in actionable[1:]]
            # the single genuinely-qualified setup (drives auto-pause + stable panel)
            qual = [v for v in signal_views if v["qualified"] and v["entry"] is not None]
            qual.sort(key=lambda v: v["score"], reverse=True)
            qualified_setup = qual[0]["name"] if qual else None

            # ---- metrics (incremental) ----------------------------------------
            unreal = self._unrealized(pos, closes[i])
            equity = balance + unreal
            profit_factor = (gross_profit / abs(gross_loss)) if gross_loss < 0 else None
            if n_tr > 1:
                mean_r = sum_r / n_tr
                var = max((sum_r2 - n_tr * mean_r * mean_r) / (n_tr - 1), 0.0)
                std = math.sqrt(var)
                sharpe = (mean_r / std * math.sqrt(n_tr)) if std > 0 else 0.0
            else:
                sharpe = 0.0
            metrics = {
                "bar_index": i, "bars_total": n,
                "elapsed_seconds": round((i - WARMUP) * self.settings.base_tick_seconds, 2),
                "balance": round(balance, 2), "equity": round(equity, 2),
                "cumulative_pnl": round(balance - starting, 2), "daily_pnl": round(day_pnl, 2),
                "expectancy_r": round(sum_r / n_tr, 4) if n_tr else 0.0,
                "win_rate": round(wins / n_tr * 100, 2) if n_tr else 0.0,
                "profit_factor": round(profit_factor, 4) if profit_factor is not None else None,
                "sharpe": round(sharpe, 4),
                "trades": n_tr, "open_positions": int(pos is not None),
                "max_drawdown_pct": round(abs(maxdd_pct) * 100, 2),
                "max_drawdown_r": round(maxdd_r, 4),
                "consecutive_losses": consec_losses,
                "cooldown_bars_remaining": max(0, cooldown_until - i + 1) if cooldown_until >= i else 0,
                "daily_stop_active": day_locked, "sufficient_sample": n_tr >= 100,
                "trades_today": trades_today, "equity_curve_r": equity_curve_r[-200:],
            }

            position = None
            if pos is not None:
                risk_dollars = pos.risk * point
                position = {
                    "symbol": self.symbol, "strategy": pos_strategy or "",
                    "side": "buy" if pos.direction > 0 else "sell", "direction": _dirstr(pos.direction),
                    "entry_price": round(pos.entry_price, 4), "stop": round(pos.stop, 4),
                    "target": round(pos.target, 4), "contracts": round(pos.contracts, 3),
                    "unrealized_pnl": round(unreal, 2),
                    "unrealized_r": round(unreal / risk_dollars, 3) if risk_dollars > 0 else 0.0,
                    "opened_at": pos.entry_time, "bars_held": i - pos.entry_index,
                    "partial_taken": pos.partial_taken, "trailing": pos.trailing,
                }

            snaps.append({
                "type": "tick", "symbol": self.symbol, "timeframe": self.timeframe, "seed": self.seed,
                "bar_index": i,
                "ohlc": {"time": tsx, "open": round(float(opens[i]), 4), "high": round(float(highs[i]), 4),
                         "low": round(float(lows[i]), 4), "close": round(float(closes[i]), 4),
                         "volume": round(float(vols[i]), 2)},
                "indicators": {
                    "atr_14": round(_f(ctx.atr[i]), 4), "atr_expanded": atr_expanded,
                    "adx_14": round(_f(ctx.adx[i]), 2), "plus_di": round(_f(ctx.plus_di[i]), 2),
                    "minus_di": round(_f(ctx.minus_di[i]), 2), "ema_20": round(_f(ctx.ema20[i]), 2),
                    "ema_50": round(_f(ctx.ema50[i]), 2), "rsi_14": round(_f(ctx.rsi[i]), 2),
                    "vwap": round(_f(ctx.vwap[i]), 2), "in_killzone": _in_killzone(ts)},
                "regime": regime, "signal": _dirstr(pos.direction) if pos is not None else "flat",
                "active_strategy": pos_strategy, "signals": signal_views,
                "confluence": self._primary_confluence(signal_views, pos_strategy),
                "position": position, "recent_trades": recent_trade_dicts[-MAX_RECENT_TRADES:],
                "metrics": metrics, "overlays": overlays,
                "data_source": self.data_source, "best_setup": best_setup, "also_firing": also_firing,
                "qualified_setup": qualified_setup,
            })

        return snaps

    # --------------------------------------------------------------- helpers
    def _primary_confluence(self, views: list[dict[str, Any]], active: str | None) -> dict[str, Any]:
        if active:
            for v in views:
                if v["name"] == active and v["confluence"]:
                    return v["confluence"]  # type: ignore[no-any-return]  # dict value is a confluence dict
        best = max((v for v in views if v["confluence"]),
                   key=lambda v: v["confluence"]["confidence"], default=None)
        if best and best["confluence"]:
            return best["confluence"]  # type: ignore[no-any-return]  # dict value is a confluence dict
        return {"execute": False, "confidence": 0.0, "threshold": confluence.THRESHOLD_NORMAL,
                "missing_factors": list(confluence.WEIGHTS.keys()),
                "score_breakdown": {k: 0.0 for k in confluence.WEIGHTS}}

    def _unrealized(self, pos: Position | None, close: float) -> float:
        if pos is None:
            return 0.0
        leg = (close - pos.entry_price) * pos.direction * self.inst.point_value * pos.contracts
        return leg + pos.realized_pnl - pos.commission_paid

    # --------------------------------------------------------------- meta
    def meta(self) -> dict[str, Any]:
        return {
            "type": "meta", "symbol": self.symbol, "timeframe": self.timeframe, "seed": self.seed,
            "instrument": {
                "symbol": self.inst.symbol, "name": self.inst.name,
                "point_value": self.inst.point_value, "tick_size": self.inst.tick_size,
                "commission_per_side": self.inst.commission_per_side,
            },
            "bars_total": self.bars_total, "first_index": self.first_index,
            "armed": self.armed, "regime_filter": self.regime_filter, "data_source": self.data_source,
            "starting_balance": self.settings.starting_balance,
            "strategies": [
                {"name": k, "label": v[1].label, "family": v[1].family, "best_regime": v[1].best_regime}
                for k, v in REGISTRY.items()
            ],
        }

    def tick_at(self, n_index: int, playing: bool) -> SimulationTick | None:
        """Materialise the typed tick lazily (one per streamed bar)."""
        if not self.snaps:
            return None
        n_index = max(0, min(n_index, len(self.snaps) - 1))
        return SimulationTick.model_validate({**self.snaps[n_index], "playing": playing})

    def window(self, cursor: int, size: int = 400) -> list[dict[str, Any]]:
        """Candle window ending at cursor (for chart redraws after a seek)."""
        if not self.snaps:
            return []
        cursor = max(0, min(cursor, len(self.snaps) - 1))
        start = max(0, cursor - size + 1)
        return [self.snaps[k]["ohlc"] for k in range(start, cursor + 1)]

    @property
    def length(self) -> int:
        return len(self.snaps)

    def fresh_qualified_at(self, index: int) -> str | None:
        """Return the qualified-setup name at `index` only if it is a *fresh*
        qualification edge (different from the previous bar) — used by the player
        to auto-pause once per new teaching moment, not every bar."""
        if index < 0 or index >= len(self.snaps):
            return None
        q = self.snaps[index].get("qualified_setup")
        if not q:
            return None
        prev = self.snaps[index - 1].get("qualified_setup") if index > 0 else None
        return q if q != prev else None
