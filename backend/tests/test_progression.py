"""Deterministic tests for the progression/engagement engine: XP weighting +
anti-farming, tiers, streak break rules, badges, daily-challenge determinism,
and the regime matrix sample gate. No randomness beyond the date-seeded picks
(asserted stable), no network."""
from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest

from backend import journal, progression


@pytest.fixture()
def db(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[Path]:
    p = tmp_path / "journal.db"
    monkeypatch.setattr(journal, "DB_PATH", p)
    journal.clear()
    progression.clear()
    yield p


def _trade(**kw: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "id": 1, "created_at": "2026-06-24 12:00:00", "strategy": "ORB", "regime": "trending",
        "r_multiple": 1.0, "prediction_correct": None, "quality_total": 7.0, "quality_risk": 10.0,
        "quality_setup": 8.0, "mistakes": "",
    }
    base.update(kw)
    return base


def _data(**kw: Any) -> dict[str, Any]:
    d: dict[str, Any] = {
        "trades": [], "missed_setups": [], "session_reviews": [],
        "calibration": {"available": False, "provisional": True, "n": 0, "buckets": []},
        "stats": {"n": 0, "streaks": {"best_win": 0, "current": 0, "best_loss": 0}},
    }
    d.update(kw)
    return d


def test_xp_weights_process_over_wins_and_penalises_antipatterns() -> None:
    data = _data(
        trades=[
            _trade(id=1, r_multiple=2.0, prediction_correct=1, quality_total=8.0, quality_risk=10.0, mistakes=""),
            _trade(id=2, r_multiple=-1.0, prediction_correct=0, quality_total=4.0, quality_risk=3.0, mistakes="moved stop,off-plan"),
        ],
        missed_setups=[{"id": 1}],
        session_reviews=[{"reason": "manual"}, {"reason": "daily_stop"}],
    )
    ledger = progression.xp_ledger(data)
    by = {r["event"]: r for r in ledger}
    assert by["Took a qualified setup"]["xp"] == 20            # 2 * 10
    assert by["Honored the stop"]["xp"] == 5                   # only trade 1 (trade 2 moved stop)
    assert by["Correct pre-setup prediction"]["xp"] == 8
    assert by["Winning trade"]["xp"] == 3                      # small vs process
    assert by["Trade-quality points"]["xp"] == 12             # round(8+4)
    assert by["Completed session review"]["xp"] == 30
    assert by["Oversized past risk %"]["xp"] == -8
    assert by["Skipped a qualified setup"]["xp"] == -4
    assert by["Off-plan (ignored regime/plan)"]["xp"] == -5
    assert by["Hit max daily loss"]["xp"] == -15
    assert progression.xp_total(ledger) == 46
    # process can't be out-earned by gambling: a win is worth far less than process
    assert by["Winning trade"]["xp_each"] < by["Took a qualified setup"]["xp_each"]


def test_discipline_xp_cooldown_clean_stop_override() -> None:
    data = _data(
        trades=[_trade(id=1, r_multiple=-1.0, was_revenge_override=1)],
        cooldown_events=[
            {"type": "tilt", "ended_early": 0},   # completed → earns XP
            {"type": "tilt", "ended_early": 1},   # ended early → no XP
            {"type": "max_loss"},                 # clean daily stop → earns XP
        ],
    )
    by = {r["event"]: r for r in progression.xp_ledger(data)}
    assert by["Took a suggested cooldown"]["count"] == 1
    assert by["Took a suggested cooldown"]["xp"] == progression.XP_TILT_COOLDOWN_TAKEN
    assert by["Stopped cleanly at daily limit"]["xp"] == progression.XP_CLEAN_DAILY_STOP
    assert by["Revenge override (forced post-tilt entry)"]["xp"] == progression.XP_REVENGE_OVERRIDE


def test_streak_breaks_on_revenge_override() -> None:
    # a day that otherwise qualifies is broken by a revenge override that day
    s = progression.streak(_data(
        session_reviews=[_review("2026-06-24")],
        trades=[_trade(id=1, created_at="2026-06-24 12:00:00", was_revenge_override=1)],
    ))
    assert s["current"] == 0


def test_iron_discipline_reframed_to_overrides(db: Path) -> None:
    reviews = [{"reason": "manual"} for _ in range(4)] + [{"reason": "daily_stop"}]
    # 5 sessions incl. a CLEAN daily stop, no overrides → still unlocked (D)
    clean = _data(trades=[_trade(id=i) for i in range(3)], session_reviews=reviews,
                  stats={"n": 3, "streaks": {"best_win": 0, "current": 0, "best_loss": 0}})
    assert {b["id"]: b for b in progression.badges(clean)}["iron_discipline"]["unlocked"] is True
    # a revenge override breaks it
    broken = _data(trades=[_trade(id=1, was_revenge_override=1)], session_reviews=reviews,
                   stats={"n": 1, "streaks": {"best_win": 0, "current": 0, "best_loss": 0}})
    assert {b["id"]: b for b in progression.badges(broken)}["iron_discipline"]["unlocked"] is False


def test_tiers() -> None:
    assert progression.tier_for(0)["tier"] == "Novice"
    assert progression.tier_for(199)["tier"] == "Novice"
    assert progression.tier_for(200)["tier"] == "Apprentice"
    assert progression.tier_for(600)["tier"] == "Journeyman"
    top = progression.tier_for(2000)
    assert top["tier"] == "Master" and top["to_next"] is None and top["pct"] == 100
    mid = progression.tier_for(400)
    assert mid["floor"] == 200 and mid["ceil"] == 600 and mid["into_tier"] == 200 and mid["to_next"] == 200


def _review(day: str, **kw: Any) -> dict[str, Any]:
    base: dict[str, Any] = {"created_at": f"{day} 20:00:00", "taken": 2, "skipped_qualified": 0,
                            "avg_quality": 7.0, "reason": "manual"}
    base.update(kw)
    return base


def test_streak_counts_and_breaks() -> None:
    s = progression.streak(_data(session_reviews=[_review("2026-06-22"), _review("2026-06-23"), _review("2026-06-24")]))
    assert s == {"current": 3, "best": 3, "last_active_date": "2026-06-24"}

    # daily-stop day breaks the run
    s2 = progression.streak(_data(session_reviews=[
        _review("2026-06-20"), _review("2026-06-21", reason="daily_stop"),
        _review("2026-06-22"), _review("2026-06-23"), _review("2026-06-24")]))
    assert s2["current"] == 3 and s2["best"] == 3

    # skipped-qualified >=3 or poor quality also break the day
    assert progression.streak(_data(session_reviews=[_review("2026-06-24", skipped_qualified=3)]))["current"] == 0
    assert progression.streak(_data(session_reviews=[_review("2026-06-24", avg_quality=3.0)]))["current"] == 0
    # a day with no taken setups doesn't count
    assert progression.streak(_data(session_reviews=[_review("2026-06-24", taken=0)]))["current"] == 0


def test_badges_predicates_progress_and_unlocked_at(db: Path) -> None:
    trades = [_trade(id=i, quality_risk=10.0, mistakes="") for i in range(10)]
    data = _data(
        trades=trades,
        stats={"n": 100, "streaks": {"best_win": 10, "current": 0, "best_loss": 0}},
        session_reviews=[{"reason": "manual"} for _ in range(5)],
    )
    bs = {b["id"]: b for b in progression.badges(data)}
    assert bs["first_100"]["unlocked"] is True
    assert bs["win_streak_10"]["unlocked"] is True
    assert bs["perfect_risk"]["unlocked"] is True            # 10 clean-risk trades
    assert bs["iron_discipline"]["unlocked"] is True         # 5 clean sessions
    assert bs["calibrated"]["unlocked"] is False             # no calibration data
    # locked badge shows real progress, not fabricated
    assert bs["calibrated"]["progress"] == 0 and bs["calibrated"]["target"] == 30
    # unlockedAt persisted + stable across re-evaluation
    first_at = bs["first_100"]["unlocked_at"]
    assert isinstance(first_at, str) and first_at
    again = {b["id"]: b for b in progression.badges(data)}
    assert again["first_100"]["unlocked_at"] == first_at
    assert again["calibrated"]["unlocked_at"] is None


def test_regime_matrix_sample_gate() -> None:
    trades = [_trade(id=i, strategy="FVG_RETEST", regime="trending", r_multiple=0.3) for i in range(100)]
    trades += [_trade(id=900 + i, strategy="FVG_RETEST", regime="ranging", r_multiple=-0.2) for i in range(5)]
    m = progression.regime_matrix(_data(trades=trades))
    cell_tr = m["cells"]["FVG_RETEST"]["trending"]
    cell_rg = m["cells"]["FVG_RETEST"]["ranging"]
    assert cell_tr["n"] == 100 and cell_tr["sufficient"] is True and cell_tr["expectancy_r"] == 0.3
    assert cell_rg["n"] == 5 and cell_rg["sufficient"] is False  # below the 100 gate
    assert m["min_sample"] == 100


def test_daily_challenges_deterministic(db: Path) -> None:
    data = _data()
    a = progression.daily_challenges(data, day="2026-06-24")
    b = progression.daily_challenges(data, day="2026-06-24")
    assert [c["id"] for c in a["challenges"]] == [c["id"] for c in b["challenges"]]  # stable across reloads
    assert len(a["challenges"]) == 3
    # a different day yields a (deterministic) different-or-same set, but still 3
    assert len(progression.daily_challenges(data, day="2026-06-25")["challenges"]) == 3


def test_completed_challenge_xp_credited_once_and_idempotent(db: Path) -> None:
    day = "2026-06-24"
    # One clean trade for every strategy x regime, so whichever 3 challenges the
    # day-seed picks, all of them complete (quality >= 7, stops honored, conf ok).
    trades = []
    i = 0
    for strat in progression._STRATS:
        for rg in progression._REGIMES:
            i += 1
            trades.append(_trade(id=i, created_at=f"{day} 12:00:00", strategy=strat,
                                 regime=rg, quality_total=8.0, quality_setup=8.0, mistakes=""))
    data = _data(trades=trades)

    # mark the day's challenges complete (persists to daily_challenge_state)
    res = progression.daily_challenges(data, day=day)
    assert res["completed"] == 3
    assert progression._completed_challenge_total() == 3

    # completing a challenge adds its XP — exactly once, at the model value
    base = progression.xp_total(progression.xp_ledger(data))
    credited = progression.xp_total(progression.xp_ledger(data, progression._completed_challenge_total()))
    assert credited - base == 3 * progression.XP_CHALLENGE_COMPLETE

    # reload / re-mark complete must NOT re-grant (idempotent + stable)
    progression.daily_challenges(data, day=day)
    progression.daily_challenges(data, day=day)
    assert progression._completed_challenge_total() == 3
    again = progression.xp_total(progression.xp_ledger(data, progression._completed_challenge_total()))
    assert again == credited


def test_challenge_progress_pure() -> None:
    today = [
        {"strategy": "FVG_RETEST", "regime": "ranging", "quality_total": 8.0, "quality_setup": 8.0, "mistakes": ""},
        {"strategy": "FVG_RETEST", "regime": "ranging", "quality_total": 9.0, "quality_setup": 7.0, "mistakes": ""},
    ]
    p, done = progression._challenge_progress({"kind": "take_strategy", "arg": "FVG_RETEST", "target": 3}, today)
    assert (p, done) == (2, False)
    p, done = progression._challenge_progress({"kind": "trades_in_regime", "arg": "ranging", "target": 2}, today)
    assert (p, done) == (2, True)
    p, done = progression._challenge_progress({"kind": "honor_stops", "arg": "", "target": 1}, today)
    assert done is True
    bad = today + [{"strategy": "ORB", "regime": "trending", "quality_total": 3.0, "quality_setup": 4.0, "mistakes": "moved stop"}]
    _, done = progression._challenge_progress({"kind": "honor_stops", "arg": "", "target": 1}, bad)
    assert done is False
    _, done = progression._challenge_progress({"kind": "avoid_low_conf", "arg": "", "target": 1}, bad)
    assert done is False  # the ORB trade had setup score 4 (<6 => conf <60%)
