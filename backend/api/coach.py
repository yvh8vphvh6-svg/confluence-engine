"""Trading coach — advisory voice, discipline-first, never a profit oracle.

Always available as deterministic rule-based copy. If ANTHROPIC_API_KEY is set,
the same structured context is phrased via Claude through the official Anthropic
SDK (lazy-imported; any failure falls back to the rules). Every response carries
a non-negotiable disclaimer and never promises profit or certainty.
"""
from __future__ import annotations

import logging
import os
from typing import Any

from pydantic import BaseModel, Field

from ..config.settings import get_settings

log = logging.getLogger("coach")

# Human-readable copy for each precise failure reason (never says just "set the key"
# unless the key really is missing).
REASON_NOTE = {
    "ok": "",
    "missing_key": "Set ANTHROPIC_API_KEY in the repo-root .env to enable the Claude coach.",
    "sdk_missing": "The `anthropic` SDK isn't installed — `pip install anthropic`.",
    "auth": "Claude rejected the API key (auth error). Check the key is valid.",
    "credit": "The Anthropic account is out of credit / billing isn't active.",
    "model": "The configured coach model id is invalid for this account.",
    "rate_limit": "Rate-limited by the Anthropic API — try again shortly.",
    "network": "Couldn't reach api.anthropic.com (network/offline).",
    "error": "The Claude call failed for an unexpected reason.",
}

DISCLAIMER = (
    "Practice / simulation on synthetic data. Signals are not guarantees — this "
    "is not financial advice. You trade your own money at your own risk."
)

def _api_key() -> str | None:
    # bare ANTHROPIC_API_KEY (loaded from .env by config.settings via python-dotenv)
    key = os.environ.get("ANTHROPIC_API_KEY")
    return key.strip() if key else None


def _coach_model() -> str:
    return get_settings().coach_model

SYSTEM_PROMPT = (
    "You are a disciplined trading coach inside a SIMULATION / paper-trading "
    "training tool that runs on SYNTHETIC data. Your job is risk discipline and "
    "honest education, not profit prediction.\n\n"
    "ABSOLUTE RULES (never break these):\n"
    "- NEVER promise, predict, or imply profit, gains, or certainty. No 'this will "
    "win', no price targets as expectations, no 'guaranteed'.\n"
    "- A backtested edge on synthetic data proves the code is correct, NOT that a "
    "strategy makes money live. Say so when citing stats.\n"
    "- Push back on greed and overtrading. If the user is overtrading, in a "
    "cooldown, past a daily loss limit, or already in a position, tell them to "
    "wait and protect capital.\n"
    "- Frame every actionable suggestion as conditional and risk-first: e.g. "
    "'IF you take it, risk <=1% and honor the stop.'\n"
    "- Be concise (2-5 short sentences). Lead with whether this is a strong "
    "in-regime setup or a wait. Plain language.\n"
    "Do not output a disclaimer yourself; the app appends one."
)


class CoachContext(BaseModel):
    symbol: str = ""
    timeframe: str = ""
    regime: str = ""
    has_setup: bool = False
    strategy: str | None = None
    label: str | None = None
    direction: str | None = None
    confidence: float | None = None
    threshold: float | None = None
    execute: bool = False
    missing_factors: list[str] = Field(default_factory=list)
    present_factors: list[str] = Field(default_factory=list)
    rr: float | None = None
    regime_expectancy_r: float | None = None
    regime_sample: int = 0
    recommended: bool = False
    evidence: str = ""
    # discipline context (from the real risk model)
    trades_today: int = 0
    consecutive_losses: int = 0
    cooldown_bars_remaining: int = 0
    daily_stop_active: bool = False
    open_position: bool = False


class CoachRequest(BaseModel):
    context: CoachContext
    question: str | None = None


class CoachResponse(BaseModel):
    text: str
    discipline_flags: list[str]
    disclaimer: str
    source: str  # "claude" | "rules"
    reason: str = "ok"  # ok | missing_key | sdk_missing | auth | credit | model | rate_limit | network | error


def _discipline_flags(c: CoachContext) -> list[str]:
    flags: list[str] = []
    if c.daily_stop_active:
        flags.append("Daily −2R loss limit hit — stop trading for the day.")
    if c.cooldown_bars_remaining > 0:
        flags.append(f"In cooldown ({c.cooldown_bars_remaining} bars) after consecutive losses — wait.")
    if c.consecutive_losses >= 2:
        flags.append(f"{c.consecutive_losses} losses in a row — slow down, don't revenge-trade.")
    if c.trades_today >= 5:
        flags.append(f"{c.trades_today} trades today — watch for overtrading; quality over quantity.")
    if c.open_position:
        flags.append("Already in a position — manage it; don't stack risk.")
    return flags


def _rule_based(c: CoachContext) -> str:
    if not c.has_setup:
        return ("No qualified setup right now. The disciplined move is to wait — "
                "no trade is a position. Let the market come to a setup that fits the regime.")
    name = c.label or c.strategy or "this setup"
    rr = f"{c.rr:.1f}:1" if c.rr else "the planned"
    parts: list[str] = []
    if c.recommended:
        parts.append(
            f"{name} is a strong, in-regime setup ({c.regime}) with a backtested edge "
            f"of {c.regime_expectancy_r:+.2f}R over {c.regime_sample} trades that cleared "
            "the Monte-Carlo gate — on synthetic data, which validates the logic, not a live edge.")
        parts.append(f"If you take it: risk no more than 1%, set the stop, and let {rr} reward run. "
                     "Honor the stop no matter what.")
    elif not c.execute:
        miss = ", ".join(c.missing_factors) or "confluence"
        parts.append(f"{name} is firing but confluence is incomplete (missing {miss}); "
                     "below the execution threshold.")
        parts.append("Better to wait — a partial setup is not an edge.")
    else:
        parts.append(f"{name} cleared confluence, but {c.evidence}. "
                     "Treat it as a practice rep, not a recommendation.")
        parts.append("If you take it for practice, still risk ≤1% and honor the stop.")
    flags = _discipline_flags(c)
    if flags:
        parts.append("Discipline check: " + " ".join(flags))
    return " ".join(parts)


