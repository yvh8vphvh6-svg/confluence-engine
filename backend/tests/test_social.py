"""Phase-F social layer: SocialDataSource / LocalSocialSource, leaderboard blend,
duels (idempotent XP), community challenge, mentor mode, success stories. All
deterministic and offline; the no-fake-stats rule is asserted (samples labeled)."""
from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest

from backend import journal, progression, social
from backend.journal import PaperTradeIn


@pytest.fixture()
def db(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[Path]:
    p = tmp_path / "journal.db"
    monkeypatch.setattr(journal, "DB_PATH", p)
    monkeypatch.setattr(social, "DB_PATH", p)
    journal.clear()
    social.clear()
    yield p


def _win(**kw: object) -> PaperTradeIn:
    base = {"strategy": "ORB", "direction": "long", "regime": "trending", "r_multiple": 1.0, "exit_reason": "target"}
    base.update(kw)
    return PaperTradeIn(**base)  # type: ignore[arg-type]


# --- interface + leaderboard (no fake stats) ---------------------------------
def test_leaderboard_blends_user_with_labeled_samples(db: Path) -> None:
    journal.add_trade(_win())
    lb = social.get_source().leaderboard()
    assert any(r["is_user"] for r in lb)  # the user's real row exists
    # every NON-user entry is clearly an example — never a real rival
    assert all(r["is_example"] for r in lb if not r["is_user"])
    assert all(not r["is_example"] for r in lb if r["is_user"])
    assert [r["rank"] for r in lb] == list(range(1, len(lb) + 1))  # ranked, contiguous


# --- duels (stubbed opponent, idempotent XP) ---------------------------------
def test_duel_opponent_is_labeled_and_deterministic() -> None:
    src = social.get_source()
    a = src.duel_opponent("MNQ:5m:1:100")
    b = src.duel_opponent("MNQ:5m:1:100")
    assert a == b and a["is_example"] is True and a["name"] == "PracticeBot"


def test_duel_scores_and_xp_is_idempotent(db: Path) -> None:
    d = social.new_duel()
    sym, tf, seed_s, idx_s = d["scenario"].split(":")
    correct = social._correct_direction(sym, tf, int(seed_s), int(idx_s))
    # confidence 10 beats any bot (bot max confidence is 9) when the read is right
    r = social.score_duel(social.DuelScoreIn(scenario=d["scenario"], direction=correct, confidence=10))
    assert r["winner"] == "user" and r["user"]["correct"] is True
    assert social.duel_wins_count() == 1
    # re-winning the same scenario does not grant XP twice (distinct scenarios)
    social.score_duel(social.DuelScoreIn(scenario=d["scenario"], direction=correct, confidence=10))
    assert social.duel_wins_count() == 1
    assert social.duel_history()["wins"] == 2  # history counts every duel


def test_duel_win_feeds_progression_ledger(db: Path) -> None:
    d = social.new_duel()
    sym, tf, seed_s, idx_s = d["scenario"].split(":")
    correct = social._correct_direction(sym, tf, int(seed_s), int(idx_s))
    social.score_duel(social.DuelScoreIn(scenario=d["scenario"], direction=correct, confidence=10))
    row = next(r for r in progression.xp_ledger(journal.fetch_all(), 0, 0, social.duel_wins_count())
               if r["event"] == "Duel won")
    assert row["count"] == 1 and row["xp"] == progression.XP_DUEL_WIN


# --- community challenge (real progress + labeled sample aggregate) -----------
def test_community_real_progress_with_sample_aggregate(db: Path) -> None:
    for _ in range(3):
        journal.add_trade(_win())
    cc = social.community_challenge(social.current_week())
    assert cc["user_raw"] == 3 and cc["target"] == social.WEEKLY_TARGET
    assert cc["community"]["is_sample"] is True  # aggregate clearly a sample


# --- mentor mode (labeled sample student, or self-review) --------------------
def test_mentor_sample_vs_self(db: Path) -> None:
    sample = social.get_source().mentor_student(False)
    assert sample["is_example"] is True and len(sample["trades"]) == len(social.SAMPLE_STUDENT_TRADES)
    journal.add_trade(_win())
    mine = social.get_source().mentor_student(True)
    assert mine["is_example"] is False and len(mine["trades"]) == 1
    fid = social.add_mentor_feedback(social.MentorFeedbackIn(student_ref="sample", per_trade={"0": "good entry"}, overall="solid process"))
    assert fid > 0


# --- success stories (real milestones + labeled examples) --------------------
def test_success_real_milestones_examples_labeled(db: Path) -> None:
    assert social.success_stories()["has_real"] is False  # nothing logged yet
    journal.add_trade(_win())
    s = social.success_stories()
    assert s["has_real"] is True and len(s["milestones"]) > 0
    assert s["examples"] and all(e["is_example"] for e in s["examples"])  # never real people


# --- strategy import logging --------------------------------------------------
def test_import_log_roundtrip(db: Path) -> None:
    social.log_import("Pasted Plan", "code")
    with social._conn() as c:
        n = c.execute("SELECT COUNT(*) AS n FROM imported_strategies").fetchone()["n"]
    assert n == 1
