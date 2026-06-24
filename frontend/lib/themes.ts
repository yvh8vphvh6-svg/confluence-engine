// Theme system: each theme sets the app's CSS custom properties (space-separated
// RGB channels so Tailwind's `rgb(var(--x) / <alpha>)` opacity modifiers work).
// Switching a theme writes these onto document.documentElement and persists.

export const THEME_VAR_KEYS = [
  "--bg",
  "--sur",
  "--sur2",
  "--ac",
  "--ac2",
  "--tx",
  "--mu",
  "--gl",
  "--bd",
] as const;

export type ThemeVarKey = (typeof THEME_VAR_KEYS)[number];
export type ThemeVars = Record<ThemeVarKey, string>;

export type Theme = {
  id: string;
  name: string;
  symbol: string;
  vibe: string;
  vars: ThemeVars;
};

export const THEMES: Theme[] = [
  {
    id: "terminal",
    name: "Terminal",
    symbol: "▮",
    vibe: "green-on-black ops",
    vars: {
      "--bg": "11 15 25",
      "--sur": "26 31 46",
      "--sur2": "32 40 58",
      "--ac": "0 230 118",
      "--ac2": "0 207 255",
      "--tx": "231 236 245",
      "--mu": "138 147 168",
      "--gl": "0 230 118",
      "--bd": "39 48 74",
    },
  },
  {
    id: "obsidian",
    name: "Obsidian",
    symbol: "◆",
    vibe: "calm violet focus",
    vars: {
      "--bg": "16 14 24",
      "--sur": "26 23 38",
      "--sur2": "34 30 50",
      "--ac": "124 58 237",
      "--ac2": "167 139 250",
      "--tx": "236 233 245",
      "--mu": "150 144 170",
      "--gl": "124 58 237",
      "--bd": "48 42 70",
    },
  },
  {
    id: "cyberpunk",
    name: "Cyberpunk",
    symbol: "⬡",
    vibe: "neon overload",
    vars: {
      "--bg": "18 14 20",
      "--sur": "30 22 32",
      "--sur2": "40 28 44",
      "--ac": "240 224 0",
      "--ac2": "255 0 170",
      "--tx": "245 240 230",
      "--mu": "172 152 166",
      "--gl": "255 0 170",
      "--bd": "70 50 64",
    },
  },
  {
    id: "demon-slayer",
    name: "Demon Slayer",
    symbol: "⚔",
    vibe: "breath of focus",
    vars: {
      "--bg": "14 16 20",
      "--sur": "26 28 36",
      "--sur2": "34 36 48",
      "--ac": "255 48 48",
      "--ac2": "0 229 255",
      "--tx": "240 238 240",
      "--mu": "150 152 168",
      "--gl": "255 48 48",
      "--bd": "54 48 60",
    },
  },
  {
    id: "jjk",
    name: "JJK",
    symbol: "✦",
    vibe: "cursed energy",
    vars: {
      "--bg": "14 12 20",
      "--sur": "26 22 36",
      "--sur2": "34 28 48",
      "--ac": "155 0 255",
      "--ac2": "204 85 255",
      "--tx": "238 232 248",
      "--mu": "158 148 174",
      "--gl": "155 0 255",
      "--bd": "52 42 70",
    },
  },
];

export const THEME_STORAGE_KEY = "ce_theme_v1";
export const DEFAULT_THEME_ID = THEMES[0].id;
export const THEME_CHANGE_EVENT = "ce-themechange";

export function getTheme(id: string | null): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

// id -> vars map, used by the no-flash inline boot script in the root layout.
export function themeVarMap(): Record<string, ThemeVars> {
  return Object.fromEntries(THEMES.map((t) => [t.id, t.vars]));
}

export function storedThemeId(): string {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) ?? DEFAULT_THEME_ID;
  } catch {
    return DEFAULT_THEME_ID;
  }
}

export function applyTheme(id: string): void {
  const theme = getTheme(id);
  const root = document.documentElement;
  for (const key of THEME_VAR_KEYS) root.style.setProperty(key, theme.vars[key]);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme.id);
  } catch {
    /* ignore unavailable storage */
  }
  window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: theme.id }));
}

// Read the active accent (`--ac`) as [r, g, b]; falls back to terminal green.
export function readAccentRgb(): [number, number, number] {
  if (typeof window === "undefined") return [0, 230, 118];
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--ac").trim();
  const parts = raw.split(/\s+/).map((n) => Number(n));
  if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
    return [parts[0], parts[1], parts[2]];
  }
  return [0, 230, 118];
}
