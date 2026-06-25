"""REST endpoints: batch results, coach, and journal."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import journal, progression, social, translation
from ..data import market_source
from . import customstrats, repository
from . import decision as decision_mod
from .backtest import SESSION_PRESETS, BacktestRequest, run_backtest
from .coach import CoachRequest, CoachResponse, assistant_health
from .coach import coach as run_coach
from .context import market_context
from .realchart import real_chart

router = APIRouter(prefix="/api", tags=["data"])


class TradeFeelingIn(BaseModel):
    id: int
    feeling: str = ""


class ContributeIn(BaseModel):
    challenge_id: str
    progress: int = 0


class ImportLogIn(BaseModel):
    name: str
    origin: str = "code"


@router.get("/instruments")
def get_instruments() -> dict[str, Any]:
    return {"instruments": repository.instruments(),
            "timeframes": ["1m", "5m", "15m", "30m", "1h"],
            "sessions": SESSION_PRESETS}


@router.get("/leaderboard")
def get_leaderboard() -> dict[str, Any]:
    return {"ready": repository.memory_ready(), "rows": repository.leaderboard()}


@router.get("/strategies")
def get_strategies() -> dict[str, Any]:
    return {"ready": repository.memory_ready(), "strategies": repository.strategies()}


@router.get("/strategies/{name}")
def get_strategy(name: str) -> dict[str, Any]:
    detail = repository.strategy_detail(name)
    if detail is None:
        raise HTTPException(status_code=404, detail=f"unknown strategy {name!r}")
    return detail


@router.get("/validation")
def get_validation() -> dict[str, Any]:
    return repository.validation()


@router.get("/education")
def get_education() -> dict[str, Any]:
    return {"markdown": repository.education_text()}


@router.post("/coach")
def post_coach(req: CoachRequest) -> CoachResponse:
    return run_coach(req)


@router.get("/assistant/health")
def get_assistant_health() -> dict[str, Any]:
    return assistant_health()


@router.get("/journal")
def get_journal() -> dict[str, Any]:
    return journal.fetch_all()


@router.post("/journal/trade")
def post_journal_trade(trade: journal.PaperTradeIn) -> dict[str, Any]:
    return {"id": journal.add_trade(trade)}


@router.post("/journal/note")
def post_journal_note(note: journal.NoteIn) -> dict[str, Any]:
    return {"id": journal.add_note(note)}


@router.post("/journal/session")
def post_journal_session(s: journal.SessionIn) -> dict[str, Any]:
    return {"id": journal.add_session(s)}


@router.post("/journal/missed-setup")
def post_missed_setup(m: journal.MissedSetupIn) -> dict[str, Any]:
    return {"id": journal.add_missed_setup(m)}


@router.post("/journal/session-review")
def post_session_review(s: journal.SessionReviewIn) -> dict[str, Any]:
    return {"id": journal.add_session_review(s)}


@router.post("/journal/cooldown")
def post_cooldown_event(e: journal.CooldownEventIn) -> dict[str, Any]:
    return {"id": journal.add_cooldown_event(e)}


@router.post("/journal/trade/feeling")
def post_trade_feeling(body: TradeFeelingIn) -> dict[str, Any]:
    journal.set_trade_feeling(body.id, body.feeling)
    return {"status": "ok"}


@router.delete("/journal")
def delete_journal() -> dict[str, Any]:
    journal.clear()
    progression.clear()
    translation.clear()
    social.clear()
    return {"status": "cleared"}


# --- Phase F: social layer (all via SocialDataSource) -------------------------
@router.get("/social/leaderboard")
def get_social_leaderboard() -> dict[str, Any]:
    return {"entries": social.get_source().leaderboard()}


@router.get("/social/duel/new")
def get_social_duel() -> dict[str, Any]:
    try:
        return social.new_duel()
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post("/social/duel/score")
def post_social_duel(req: social.DuelScoreIn) -> dict[str, Any]:
    try:
        return social.score_duel(req)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/social/duel/history")
def get_social_duel_history() -> dict[str, Any]:
    return social.duel_history()


@router.get("/social/community")
def get_social_community() -> dict[str, Any]:
    return social.community_challenge(social.current_week())


@router.post("/social/community/contribute")
def post_social_contribute(body: ContributeIn) -> dict[str, Any]:
    return {"id": social.record_contribution(body.challenge_id, body.progress)}


@router.get("/social/mentor")
def get_social_mentor(self_review: bool = False) -> dict[str, Any]:
    return social.get_source().mentor_student(self_review)


@router.post("/social/mentor/feedback")
def post_social_mentor_feedback(req: social.MentorFeedbackIn) -> dict[str, Any]:
    return {"id": social.add_mentor_feedback(req)}


@router.get("/social/success")
def get_social_success() -> dict[str, Any]:
    return social.success_stories()


@router.post("/social/import")
def post_social_import(body: ImportLogIn) -> dict[str, Any]:
    return {"id": social.log_import(body.name, body.origin)}


# --- Phase E: translation layer (dual-source, drills, risk, compare) ---------
@router.get("/market/status")
def get_market_status() -> dict[str, Any]:
    return market_source.source_status()


@router.get("/market/bars")
def get_market_bars(symbol: str = "MNQ", timeframe: str = "5m",
                    source: str = "replay", limit: int = 400) -> dict[str, Any]:
    src = market_source.resolve_source(source)
    try:
        bars = src.bars(symbol, timeframe, limit=limit)
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    prov = src.provenance(symbol, timeframe) if hasattr(src, "provenance") else src.describe()
    return {"symbol": symbol, "timeframe": timeframe, "kind": src.kind,
            "bars": bars, "overlays": translation.overlays_for(bars, symbol), **prov}


@router.get("/compare")
def get_compare(symbol: str = "MNQ", timeframe: str = "5m", seed: int = 42) -> dict[str, Any]:
    try:
        return translation.compare_payload(symbol, timeframe, seed)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/compare/mark")
def post_compare_mark(m: translation.CompareMarkIn) -> dict[str, Any]:
    return {"id": translation.add_comparison(m)}


@router.get("/drill/pattern/new")
def get_pattern_drill() -> dict[str, Any]:
    try:
        return translation.new_pattern_drill()
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post("/drill/pattern/score")
def post_pattern_drill(req: translation.PatternScoreIn) -> dict[str, Any]:
    try:
        return translation.score_pattern_drill(req)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/drill/pattern/stats")
def get_pattern_drill_stats() -> dict[str, Any]:
    return translation.pattern_drill_stats()


@router.get("/risk/counterfactual")
def get_risk_counterfactual() -> dict[str, Any]:
    return translation.risk_counterfactual()


@router.get("/progression")
def get_progression() -> dict[str, Any]:
    return progression.summary()


@router.post("/backtest")
def post_backtest(req: BacktestRequest) -> dict[str, Any]:
    try:
        return run_backtest(req)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/realchart")
def get_realchart(symbol: str = "MNQ", timeframe: str = "5m") -> dict[str, Any]:
    return real_chart(symbol, timeframe)


# --- decision-point training -------------------------------------------------
@router.get("/decision/new")
def get_decision_new(difficulty: str = "beginner") -> dict[str, Any]:
    try:
        return decision_mod.new_scenario(difficulty).model_dump()
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post("/decision/score")
def post_decision_score(req: decision_mod.ScoreRequest) -> dict[str, Any]:
    try:
        return decision_mod.score(req)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/decision/stats")
def get_decision_stats() -> dict[str, Any]:
    return decision_mod.stats()


@router.delete("/decision")
def delete_decisions() -> dict[str, Any]:
    decision_mod.clear()
    return {"status": "cleared"}


# --- market context ----------------------------------------------------------
@router.get("/context")
def get_context(symbol: str = "MNQ", timeframe: str = "15m", seed: int = 42) -> dict[str, Any]:
    try:
        return market_context(symbol, timeframe, seed)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# --- custom strategies -------------------------------------------------------
@router.get("/custom-strategies")
def get_custom_strategies() -> dict[str, Any]:
    return {"strategies": customstrats.listing()}


@router.post("/custom-strategies")
def post_custom_strategy(s: customstrats.CustomStrategy) -> dict[str, Any]:
    return {"id": customstrats.save(s)}


@router.delete("/custom-strategies/{name}")
def delete_custom_strategy(name: str) -> dict[str, Any]:
    customstrats.delete(name)
    return {"status": "deleted"}
