export const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

export function fmt(v: number | null | undefined, d = 2): string {
  return typeof v === "number" && Number.isFinite(v) ? v.toFixed(d) : "n/a";
}

export function pct(v: number | null | undefined, d = 1): string {
  return typeof v === "number" && Number.isFinite(v) ? `${(v * 100).toFixed(d)}%` : "n/a";
}

export function pctRaw(v: number | null | undefined, d = 1): string {
  return typeof v === "number" && Number.isFinite(v) ? `${v.toFixed(d)}%` : "n/a";
}

export function signColor(v: number | null | undefined): string {
  if (typeof v !== "number") return "text-muted";
  return v > 0 ? "text-profit" : v < 0 ? "text-loss" : "text-muted";
}

export const REGIME_LABEL: Record<string, string> = {
  trending: "Trending",
  ranging: "Ranging",
  high_vol: "High Volatility",
  low_vol: "Low Volatility",
};

export const REGIME_COLOR: Record<string, string> = {
  trending: "#00E676",
  ranging: "#FFD600",
  high_vol: "#FF1744",
  low_vol: "#8A93A8",
};

export const FACTOR_LABEL: Record<string, string> = {
  base: "Base setup",
  structure: "Structure",
  timing: "Timing / killzone",
  pa: "Price action",
};
