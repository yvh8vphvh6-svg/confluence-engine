"""Phase-E translation layer: dual-source market data, side-by-side compare,
pattern drills (idempotent XP), and the risk counterfactual. Deterministic;
ReplayDataSource makes it offline-testable."""
from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest

from backend import journal, progression, translation
from backend.data import market_source
from backend.journal import PaperTradeIn


@pytest.fixture()
def db(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[Path]:
    p = tmp_path / "journal.db"
    monkeypatch.setattr(journal, "DB_PATH", p)
    monkeypatch.setattr(translation, "DB_PATH", p)
    journal.clear()
    translation.clear()
    yield p


# --- feature 4: market source -------------------------------------------------
def test_replay_source_is_default_and_offline() -> None:
    src = market_source.resolve_source("replay")
    assert isinstance(src, market_source.ReplayDataSource)
    bars = src.bars("MNQ", "5m", limit=50)
    assert len(bars) == 50
    assert all({"time", "open", "high", "low", "close"} <= set(b) for b in bars)


def test_live_falls_back_to_replay_without_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv(market_source.LIVE_KEY_ENV, raising=False)
    assert market_source.live_configured() is False
    # even when asked for live, with no key we silently get replay
    assert isinstance(market_source.resolve_source("live"), market_source.ReplayDataSource)
    status = market_source.source_status()
    assert status["live_configured"] is False
    assert "MNQ" in status["replay_symbols"]


def test_live_selectable_with_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(market_source.LIVE_KEY_ENV, "test-key-not-used")
    assert market_source.live_configured() is True
    src = market_source.resolve_source("live")
    assert isinstance(src, market_source.LiveDataSource)
    # the key value is never surfaced
    assert "test-key-not-used" not in str(market_source.source_status())


# --- feature 1: side-by-side --------------------------------------------------
def test_compare_aligns_axis_and_overlays_both() -> None:
    c = translation.compare_payload("MNQ", "5m", seed=42, limit=80)
    syn, real = c["synthetic"]["candles"], c["real"]["candles"]
    assert len(syn) == len(real) == 80
    assert syn[-1]["time"] == real[-1]["time"]  # shared timestamp axis
    # same overlay treatment on both sides (may be empty, but the key exists)
    assert isinstance(c["synthetic"]["overlays"], list)
    assert isinstance(c["real"]["overlays"], list)


def test_compare_mark_roundtrip(db: Path) -> None:
    translation.add_comparison(translation.CompareMarkIn(
        symbol="MNQ", timeframe="5m", synthetic_take=True, real_take=False))
    with translation._conn() as conn:
        rows = conn.execute("SELECT * FROM setup_comparisons").fetchall()
    assert len(rows) == 1 and rows[0]["synthetic_take"] == 1 and rows[0]["real_take"] == 0


# --- feature 2: pattern drills ------------------------------------------------
def test_pattern_drill_scores_and_xp_is_idempotent(db: Path) -> None:
    d = translation.new_pattern_drill()
    assert len(d["choices"]) == 8 and len(d["candles"]) >= 2
    # discover the optimal, then answer it correctly
    probe = translation.score_pattern_drill(translation.PatternScoreIn(scenario=d["scenario"], answer="__none__"))
    optimal = probe["optimal"]
    assert optimal  # a strategy executed in this window
    good = translation.score_pattern_drill(translation.PatternScoreIn(scenario=d["scenario"], answer=optimal))
    assert good["correct"] is True
    assert translation.pattern_drill_correct_count() == 1
    # re-answering the same scenario does not grant XP twice (distinct scenarios)
    translation.score_pattern_drill(translation.PatternScoreIn(scenario=d["scenario"], answer=optimal))
    assert translation.pattern_drill_correct_count() == 1


def test_pattern_drill_xp_feeds_progression_ledger(db: Path) -> None:
    d = translation.new_pattern_drill()
    optimal = translation.score_pattern_drill(
        translation.PatternScoreIn(scenario=d["scenario"], answer="__none__"))["optimal"]
    translation.score_pattern_drill(translation.PatternScoreIn(scenario=d["scenario"], answer=optimal))
    row = next(r for r in progression.xp_ledger(journal.fetch_all(), 0, translation.pattern_drill_correct_count())
               if r["event"] == "Pattern drill correct")
    assert row["count"] == 1 and row["xp"] == progression.XP_PATTERN_DRILL


# --- feature 3: risk counterfactual ------------------------------------------
def test_risk_counterfactual_gated_then_models_no_stop(db: Path) -> None:
    assert translation.risk_counterfactual()["available"] is False  # n < MIN_SAMPLE
    # 8 winners (+1R) and 4 losers (-1R): actual = +4R
    for _ in range(8):
        journal.add_trade(PaperTradeIn(strategy="ORB", r_multiple=1.0, exit_reason="target"))
    for _ in range(4):
        journal.add_trade(PaperTradeIn(strategy="ORB", r_multiple=-1.0, exit_reason="stop"))
    rc = translation.risk_counterfactual()
    assert rc["available"] is True and rc["n"] == 12
    assert rc["actual_r"] == 4.0
    # no-stop model: winners +8R, 4 losers at NO_STOP_LOSS_R each
    assert rc["model_r"] == round(8 + 4 * translation.NO_STOP_LOSS_R, 2)
    assert rc["gap_r"] == round(rc["actual_r"] - rc["model_r"], 2)
    assert len(rc["actual_curve"]) == 13  # 12 trades + the 0 origin
