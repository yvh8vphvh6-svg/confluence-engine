"""Tests for the learning-feedback journal extensions: prediction + quality on
trades, missed-setup logging, session reviews, and confidence calibration.
All deterministic — no randomness, no network."""
from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest

from backend import journal
from backend.journal import (
    MissedSetupIn,
    PaperTradeIn,
    QualityIn,
    SessionReviewIn,
    WonLostFactor,
)


@pytest.fixture()
def db(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[Path]:
    p = tmp_path / "journal.db"
    monkeypatch.setattr(journal, "DB_PATH", p)
    journal.clear()  # creates schema in the fresh temp DB
    yield p


def _trade(confidence: int, r: float, predicted: str = "long", correct: bool = True) -> PaperTradeIn:
    return PaperTradeIn(
        symbol="MNQ", timeframe="5m", strategy="ORB", direction="long", regime="trending",
        entry_price=100, exit_price=100 + r, stop=99, target=102, contracts=1,
        r_multiple=r, pnl_dollars=r * 50, exit_reason="target" if r > 0 else "stop",
        predicted_direction=predicted, prediction_correct=correct, confidence=confidence,
        decision_ms=1500, take_skip_rationale="Setup quality",
        quality=QualityIn(setup=8, risk=10, execution=7, outcome=10, total=7.5),
        won_lost_factors=[WonLostFactor(label="Setup quality", score=0.8, note="strong confluence")],
    )


def test_trade_prediction_quality_roundtrip(db: Path) -> None:
    journal.add_trade(_trade(confidence=8, r=2.0))
    data = journal.fetch_all()
    assert data["stats"]["n"] == 1
    t = data["trades"][0]
    assert t["predicted_direction"] == "long"
    assert t["prediction_correct"] == 1
    assert t["confidence"] == 8
    assert t["decision_ms"] == 1500
    assert t["take_skip_rationale"] == "Setup quality"
    assert t["quality_total"] == 7.5
    # JSON column decoded back to a list of factor dicts
    assert isinstance(t["won_lost_factors"], list)
    assert t["won_lost_factors"][0]["label"] == "Setup quality"
    assert data["stats"]["avg_quality"] == 7.5
    assert data["stats"]["prediction_accuracy"] == 1.0


def test_missed_setup_roundtrip(db: Path) -> None:
    journal.add_missed_setup(MissedSetupIn(
        symbol="MGC", timeframe="15m", strategy="FVG_RETEST", direction="short",
        regime="ranging", r_potential=1.8, confluence=0.72, confidence=6,
        decision_ms=900, predicted_direction="skip"))
    data = journal.fetch_all()
    assert len(data["missed_setups"]) == 1
    m = data["missed_setups"][0]
    assert m["strategy"] == "FVG_RETEST"
    assert m["r_potential"] == 1.8
    assert m["predicted_direction"] == "skip"


def test_session_review_roundtrip(db: Path) -> None:
    journal.add_session_review(SessionReviewIn(
        started_at="1000", ended_at="2000", setups_seen=9, taken=5, wins=3, losses=2,
        skipped_qualified=3, missed_r=2.4, avg_quality=6.7,
        calibration=[{"band": "7-8", "n": 5, "win_rate": 0.6}],
        focuses=["You skipped 3 high-confluence setups (-2.4R of missed practice)."],
        reason="daily_stop"))
    data = journal.fetch_all()
    assert len(data["session_reviews"]) == 1
    s = data["session_reviews"][0]
    assert s["skipped_qualified"] == 3
    assert s["reason"] == "daily_stop"
    assert s["focuses"][0].startswith("You skipped 3")
    assert s["calibration"][0]["band"] == "7-8"


def test_calibration_buckets_deterministic(db: Path) -> None:
    # 12 trades all stated at confidence 7 (band 7-8): 7 winners, 5 losers
    for _ in range(7):
        journal.add_trade(_trade(confidence=7, r=2.0))
    for _ in range(5):
        journal.add_trade(_trade(confidence=7, r=-1.0, correct=False))
    calib = journal.fetch_all()["calibration"]
    assert calib["available"] is True       # n>=10
    assert calib["provisional"] is True      # n<30
    assert calib["n"] == 12
    band = next(b for b in calib["buckets"] if b["band"] == "7-8")
    assert band["n"] == 12
    assert band["won"] == 7
    assert band["win_rate"] == round(7 / 12, 4)
    assert band["expected"] == 0.7
    # stated ~70% but won ~58% → slightly overconfident
    assert band["verdict"] == "slightly overconfident"
    # empty bands are present but inert
    empty = next(b for b in calib["buckets"] if b["band"] == "1-3")
    assert empty["n"] == 0 and empty["win_rate"] is None


def test_calibration_hidden_under_10(db: Path) -> None:
    for _ in range(4):
        journal.add_trade(_trade(confidence=9, r=1.0))
    calib = journal.fetch_all()["calibration"]
    assert calib["available"] is False
    assert calib["n"] == 4


# --- discipline layer ---------------------------------------------------------
def test_discipline_trade_fields_roundtrip(db: Path) -> None:
    tid = journal.add_trade(PaperTradeIn(
        symbol="MNQ", strategy="ORB", direction="long", regime="trending",
        r_multiple=1.0, exit_reason="target",
        was_post_tilt=True, was_revenge_override=True, pre_emotional_state="Frustrated"))
    journal.set_trade_feeling(tid, "bad")  # optional micro check-in (idempotent)
    journal.set_trade_feeling(tid, "bad")
    t = journal.fetch_all()["trades"][0]
    assert t["was_post_tilt"] == 1
    assert t["was_revenge_override"] == 1
    assert t["pre_emotional_state"] == "Frustrated"
    assert t["post_trade_feeling"] == "bad"


def test_cooldown_event_roundtrip(db: Path) -> None:
    journal.add_cooldown_event(journal.CooldownEventIn(type="tilt", length_min=5, ended_early=False))
    journal.add_cooldown_event(journal.CooldownEventIn(type="max_loss", length_min=0))
    ce = journal.fetch_all()["cooldown_events"]
    assert len(ce) == 2
    assert {e["type"] for e in ce} == {"tilt", "max_loss"}
    tilt = next(e for e in ce if e["type"] == "tilt")
    assert tilt["ended_early"] == 0 and tilt["length_min"] == 5


def test_emotion_correlation_sample_gate(db: Path) -> None:
    for _ in range(6):  # below the 10-per-bucket gate → not shown
        journal.add_trade(PaperTradeIn(strategy="ORB", r_multiple=1.0, exit_reason="target", pre_emotional_state="Focused"))
    assert journal.fetch_all()["emotion_correlation"]["available"] is False
    for _ in range(4):  # 6 wins + 4 losses = 10 → bucket now shown
        journal.add_trade(PaperTradeIn(strategy="ORB", r_multiple=-1.0, exit_reason="stop", pre_emotional_state="Focused"))
    c = journal.fetch_all()["emotion_correlation"]
    assert c["available"] is True and c["provisional"] is True
    b = next(x for x in c["buckets"] if x["key"] == "Focused")
    assert b["n"] == 10 and b["shown"] is True and b["won"] == 6
    assert b["win_rate"] == 0.6


def test_decision_speed_buckets(db: Path) -> None:
    for _ in range(10):
        journal.add_trade(PaperTradeIn(strategy="ORB", r_multiple=1.0, exit_reason="target", decision_ms=3000))
    c = journal.fetch_all()["decision_speed"]
    fast = next(x for x in c["buckets"] if x["key"] == "<5s")
    assert fast["n"] == 10 and fast["shown"] is True
    slow = next(x for x in c["buckets"] if x["key"] == ">10s")
    assert slow["n"] == 0 and slow["shown"] is False
