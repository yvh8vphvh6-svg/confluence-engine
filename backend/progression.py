"""Progression + engagement layer — XP, tiers, streaks, badges, daily challenges
and a per-regime expectancy matrix.

EVERYTHING here is DERIVED deterministically from the records the learning phase
already stores (paper_trades, missed_setups, session_reviews) — this module adds
no new per-event tracking. Because the source rows are immutable, the derived XP
ledger / tier / streak / regime matrix are themselves stable and auditable; the
only state we persist is (a) badge unlock timestamps (so "unlockedAt" + the
unlock toast are stable) and (b) the day's challenge completion flags (so a
challenge's XP is awarded once). Both tables are created with CREATE TABLE IF NOT
EXISTS and any column add goes through journal.ensure_columns (idempotent).
"""
from __future__ import annotations

import json
import random
import sqlite3
from collections import defaultdict
from datetime import UTC, date, datetime
from typing import Any

from . import journal

# --------------------------------------------------------------------------- #
# XP MODEL — one place, documented. Weighted toward GOOD PROCESS, not wins, so
# it can't be farmed by gambling. Positive rules reward disciplined behaviour;
# negative rules punish the exact anti-patterns the app teaches against.
# --------------------------------------------------------------------------- #
XP_TOOK_QUALIFIED = 10      # took a qualified (engine-flagged) setup — shows up to trade
XP_STOP_HONORED = 5         # did NOT move the stop (no "moved stop" mistake tag)
XP_PREDICTION_CORRECT = 8   # pre-setup read matched the engine's direction
XP_WIN_BONUS = 3            # small win bonus — deliberately minor vs process points
XP_QUALITY_PER_POINT = 1    # + trade-quality score (0..10) → process beats outcome
XP_SESSION_REVIEW = 15      # completed a session review (reflection)
XP_CALIBRATED_BONUS = 20    # aggregate: confidence is well-calibrated (>=30 graded)
XP_CHALLENGE_COMPLETE = 25  # completed a daily challenge

XP_TILT_COOLDOWN_TAKEN = 8  # took (and completed) a suggested tilt cooldown — discipline
XP_CLEAN_DAILY_STOP = 12    # hit the daily limit and stopped cleanly (the rule that protects accounts)
XP_PATTERN_DRILL = 5        # correctly matched a pattern drill (per distinct scenario, once)
XP_DUEL_WIN = 6             # won a head-to-head duel (per distinct scenario, once)

XP_OVERSIZED = -8           # sized past the configured risk % (quality.risk < 6)
XP_SKIPPED_QUALIFIED = -4   # skipped a qualified setup (logged missed practice)
XP_OFF_PLAN = -5            # "off-plan" mistake — ignored the plan / regime filter
XP_TILT = -3                # revenge / FOMO / traded-news mistake
XP_DAILY_STOP_BREACH = -15  # hit max daily loss (session review reason=daily_stop) — the loss itself
XP_REVENGE_OVERRIDE = -10   # overrode a tilt cooldown to force a post-tilt entry (anti-pattern)

_TILT_TAGS = {"revenge", "FOMO", "traded news"}

# tiers with rising thresholds (total XP floor)
TIERS: list[tuple[str, int]] = [
    ("Novice", 0),
    ("Apprentice", 200),
    ("Journeyman", 600),
    ("Master", 1500),
]


