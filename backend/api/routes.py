"""REST endpoints: batch results, coach, and journal."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from .. import journal, progression
from . import customstrats, repository
from . import decision as decision_mod
from .backtest import SESSION_PRESETS, BacktestRequest, run_backtest
from .coach import CoachRequest, CoachResponse, assistant_health
from .coach import coach as run_coach
from .context import market_context
from .realchart import real_chart

router = APIRouter(prefix="/api", tags=["data"])


@router.get("/instruments")
def get_instruments() -> dict:
    return {"instruments": repository.instruments(),
            "timeframes": ["1m", "5m", "15m", "30m", "1h"],
            "sessions": SESSION_PRESETS}


@router.get("/leaderboard")
def get_leaderboard() -> dict:
    return {"ready": repository.memory_ready(), "rows": repository.leaderboard()}


@router.get("/strategies")
def get_strategies() -> dict:
    return {"ready": repository.memory_ready(), "strategies": repository.strategies()}


@router.get("/strategies/{name}")
def get_strategy(name: str) -> dict:
    detail = repository.strategy_detail(name)
    if detail is None:
        raise HTTPException(status_code=404, detail=f"unknown strategy {name!r}")
    return detail


@router.get("/validation")
def get_validation() -> dict:
    return repository.validation()


@router.get("/education")
def get_education() -> dict:
    return {"markdown": repository.education_text()}


@router.post("/coach")
def post_coach(req: CoachRequest) -> CoachResponse:
    return run_coach(req)


@router.get("/assistant/health")
def get_assistant_health() -> dict:
    return assistant_health()


@router.get("/journal")
def get_journal() -> dict:
    return journal.fetch_all()


@router.post("/journal/trade")
def post_journal_trade(trade: journal.PaperTradeIn) -> dict:
    return {"id": journal.add_trade(trade)}


@router.post("/journal/note")
def post_journal_note(note: journal.NoteIn) -> dict:
    return {"id": journal.add_note(note)}


@router.post("/journal/session")
def post_journal_session(s: journal.SessionIn) -> dict:
    return {"id": journal.add_session(s)}


@router.post("/journal/missed-setup")
def post_missed_setup(m: journal.MissedSetupIn) -> dict:
    return {"id": journal.add_missed_setup(m)}


@router.post("/journal/session-review")
def post_session_review(s: journal.SessionReviewIn) -> dict:
    return {"id": journal.add_session_review(s)}


@router.delete("/journal")
def delete_journal() -> dict:
    journal.clear()
    progression.clear()
    return {"status": "cleared"}


@router.get("/progression")
def get_progression() -> dict:
    return progression.summary()


@router.post("/backtest")
def post_backtest(req: BacktestRequest) -> dict:
    try:
        return run_backtest(req)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/realchart")
def get_realchart(symbol: str = "MNQ", timeframe: str = "5m") -> dict:
    return real_chart(symbol, timeframe)


# --- decision-point training -------------------------------------------------
@router.get("/decision/new")
def get_decision_new(difficulty: str = "beginner") -> dict:
    try:
        return decision_mod.new_scenario(difficulty).model_dump()
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post("/decision/score")
def post_decision_score(req: decision_mod.ScoreRequest) -> dict:
    try:
        return decision_mod.score(req)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/decision/stats")
def get_decision_stats() -> dict:
    return decision_mod.stats()


@router.delete("/decision")
def delete_decisions() -> dict:
    decision_mod.clear()
    return {"status": "cleared"}


# --- market context ----------------------------------------------------------
@router.get("/context")
def get_context(symbol: str = "MNQ", timeframe: str = "15m", seed: int = 42) -> dict:
    try:
        return market_context(symbol, timeframe, seed)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# --- custom strategies -------------------------------------------------------
@router.get("/custom-strategies")
def get_custom_strategies() -> dict:
    return {"strategies": customstrats.listing()}


@router.post("/custom-strategies")
def post_custom_strategy(s: customstrats.CustomStrategy) -> dict:
    return {"id": customstrats.save(s)}


@router.delete("/custom-strategies/{name}")
def delete_custom_strategy(name: str) -> dict:
    customstrats.delete(name)
    return {"status": "deleted"}
