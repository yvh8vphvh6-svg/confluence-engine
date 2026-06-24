// Builds a session review from REAL session records — counters + the session's
// closed trades. No invented numbers; focuses are data-derived.
import type { PaperTrade, SessionStats } from "./store";

export type SessionReviewDraft = {
  started_at: string;
  ended_at: string;
  setups_seen: number;
  taken: number;
  wins: number;
  losses: number;
  skipped_qualified: number;
  missed_r: number;
  avg_quality: number | null;
  focuses: string[];
  reason: "manual" | "daily_stop";
};

export function buildSessionReview(
  session: SessionStats,
  sessionTrades: PaperTrade[],
  reason: "manual" | "daily_stop",
): SessionReviewDraft {
  const avgQuality = session.qualityCount > 0 ? Math.round((session.qualitySum / session.qualityCount) * 10) / 10 : null;
  const focuses: string[] = [];

  // 1) missed-practice cost from skipped qualified setups
  if (session.skippedQualified > 0 && session.missedR > 0) {
    focuses.push(
      `You skipped ${session.skippedQualified} qualified setup${session.skippedQualified === 1 ? "" : "s"} (−${session.missedR.toFixed(1)}R of missed practice).`,
    );
  }

  // 2) per-subscore dip — oversizing is the most common Risk leak
  const graded = sessionTrades.filter((t) => t.quality !== null);
  if (graded.length > 0) {
    const oversized = graded.filter((t) => (t.quality?.risk ?? 10) < 6).length;
    if (oversized > 0) {
      focuses.push(`Quality dipped on Risk — you oversized on ${oversized} of ${graded.length} trade${graded.length === 1 ? "" : "s"}.`);
    }
    const earlyExits = graded.filter((t) => (t.quality?.execution ?? 10) < 7).length;
    if (oversized === 0 && earlyExits > 0) {
      focuses.push(`Execution dipped — you exited early on ${earlyExits} of ${graded.length} trade${graded.length === 1 ? "" : "s"}.`);
    }
  }

  // 3) overall quality / fallback
  if (focuses.length < 3 && avgQuality !== null) {
    if (avgQuality < 6) {
      focuses.push(`Average trade quality ${avgQuality}/10 — slow down and take only cleaner setups.`);
    } else if (focuses.length === 0) {
      focuses.push(`Solid process: ${session.wins}W/${session.losses}L at avg quality ${avgQuality}/10. Keep it up.`);
    }
  }
  if (focuses.length === 0) {
    focuses.push(
      session.taken === 0
        ? "No trades taken — work on pulling the trigger on qualified setups."
        : "Trades are open or unscored — close them to complete the review.",
    );
  }

  return {
    started_at: String(session.startedAt),
    ended_at: String(Date.now()),
    setups_seen: session.setupsSeen,
    taken: session.taken,
    wins: session.wins,
    losses: session.losses,
    skipped_qualified: session.skippedQualified,
    missed_r: Number(session.missedR.toFixed(2)),
    avg_quality: avgQuality,
    focuses: focuses.slice(0, 3),
    reason,
  };
}
