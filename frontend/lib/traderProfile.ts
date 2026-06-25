// Derives a "Trader Profile" purely from the user's REAL stored practice data
// (journal trades/stats/sessions + decision drills). Never invents numbers — if
// there's no data, tiles read "—" and rank stays Rookie.
import type { DecisionStats, JournalData } from "./api";
import { pct, fmt, REGIME_LABEL } from "./format";

const RANKS = [
  { name: "Rookie", min: 0 },
  { name: "Apprentice", min: 10 },
  { name: "Operator", min: 25 },
  { name: "Tactician", min: 50 },
  { name: "Strategist", min: 100 },
  { name: "Elite", min: 200 },
] as const;

export type StatTile = { label: string; value: string; hint?: string };

export type TraderProfile = {
  hasData: boolean;
  rank: string;
  tierIndex: number;
  tierCount: number;
  nextRank: string | null;
  xpPct: number; // 0..100 toward next rank
  xpLabel: string;
  tiles: StatTile[];
};

function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

// current consecutive-day streak ending at the most recent active day
function computeDayStreak(dates: string[]): number {
  const days = new Set(dates.map((d) => d.slice(0, 10)).filter(Boolean));
  if (days.size === 0) return 0;
  const latest = [...days].sort().at(-1);
  if (!latest) return 0;
  let cursor = Date.parse(`${latest}T00:00:00Z`);
  let streak = 0;
  while (Number.isFinite(cursor) && days.has(dayKey(cursor))) {
    streak += 1;
    cursor -= 86_400_000;
  }
  return streak;
}

function bestRegime(journal: JournalData): string {
  const byRegime = new Map<string, { n: number; sumR: number }>();
  for (const t of journal.trades) {
    if (!t.regime) continue;
    const cur = byRegime.get(t.regime) ?? { n: 0, sumR: 0 };
    cur.n += 1;
    cur.sumR += t.r_multiple ?? 0;
    byRegime.set(t.regime, cur);
  }
  let best: { regime: string; avg: number } | null = null;
  for (const [regime, v] of byRegime) {
    const avg = v.sumR / v.n;
    if (!best || avg > best.avg) best = { regime, avg };
  }
  if (!best) return "—";
  return REGIME_LABEL[best.regime] ?? best.regime;
}

function disciplineGrade(journal: JournalData): string {
  const n = journal.stats.n;
  if (n === 0) return "—";
  const mistakes = Object.values(journal.stats.by_mistake).reduce((a, b) => a + b, 0);
  const rate = mistakes / n; // mistakes per trade
  if (rate === 0) return "A+";
  if (rate < 0.2) return "A";
  if (rate < 0.4) return "B";
  if (rate < 0.7) return "C";
  if (rate < 1.1) return "D";
  return "E";
}

export function computeTraderProfile(
  journal: JournalData | null,
  decisions: DecisionStats | null,
): TraderProfile {
  const n = journal?.stats.n ?? 0;
  const hasData = n > 0 || (decisions?.n ?? 0) > 0;

  // rank ladder by setups taken (real paper trades)
  let tierIndex = 0;
  for (let i = 0; i < RANKS.length; i += 1) {
    if (n >= RANKS[i].min) tierIndex = i;
  }
  const cur = RANKS[tierIndex];
  const next = RANKS[tierIndex + 1] ?? null;
  const xpPct = next ? Math.max(0, Math.min(100, ((n - cur.min) / (next.min - cur.min)) * 100)) : 100;
  const xpLabel = next ? `${n}/${next.min} setups → ${next.name}` : "max tier";

  const streak = journal
    ? computeDayStreak([
        ...journal.trades.map((t) => t.created_at),
        ...journal.sessions.map((s) => s.created_at),
      ])
    : 0;

  // sharpest pre-session state by win rate (only when a bucket clears the gate)
  const bestState =
    journal && journal.emotion_correlation.available
      ? journal.emotion_correlation.buckets
          .filter((b) => b.shown)
          .slice()
          .sort((a, b) => (b.win_rate ?? 0) - (a.win_rate ?? 0))[0]?.key ?? "—"
      : "—";

  const tiles: StatTile[] = [
    { label: "Setups taken", value: String(n) },
    { label: "Win rate", value: journal && n > 0 ? pct(journal.stats.win_rate) : "—" },
    { label: "Expectancy", value: journal && n > 0 ? `${fmt(journal.stats.expectancy_r)} R` : "—" },
    { label: "Day streak", value: streak > 0 ? `${streak}d` : "—" },
    { label: "Best regime", value: journal ? bestRegime(journal) : "—" },
    { label: "Discipline", value: journal ? disciplineGrade(journal) : "—" },
    { label: "Sharpest when", value: bestState },
  ];

  return {
    hasData,
    rank: cur.name,
    tierIndex,
    tierCount: RANKS.length,
    nextRank: next?.name ?? null,
    xpPct,
    xpLabel,
    tiles,
  };
}