def _build_user_prompt(req: CoachRequest) -> str:
    c = req.context
    lines = [
        f"Instrument: {c.symbol} {c.timeframe}, regime: {c.regime}, data: synthetic.",
        f"Setup present: {c.has_setup}.",
    ]
    if c.has_setup:
        lines += [
            f"Strategy: {c.label or c.strategy}, direction: {c.direction}.",
            f"Confluence: {c.confidence} vs threshold {c.threshold}, executes: {c.execute}.",
            f"Present factors: {c.present_factors}; missing: {c.missing_factors}.",
            f"Reward:risk ~ {c.rr}.",
            f"Backtested regime edge: {c.regime_expectancy_r}R over {c.regime_sample} trades; "
            f"recommended (passed gate): {c.recommended}. Evidence: {c.evidence}.",
        ]
    lines += [
        f"Risk state — trades today: {c.trades_today}, consecutive losses: {c.consecutive_losses}, "
        f"cooldown bars left: {c.cooldown_bars_remaining}, daily stop active: {c.daily_stop_active}, "
        f"open position: {c.open_position}.",
    ]
    if req.question:
        lines.append(f"\nThe trader asks: {req.question}\nAnswer as their coach.")
    else:
        lines.append("\nCoach the trader on this setup now.")
    return "\n".join(lines)


def _classify(exc: Exception) -> tuple[str, str]:
    """Map an Anthropic SDK exception to (reason, detail). Never includes the key."""
    try:
        import anthropic
    except ImportError:
        return "error", str(exc)
    status = getattr(exc, "status_code", None)
    msg = str(getattr(exc, "message", "") or exc)
    low = msg.lower()
    if isinstance(exc, anthropic.AuthenticationError):
        return "auth", f"401 {msg}"
    if isinstance(exc, anthropic.PermissionDeniedError):
        return ("credit" if ("credit" in low or "billing" in low) else "auth"), f"403 {msg}"
    if isinstance(exc, anthropic.NotFoundError):
        return "model", f"404 {msg}"
    if isinstance(exc, anthropic.RateLimitError):
        return "rate_limit", f"429 {msg}"
    if isinstance(exc, (anthropic.APIConnectionError, anthropic.APITimeoutError)):
        return "network", str(exc)[:200]
    if isinstance(exc, anthropic.BadRequestError):
        if "credit" in low or "billing" in low:
            return "credit", f"400 {msg}"
        if "model" in low:
            return "model", f"400 {msg}"
        return "error", f"400 {msg}"
    if isinstance(exc, anthropic.APIStatusError):
        if "credit" in low or "billing" in low:
            return "credit", f"{status} {msg}"
        return "error", f"{status} {msg}"
    return "error", str(exc)[:200]


def _call_claude(system: str, user: str, max_tokens: int = 600) -> tuple[str | None, str, str]:
    """Return (text, reason, detail). reason == 'ok' on success."""
    key = _api_key()
    if not key:
        return None, "missing_key", "ANTHROPIC_API_KEY not found in environment"
    try:
        import anthropic  # lazy
    except ImportError:
        return None, "sdk_missing", "anthropic package not installed"
    model = _coach_model()
    try:
        client = anthropic.Anthropic(api_key=key)
        msg = client.messages.create(
            model=model,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        text = "".join(b.text for b in msg.content if getattr(b, "type", None) == "text").strip()
        if not text:
            return None, "error", "empty response from model"
        return text, "ok", model
    except Exception as exc:  # noqa: BLE001 - classify, log (no key), fall back to rules
        reason, detail = _classify(exc)
        log.warning("Claude coach call failed: reason=%s model=%s detail=%s", reason, model, detail)
        return None, reason, detail


def coach(req: CoachRequest) -> CoachResponse:
    flags = _discipline_flags(req.context)
    text, reason, _detail = _call_claude(SYSTEM_PROMPT, _build_user_prompt(req))
    if text:
        return CoachResponse(text=text, discipline_flags=flags, disclaimer=DISCLAIMER,
                             source="claude", reason="ok")
    note = REASON_NOTE.get(reason, REASON_NOTE["error"])
    body = _rule_based(req.context)
    text = f"(Rule-based — {note}) {body}" if note else body
    return CoachResponse(text=text, discipline_flags=flags, disclaimer=DISCLAIMER,
                         source="rules", reason=reason)


def assistant_health() -> dict:
    """One tiny real Messages call to report whether the assistant can reach Claude.
    Returns the precise reason on failure. Never includes the key value."""
    key_present = bool(_api_key())
    if not key_present:
        return {"assistant_key_present": False, "assistant_status": "missing_key",
                "model": _coach_model(), "detail": REASON_NOTE["missing_key"]}
    text, reason, detail = _call_claude("Reply with the single word: pong.", "ping", max_tokens=8)
    ok = reason == "ok"
    return {
        "assistant_key_present": True,
        "assistant_status": "ok" if ok else reason,
        "model": _coach_model(),
        "detail": "" if ok else detail,
    }
