"""Deterministic backtest runner.

State machine per strategy:
    idle -> scanning -> confluence_check -> entry -> manage -> exit -> cooldown

Risk controls:
    * -2R hard daily loss lock (no new entries that day)
    * cooldown for `cooldown_bars` after 3 consecutive losses
Position management:
    * partial close (50%) at +1R, then stop -> breakeven
    * ATR trailing stop on the runner
    * final target from the signal (e.g. 2R, or VWAP for reversion)
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Optional

import numpy as np
import pandas as pd

from . import confluence
from . import metrics as metrics_mod
from .execution import ExecutionModel
from .strategies import REGISTRY, Ctx, build_context
from .types import Fill, Instrument, Signal, Trade

log = logging.getLogger("simulation")

WARMUP = 60
COOLDOWN_BARS = {"1m": 15, "5m": 3, "15m": 1, "30m": 1, "1h": 1}
TRAIL_ATR = 1.0


@dataclass
class Position:
    direction: int
    entry_price: float
    initial_stop: float
    stop: float
    target: float
    risk: float                       # |entry - initial_stop|
    entry_index: int
    entry_time: str
    regime: str
    confidence: float
    contracts: float = 1.0
    realized_pnl: float = 0.0         # from partial closes
    commission_paid: float = 0.0
    partial_taken: bool = False
    trailing: bool = False


@dataclass
class BacktestResult:
    strategy: str
    symbol: str
    timeframe: str
    seed: int
    trades: list[Trade] = field(default_factory=list)
    metrics: dict = field(default_factory=dict)
    state_transitions: int = 0


class Backtester:
    def __init__(self, instrument: Instrument, seed: int,
                 news_bars: set[int] | None = None):
        self.inst = instrument
        self.seed = seed
        self.news_bars = news_bars or set()

    def run(self, strategy_name: str, df: pd.DataFrame, timeframe: str,
            session_start_min: int | None = None) -> BacktestResult:
        """session_start_min: optional minutes-from-midnight ET gate; entries are
        only taken at/after that time of day. Default None = no gate (this keeps
        the determinism proof byte-identical, since the sweep never passes it)."""
        fn, _meta = REGISTRY[strategy_name]
        ctx = build_context(df, self.inst)
        execu = ExecutionModel(self.inst, self.seed, self.news_bars)
        cooldown_bars = COOLDOWN_BARS.get(timeframe, 3)

        state: dict = {"active_fvgs": [], "active_obs": [], "fvg_ptr": 0, "ob_ptr": 0}
        trades: list[Trade] = []
        pos: Optional[Position] = None
        transitions = 0

        consec_losses = 0
        cooldown_until = -1
        cur_day = None
        day_r = 0.0
        day_locked = False

        n = len(df)
        for i in range(WARMUP, n):
            ts = df.index[i]
            day = ts.normalize()
            if day != cur_day:
                cur_day, day_r, day_locked = day, 0.0, False

            self._advance_zones(state, ctx, i)

            # --- manage open position -------------------------------------
            if pos is not None:
                closed = self._manage(pos, df, ctx, execu, i, timeframe)
                if closed is not None:
                    trades.append(closed)
                    transitions += 1
                    day_r += closed.r_multiple
                    if closed.r_multiple <= 0:
                        consec_losses += 1
                    else:
                        consec_losses = 0
                    if consec_losses >= 3:
                        cooldown_until = i + cooldown_bars
                        consec_losses = 0
                        log.info("cooldown until bar %d after 3 losses", cooldown_until)
                    if day_r <= -2.0:
                        day_locked = True
                        log.info("daily -2R lock hit on %s", day.date())
                    pos = None
                continue  # one action per bar while a position exists

            # --- look for a new entry -------------------------------------
            if day_locked or i <= cooldown_until:
                continue
            if session_start_min is not None and (ts.hour * 60 + ts.minute) < session_start_min:
                continue

            sig: Optional[Signal] = fn(df, i, ctx, state)
            if sig is None:
                continue
            transitions += 1  # scanning -> confluence_check

            atr_expanded = (not np.isnan(ctx.atr[i]) and not np.isnan(ctx.atr_avg[i])
                            and ctx.atr[i] > 1.5 * ctx.atr_avg[i])
            conf = confluence.evaluate(sig.factors, atr_expanded, log_ctx=f"{strategy_name}@{i}")
            if not conf.execute:
                log.debug("blocked %s @%d conf=%.2f missing=%s",
                          strategy_name, i, conf.confidence, conf.missing_factors)
                continue

            fill = execu.fill(
                direction=sig.direction, order_type=sig.order_type,
                intended_price=sig.entry, atr_v=ctx.atr[i], bar_index=i,
                ts_hour=ts.hour, bar_volume=df["volume"].iat[i],
                avg_daily_volume=ctx.avg_daily_volume)
            if fill.rejected or fill.filled_fraction <= 0:
                continue

            risk = abs(fill.price - sig.stop)
            if risk <= 0:
                continue
            pos = Position(
                direction=sig.direction, entry_price=fill.price, initial_stop=sig.stop,
                stop=sig.stop, target=sig.target, risk=risk, entry_index=i,
                entry_time=ts.isoformat(), regime=ctx.regimes[i],
                confidence=conf.confidence, commission_paid=fill.commission)
            transitions += 1  # entry -> manage

        # close any dangling position at the last bar
        if pos is not None:
            trades.append(self._force_close(pos, df, ctx, execu, n - 1))

        for t in trades:
            t.strategy = strategy_name
            t.timeframe = timeframe
        result = BacktestResult(strategy_name, self.inst.symbol, timeframe, self.seed,
                                trades=trades, state_transitions=transitions)
        result.metrics = metrics_mod.compute_metrics(trades)
        return result

    # -- zone bookkeeping ---------------------------------------------------
    def _advance_zones(self, state, ctx: Ctx, i: int):
        while state["fvg_ptr"] < len(ctx.fvgs) and ctx.fvgs[state["fvg_ptr"]]["created_at"] <= i - 1:
            z = dict(ctx.fvgs[state["fvg_ptr"]]); z["consumed"] = False
            state["active_fvgs"].append(z)
            state["fvg_ptr"] += 1
        state["active_fvgs"] = [z for z in state["active_fvgs"]
                                if not z["consumed"] and i - z["created_at"] <= 60]
        while state["ob_ptr"] < len(ctx.obs) and ctx.obs[state["ob_ptr"]]["created_at"] <= i - 1:
            z = dict(ctx.obs[state["ob_ptr"]]); z["consumed"] = False
            state["active_obs"].append(z)
            state["ob_ptr"] += 1
        state["active_obs"] = [z for z in state["active_obs"]
                               if not z["consumed"] and i - z["created_at"] <= 60]

    # -- position management ------------------------------------------------
    def _manage(self, pos: Position, df, ctx: Ctx, execu: ExecutionModel,
                i: int, timeframe: str) -> Optional[Trade]:
        d = pos.direction
        hi = df["high"].iat[i]; lo = df["low"].iat[i]
        atrv = ctx.atr[i] if not np.isnan(ctx.atr[i]) else pos.risk

        partial_level = pos.entry_price + d * 1.0 * pos.risk
        do_partial = abs(pos.target - pos.entry_price) > 1.2 * pos.risk

        # 1) partial + move to breakeven
        if do_partial and not pos.partial_taken:
            hit_partial = (hi >= partial_level) if d > 0 else (lo <= partial_level)
            if hit_partial:
                fill = execu.fill(direction=-d, order_type="market",
                                  intended_price=partial_level, atr_v=atrv, bar_index=i,
                                  ts_hour=df.index[i].hour, bar_volume=df["volume"].iat[i],
                                  avg_daily_volume=ctx.avg_daily_volume,
                                  order_contracts=pos.contracts * 0.5)
                qty = pos.contracts * 0.5
                pos.realized_pnl += (fill.price - pos.entry_price) * d * self.inst.point_value * qty
                pos.commission_paid += fill.commission
                pos.contracts -= qty
                pos.partial_taken = True
                pos.trailing = True
                pos.stop = pos.entry_price  # breakeven

        # 2) trail the runner
        if pos.trailing:
            if d > 0:
                pos.stop = max(pos.stop, hi - TRAIL_ATR * atrv)
            else:
                pos.stop = min(pos.stop, lo + TRAIL_ATR * atrv)

        # 3) exit checks (stop assumed to trigger before target if both touch)
        stop_hit = (lo <= pos.stop) if d > 0 else (hi >= pos.stop)
        target_hit = (hi >= pos.target) if d > 0 else (lo <= pos.target)

        if stop_hit:
            reason = "trail" if (pos.trailing and pos.stop >= pos.entry_price * 1.0 and pos.partial_taken) else "stop"
            return self._close_at(pos, df, ctx, execu, i, pos.stop, reason)
        if target_hit:
            return self._close_at(pos, df, ctx, execu, i, pos.target, "target")
        return None

    def _close_at(self, pos: Position, df, ctx: Ctx, execu: ExecutionModel,
                  i: int, price: float, reason: str) -> Trade:
        d = pos.direction
        order_type = "limit" if reason == "target" else "market"
        fill = execu.fill(direction=-d, order_type=order_type, intended_price=price,
                          atr_v=ctx.atr[i] if not np.isnan(ctx.atr[i]) else pos.risk,
                          bar_index=i, ts_hour=df.index[i].hour,
                          bar_volume=df["volume"].iat[i],
                          avg_daily_volume=ctx.avg_daily_volume,
                          order_contracts=pos.contracts)
        qty = pos.contracts
        leg_pnl = (fill.price - pos.entry_price) * d * self.inst.point_value * qty
        total_pnl = pos.realized_pnl + leg_pnl - pos.commission_paid - fill.commission
        risk_dollars = pos.risk * self.inst.point_value  # 1 contract notional risk
        r_multiple = total_pnl / risk_dollars if risk_dollars > 0 else 0.0
        if pos.partial_taken and reason in ("stop", "trail"):
            reason = "partial+" + reason
        return Trade(
            strategy="", symbol=self.inst.symbol, timeframe="",
            direction=d, entry_time=pos.entry_time, exit_time=df.index[i].isoformat(),
            entry_price=round(pos.entry_price, 4), exit_price=round(fill.price, 4),
            risk_per_unit=round(pos.risk, 4),
            pnl_dollars=round(total_pnl, 2), r_multiple=round(r_multiple, 4),
            regime_at_entry=pos.regime, confidence=pos.confidence,
            exit_reason=reason, bars_held=i - pos.entry_index)

    def _force_close(self, pos, df, ctx, execu, i) -> Trade:
        return self._close_at(pos, df, ctx, execu, i, df["close"].iat[i], "eod")
