"""Weighted confluence & confirmation engine.

Strict boolean inputs only. Each of the four factor groups contributes a
fixed weight when (and only when) its boolean is True. The execution
threshold tightens in expanding-volatility conditions.
"""
from __future__ import annotations

import logging

from .types import ConfluenceResult

log = logging.getLogger("confluence")

WEIGHTS: dict[str, float] = {
    "base": 0.40,        # strategy-specific trigger fired
    "structure": 0.20,   # HTF swing / liquidity / killzone alignment
    "timing": 0.20,      # OTE fib / VWAP / PDH-PDL proximity
    "pa": 0.20,          # close beyond + rejection wick + volume spike
}

THRESHOLD_NORMAL = 0.65
THRESHOLD_EXPANDED_VOL = 0.75


def evaluate(factors: dict[str, bool], atr_expanded: bool,
             log_ctx: str = "") -> ConfluenceResult:
    """Score a signal's confluence factors.

    factors must contain the four keys in WEIGHTS. Missing keys count as
    False (a fail-closed default) and are reported as missing.
    """
    breakdown: dict[str, float] = {}
    missing: list[str] = []
    score = 0.0
    for name, weight in WEIGHTS.items():
        present = bool(factors.get(name, False))
        contribution = weight if present else 0.0
        breakdown[name] = contribution
        score += contribution
        if not present:
            missing.append(name)
        log.debug("confluence[%s] %s=%s (+%.2f)", log_ctx, name, present, contribution)

    threshold = THRESHOLD_EXPANDED_VOL if atr_expanded else THRESHOLD_NORMAL
    # 'base' is mandatory: without the actual setup there is nothing to trade.
    execute = bool(factors.get("base", False)) and score >= threshold

    log.debug("confluence[%s] score=%.2f thr=%.2f execute=%s",
              log_ctx, score, threshold, execute)

    return ConfluenceResult(
        execute=execute,
        confidence=round(score, 4),
        threshold=threshold,
        missing_factors=missing,
        score_breakdown=breakdown,
    )
