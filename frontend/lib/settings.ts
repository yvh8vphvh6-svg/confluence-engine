"use client";

import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

export type Density = "comfortable" | "compact";
export type Verbosity = "concise" | "normal" | "verbose";
export type MotionPref = "system" | "on" | "off";
export type Instrument = "MNQ" | "MGC";
export type Timeframe = "1m" | "5m" | "15m" | "30m" | "1h";
export type RegimeFilter = "" | "trending" | "ranging" | "high_vol" | "low_vol";

export type Settings = {
  // appearance
  reducedMotion: MotionPref;
  ambientBackground: boolean;
  parallaxTilt: boolean;
  density: Density;
  // profile
  displayName: string;
  // simulation defaults
  paperBalance: number;
  riskPerTradePct: number;
  maxDailyLossR: number;
  defaultInstrument: Instrument;
  defaultTimeframe: Timeframe;
  defaultRegimeFilter: RegimeFilter;
  replaySpeed: number;
  seed: number;
  autoPause: boolean;
  // coach
  coachEnabled: boolean;
  tradeCountLogging: boolean;
  coachVerbosity: Verbosity;
  // learning (stored now; activate when their phases ship)
  confidencePrompt: boolean;
  decisionTimerEnabled: boolean;
  decisionTimerSeconds: number;
  dailyChallengeReminders: boolean;
  // discipline
  emotionalCheckins: boolean;
  tiltThresholdLosses: number;
  cooldownMinutes: number;
  revengeGuard: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  reducedMotion: "system",
  ambientBackground: true,
  parallaxTilt: true,
  density: "comfortable",
  displayName: "Idris",
  paperBalance: 50_000,
  riskPerTradePct: 1,
  maxDailyLossR: 2,
  defaultInstrument: "MNQ",
  defaultTimeframe: "5m",
  defaultRegimeFilter: "",
  replaySpeed: 1,
  seed: 42,
  autoPause: true,
  coachEnabled: true,
  tradeCountLogging: true,
  coachVerbosity: "normal",
  confidencePrompt: false,
  decisionTimerEnabled: false,
  decisionTimerSeconds: 15,
  dailyChallengeReminders: false,
  emotionalCheckins: true,
  tiltThresholdLosses: 3,
  cooldownMinutes: 5,
  revengeGuard: true,
};

export const SETTINGS_STORAGE_KEY = "ce_settings_v1";

type SettingsState = {
  settings: Settings;
  update: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  resetAll: () => void;
};

const memoryStorage: StateStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      settings: DEFAULT_SETTINGS,
      update: (key, value) => set((s) => ({ settings: { ...s.settings, [key]: value } })),
      resetAll: () => set({ settings: { ...DEFAULT_SETTINGS } }),
    }),
    {
      name: SETTINGS_STORAGE_KEY,
      version: 1,
      // start from defaults on first render (matches SSR), then rehydrate after
      // mount (see SettingsEffects) to avoid hydration mismatches on settings-
      // driven UI like the ambient canvas / parallax stage
      skipHydration: true,
      storage: createJSONStorage(() => (typeof window !== "undefined" ? window.localStorage : memoryStorage)),
      // deep-merge persisted settings over defaults so newly-added keys keep their default
      merge: (persisted, current) => {
        const p = persisted as { settings?: Partial<Settings> } | undefined;
        return { ...current, settings: { ...current.settings, ...(p?.settings ?? {}) } };
      },
    },
  ),
);