def _pconn() -> sqlite3.Connection:
    conn = sqlite3.connect(str(journal.DB_PATH), timeout=5)
    conn.row_factory = sqlite3.Row
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS badge_unlocks (
            id TEXT PRIMARY KEY,
            unlocked_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS daily_challenge_state (
            day TEXT PRIMARY KEY,
            completed TEXT NOT NULL
        );
        """
    )
    return conn


def _day(created_at: str | None) -> str:
    return (created_at or "")[:10]


def _has(mistakes: str | None, tag: str) -> bool:
    return tag in {m.strip() for m in (mistakes or "").split(",")}


# --------------------------------------------------------------------------- #
# XP LEDGER + TIERS
# --------------------------------------------------------------------------- #
def xp_ledger(data: dict[str, Any], completed_challenges: int = 0,
              pattern_drills_correct: int = 0, duel_wins: int = 0) -> list[dict[str, Any]]:
    """Grouped, auditable ledger: one row per rule with count + xp_each + xp.

    `completed_challenges` is the deduped (day, challenge-id) completion count
    from daily_challenge_state (see _completed_challenge_total); `pattern_drills_correct`
    is the count of distinct pattern-drill scenarios answered correctly. Both are
    passed by the caller so each is credited once and the ledger stays a pure
    function of its inputs for tests (default 0)."""
    trades: list[dict[str, Any]] = data["trades"]
    missed: list[dict[str, Any]] = data["missed_setups"]
    reviews: list[dict[str, Any]] = data["session_reviews"]
    calib: dict[str, Any] = data["calibration"]
    cooldowns: list[dict[str, Any]] = data.get("cooldown_events", [])

    rows: list[dict[str, Any]] = []

    def add(event: str, count: int, xp_each: int) -> None:
        if count:
            rows.append({"event": event, "count": count, "xp_each": xp_each, "xp": count * xp_each})

    qualified = [t for t in trades if (t.get("strategy") or "Manual") != "Manual"]
    add("Took a qualified setup", len(qualified), XP_TOOK_QUALIFIED)
    add("Honored the stop", sum(1 for t in trades if not _has(t.get("mistakes"), "moved stop")), XP_STOP_HONORED)
    add("Correct pre-setup prediction", sum(1 for t in trades if t.get("prediction_correct") == 1), XP_PREDICTION_CORRECT)
    add("Winning trade", sum(1 for t in trades if (t.get("r_multiple") or 0) > 0), XP_WIN_BONUS)
    quality_pts = int(round(sum(float(t.get("quality_total") or 0) for t in trades)))
    add("Trade-quality points", quality_pts, XP_QUALITY_PER_POINT)
    add("Completed session review", len(reviews), XP_SESSION_REVIEW)
    # daily-challenge completions live in daily_challenge_state, deduped per
    # (day, challenge-id), so each is credited exactly once and can never be
    # double-summed (there is no second crediting path).
    add("Completed a daily challenge", completed_challenges, XP_CHALLENGE_COMPLETE)

    if calib.get("available") and calib.get("n", 0) >= 30:
        active = [b for b in calib.get("buckets", []) if b.get("n")]
        if active and all(abs(b["expected"] - (b["win_rate"] or 0)) <= 0.10 for b in active):
            add("Well-calibrated confidence", 1, XP_CALIBRATED_BONUS)

    # discipline rewards (derived from the cooldown_events log; each row counts once)
    tilt_taken = sum(1 for e in cooldowns if e.get("type") == "tilt" and e.get("ended_early") != 1)
    add("Took a suggested cooldown", tilt_taken, XP_TILT_COOLDOWN_TAKEN)
    clean_stops = sum(1 for e in cooldowns if e.get("type") == "max_loss")
    add("Stopped cleanly at daily limit", clean_stops, XP_CLEAN_DAILY_STOP)
    add("Pattern drill correct", pattern_drills_correct, XP_PATTERN_DRILL)
    add("Duel won", duel_wins, XP_DUEL_WIN)

    # anti-farming / penalties
    add("Oversized past risk %", sum(1 for t in trades if (t.get("quality_risk") is not None and t["quality_risk"] < 6)), XP_OVERSIZED)
    add("Skipped a qualified setup", len(missed), XP_SKIPPED_QUALIFIED)
    add("Off-plan (ignored regime/plan)", sum(1 for t in trades if _has(t.get("mistakes"), "off-plan")), XP_OFF_PLAN)
    add("Tilt (revenge / FOMO / news)", sum(1 for t in trades if any(_has(t.get("mistakes"), tag) for tag in _TILT_TAGS)), XP_TILT)
    add("Hit max daily loss", sum(1 for r in reviews if r.get("reason") == "daily_stop"), XP_DAILY_STOP_BREACH)
    add("Revenge override (forced post-tilt entry)", sum(1 for t in trades if t.get("was_revenge_override") == 1), XP_REVENGE_OVERRIDE)

    return rows


def xp_total(ledger: list[dict[str, Any]]) -> int:
    return sum(r["xp"] for r in ledger)


def tier_for(total: int) -> dict[str, Any]:
    floor_total = max(0, total)
    idx = 0
    for i, (_, threshold) in enumerate(TIERS):
        if floor_total >= threshold:
            idx = i
    name, floor = TIERS[idx]
    ceil = TIERS[idx + 1][1] if idx + 1 < len(TIERS) else None
    into = floor_total - floor
    to_next = None if ceil is None else max(0, ceil - floor_total)
    span = None if ceil is None else (ceil - floor)
    pct = 100 if span is None else round(into / span * 100, 1)
    return {
        "tier": name, "index": idx, "count": len(TIERS),
        "total": total, "floor": floor, "ceil": ceil,
        "into_tier": into, "to_next": to_next, "next_tier": (TIERS[idx + 1][0] if ceil is not None else None),
        "pct": pct,
    }


# --------------------------------------------------------------------------- #
# STREAK — consecutive days that met a quality bar. Break rules are explicit.
# --------------------------------------------------------------------------- #
def streak(data: dict[str, Any]) -> dict[str, Any]:
    reviews: list[dict[str, Any]] = data["session_reviews"]
    by_day: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for r in reviews:
        d = _day(r.get("created_at"))
        if d:
            by_day[d].append(r)

    # a day with a revenge override (forced post-tilt entry) breaks the streak
    override_days: set[str] = set()
    for t in data.get("trades", []):
        if t.get("was_revenge_override") == 1:
            d = _day(t.get("created_at"))
            if d:
                override_days.add(d)

    def qualifies(day_reviews: list[dict[str, Any]]) -> bool:
        # GOOD day: took >=1 setup and met the quality bar.
        took = sum(rv.get("taken", 0) for rv in day_reviews)
        if took < 1:
            return False
        # BREAK conditions (any one fails the day):
        if any(rv.get("reason") == "daily_stop" for rv in day_reviews):
            return False  # hit max daily loss
        if sum(rv.get("skipped_qualified", 0) for rv in day_reviews) >= 3:
            return False  # skipped qualified setups repeatedly
        quals = [rv["avg_quality"] for rv in day_reviews if rv.get("avg_quality") is not None]
        if quals and (sum(quals) / len(quals)) < 4:
            return False  # poor process (oversizing drags quality down)
        return True

    good_days = sorted(d for d, rv in by_day.items() if qualifies(rv) and d not in override_days)
    if not good_days:
        return {"current": 0, "best": 0, "last_active_date": None}

    # best: longest run of consecutive calendar days
    best = run = 1
    for i in range(1, len(good_days)):
        prev = date.fromisoformat(good_days[i - 1])
        cur = date.fromisoformat(good_days[i])
        run = run + 1 if (cur - prev).days == 1 else 1
        best = max(best, run)
    # current: run ending at the most recent good day
    last = good_days[-1]
    current = 1
    cursor = date.fromisoformat(last)
    present = set(good_days)
    while True:
        prev = cursor.fromordinal(cursor.toordinal() - 1)
        if prev.isoformat() in present:
            current += 1
            cursor = prev
        else:
            break
    return {"current": current, "best": best, "last_active_date": last}


# --------------------------------------------------------------------------- #
# BADGES — registry + predicate evaluation against real stored stats.
# --------------------------------------------------------------------------- #
def _regime_overall(trades: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    agg: dict[str, dict[str, float]] = defaultdict(lambda: {"n": 0.0, "sum_r": 0.0})
    for t in trades:
        rg = t.get("regime") or "?"
        agg[rg]["n"] += 1
        agg[rg]["sum_r"] += t.get("r_multiple") or 0.0
    return {rg: {"n": int(v["n"]), "expectancy_r": (v["sum_r"] / v["n"]) if v["n"] else 0.0} for rg, v in agg.items()}


def badges(data: dict[str, Any]) -> list[dict[str, Any]]:
    trades: list[dict[str, Any]] = data["trades"]
    reviews: list[dict[str, Any]] = data["session_reviews"]
    stats: dict[str, Any] = data["stats"]
    calib: dict[str, Any] = data["calibration"]

    n = stats["n"]
    best_win = stats["streaks"]["best_win"]
    perfect_risk = sum(1 for t in trades if (t.get("quality_risk") is not None and t["quality_risk"] >= 9) and not _has(t.get("mistakes"), "moved stop"))
    regimes = _regime_overall(trades)
    REGIME_KEYS = ["trending", "ranging", "high_vol", "low_vol"]
    positive_regimes = sum(1 for rg in REGIME_KEYS if regimes.get(rg, {}).get("n", 0) >= 10 and regimes[rg]["expectancy_r"] > 0)
    calib_active = [b for b in calib.get("buckets", []) if b.get("n")]
    calibrated = bool(calib.get("available") and calib.get("n", 0) >= 30 and calib_active and all(abs(b["expected"] - (b["win_rate"] or 0)) <= 0.10 for b in calib_active))
    clean_sessions = len(reviews)
    # "breach" = forcing a post-tilt entry (revenge override). Hitting the daily
    # limit and STOPPING is disciplined, so a clean daily stop no longer disqualifies.
    no_breach = all(t.get("was_revenge_override") != 1 for t in trades)

    registry: list[dict[str, Any]] = [
        {"id": "first_100", "name": "Century", "icon": "💯", "description": "Log 100 paper trades.",
         "unlocked": n >= 100, "progress": min(n, 100), "target": 100, "progress_label": f"{min(n, 100)}/100 trades"},
        {"id": "win_streak_10", "name": "On Fire", "icon": "🔥", "description": "Hit a 10-trade win streak.",
         "unlocked": best_win >= 10, "progress": min(best_win, 10), "target": 10, "progress_label": f"{min(best_win, 10)}/10 win streak"},
        {"id": "perfect_risk", "name": "Perfect Risk", "icon": "🎯", "description": "10 trades all within risk % with stops honored.",
         "unlocked": perfect_risk >= 10, "progress": min(perfect_risk, 10), "target": 10, "progress_label": f"{min(perfect_risk, 10)}/10 clean-risk trades"},
        {"id": "regime_master", "name": "Regime Master", "icon": "🧭", "description": "Positive expectancy in all 4 regimes.",
         "unlocked": positive_regimes >= 4, "progress": positive_regimes, "target": 4, "progress_label": f"{positive_regimes}/4 regimes positive"},
        {"id": "calibrated", "name": "Calibrated", "icon": "⚖️", "description": "Stated confidence within 10% of actual over 30+ trades.",
         "unlocked": calibrated, "progress": min(calib.get("n", 0), 30), "target": 30, "progress_label": f"{min(calib.get('n', 0), 30)}/30 graded trades"},
        {"id": "iron_discipline", "name": "Iron Discipline", "icon": "🛡️", "description": "5 sessions with no revenge-trade override.",
         "unlocked": (clean_sessions >= 5 and no_breach), "progress": min(clean_sessions, 5), "target": 5, "progress_label": f"{min(clean_sessions, 5)}/5 clean sessions"},
    ]

    # persist unlock timestamps (stable unlockedAt + new-unlock detection)
    with _pconn() as c:
        known = {r["id"]: r["unlocked_at"] for r in c.execute("SELECT id, unlocked_at FROM badge_unlocks").fetchall()}
        now = datetime.now(tz=UTC).isoformat(timespec="seconds")
        for b in registry:
            if b["unlocked"] and b["id"] not in known:
                c.execute("INSERT OR IGNORE INTO badge_unlocks (id, unlocked_at) VALUES (?,?)", (b["id"], now))
                known[b["id"]] = now
        c.commit()
        for b in registry:
            b["unlocked_at"] = known.get(b["id"]) if b["unlocked"] else None
    return registry


# --------------------------------------------------------------------------- #
# DAILY CHALLENGES — 3 picked from a date-seeded deterministic shuffle, with
# progress derived from TODAY's trades. Completion is persisted once/day.
# --------------------------------------------------------------------------- #
_STRATS = ["FVG_RETEST", "OB_RETEST", "ORB", "VWAP_REVERSION", "BOS_CONTINUATION"]
_REGIMES = ["trending", "ranging", "high_vol", "low_vol"]


def _challenge_templates() -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for s in _STRATS:
        out.append({"id": f"take_{s}", "kind": "take_strategy", "arg": s, "target": 3,
                    "text": f"Take 3 {s.replace('_', ' ').title()} setups"})
    for rg in _REGIMES:
        out.append({"id": f"regime_{rg}", "kind": "trades_in_regime", "arg": rg, "target": 3,
                    "text": f"Complete 3 trades in {rg.replace('_', ' ').title()} regime"})
    out.append({"id": "avoid_low_conf", "kind": "avoid_low_conf", "arg": "", "target": 1,
                "text": "Avoid any setup with confluence < 60%"})
    out.append({"id": "honor_stops", "kind": "honor_stops", "arg": "", "target": 1,
                "text": "Honor every stop today (don't move it)"})
    out.append({"id": "quality_bar", "kind": "quality_bar", "arg": "", "target": 3,
                "text": "Take 3 trades at quality >= 7"})
    return out


def _today_iso() -> str:
    return datetime.now(tz=UTC).date().isoformat()


def _challenge_progress(tpl: dict[str, Any], today_trades: list[dict[str, Any]]) -> tuple[int, bool]:
    kind, arg, target = tpl["kind"], tpl["arg"], tpl["target"]
    if kind == "take_strategy":
        n = sum(1 for t in today_trades if t.get("strategy") == arg)
        return min(n, target), n >= target
    if kind == "trades_in_regime":
        n = sum(1 for t in today_trades if t.get("regime") == arg)
        return min(n, target), n >= target
    if kind == "quality_bar":
        n = sum(1 for t in today_trades if (t.get("quality_total") or 0) >= 7)
        return min(n, target), n >= target
    if kind == "avoid_low_conf":
        # pass if you took >=1 trade and none were low-confluence (setup score < 6 => conf < 60%)
        if not today_trades:
            return 0, False
        clean = all((t.get("quality_setup") or 10) >= 6 for t in today_trades)
        return (1 if clean else 0), clean
    if kind == "honor_stops":
        if not today_trades:
            return 0, False
        honored = all(not _has(t.get("mistakes"), "moved stop") for t in today_trades)
        return (1 if honored else 0), honored
    return 0, False


def daily_challenges(data: dict[str, Any], day: str | None = None) -> dict[str, Any]:
    day = day or _today_iso()
    seed = int(day.replace("-", ""))
    pool = _challenge_templates()
    rng = random.Random(seed)
    picks = rng.sample(pool, 3)  # deterministic for the day

    today_trades = [t for t in data["trades"] if _day(t.get("created_at")) == day]
    challenges: list[dict[str, Any]] = []
    for tpl in picks:
        progress, complete = _challenge_progress(tpl, today_trades)
        challenges.append({
            "id": tpl["id"], "text": tpl["text"], "target": tpl["target"],
            "progress": progress, "complete": complete, "xp": XP_CHALLENGE_COMPLETE,
        })

    # persist the day's completed ids (so the XP is awarded once / stable)
    completed_ids = sorted(c["id"] for c in challenges if c["complete"])
    with _pconn() as pc:
        pc.execute(
            "INSERT INTO daily_challenge_state (day, completed) VALUES (?,?) "
            "ON CONFLICT(day) DO UPDATE SET completed=excluded.completed",
            (day, json.dumps(completed_ids)))
        pc.commit()
    return {"day": day, "challenges": challenges, "completed": len(completed_ids)}


def _completed_challenge_total() -> int:
    """Total daily-challenge completions persisted in daily_challenge_state,
    counted once per (day, challenge-id). The per-day `completed` value is a
    deduped, sorted list of ids, so summing their lengths credits each completed
    challenge exactly once — stable and idempotent across repeated reads. Because
    XP is derived-on-read, this automatically reconciles challenges completed
    before crediting existed: no backfill, migration, or new column required."""
    with _pconn() as c:
        rows = c.execute("SELECT completed FROM daily_challenge_state").fetchall()
    total = 0
    for r in rows:
        try:
            ids = json.loads(r["completed"] or "[]")
        except (TypeError, ValueError):  # tolerate a corrupt row rather than crash the ledger
            continue
        if isinstance(ids, list):
            total += len(ids)
    return total


# --------------------------------------------------------------------------- #
# REGIME AWARENESS — per-strategy expectancy x regime, gated at n>=100/cell.
# --------------------------------------------------------------------------- #
MIN_CELL_SAMPLE = 100  # project-wide promotion minimum


def regime_matrix(data: dict[str, Any]) -> dict[str, Any]:
    trades: list[dict[str, Any]] = data["trades"]
    cells: dict[str, dict[str, dict[str, float]]] = defaultdict(lambda: defaultdict(lambda: {"n": 0.0, "sum_r": 0.0}))
    strategies: set[str] = set()
    for t in trades:
        strat = t.get("strategy") or "?"
        rg = t.get("regime") or "?"
        if strat == "Manual":
            continue
        strategies.add(strat)
        cells[strat][rg]["n"] += 1
        cells[strat][rg]["sum_r"] += t.get("r_multiple") or 0.0
    out: dict[str, dict[str, Any]] = {}
    for strat in sorted(strategies):
        out[strat] = {}
        for rg in _REGIMES:
            cell = cells[strat].get(rg)
            n = int(cell["n"]) if cell else 0
            sufficient = n >= MIN_CELL_SAMPLE
            out[strat][rg] = {
                "n": n,
                "expectancy_r": round(cell["sum_r"] / n, 4) if (cell and n) else None,
                "sufficient": sufficient,
            }
    return {"regimes": _REGIMES, "strategies": sorted(strategies), "cells": out, "min_sample": MIN_CELL_SAMPLE}


def summary(day: str | None = None) -> dict[str, Any]:
    """The full progression payload, derived from the journal records."""
    from . import social, translation
    data = journal.fetch_all()
    # recompute + persist today's challenge completions BEFORE building the
    # ledger, so a just-completed challenge is reflected in the same response.
    challenges = daily_challenges(data, day)
    ledger = xp_ledger(data, _completed_challenge_total(), translation.pattern_drill_correct_count(),
                       social.duel_wins_count())
    total = xp_total(ledger)
    return {
        "xp": {"total": total, "ledger": ledger, "tier": tier_for(total)},
        "streak": streak(data),
        "badges": badges(data),
        "challenges": challenges,
        "regime_matrix": regime_matrix(data),
    }


def clear() -> None:
    with _pconn() as c:
        c.execute("DELETE FROM badge_unlocks")
        c.execute("DELETE FROM daily_challenge_state")
        c.commit()
