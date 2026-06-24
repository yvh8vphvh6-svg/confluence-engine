import type { Metadata, Viewport } from "next";
import { Orbitron, Rajdhani, Share_Tech_Mono } from "next/font/google";
import type { ReactNode } from "react";

import AmbientBackground from "../components/AmbientBackground";
import NavTabs from "../components/NavTabs";
import OnboardingModal from "../components/OnboardingModal";
import SettingsButton from "../components/SettingsButton";
import SettingsEffects from "../components/SettingsEffects";
import StreakIndicator from "../components/StreakIndicator";
import { DEFAULT_THEME_ID, THEME_STORAGE_KEY, themeVarMap } from "../lib/themes";
import "./globals.css";

// NOTE: must match SETTINGS_STORAGE_KEY in lib/settings.ts. Inlined as a literal
// because lib/settings.ts is a "use client" module — importing its consts into
// this server component yields client-reference proxies, not the string value.
const SETTINGS_KEY = "ce_settings_v1";

const display = Orbitron({ subsets: ["latin"], weight: ["500", "700", "900"], variable: "--fd", display: "swap" });
const body = Rajdhani({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--fb", display: "swap" });
const mono = Share_Tech_Mono({ subsets: ["latin"], weight: "400", variable: "--fm", display: "swap" });

export const metadata: Metadata = {
  title: "Confluence Engine — Training Camp",
  description: "Deterministic, no-lookahead futures backtesting engine with a live training dashboard.",
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#0B0F19",
  viewportFit: "cover",
};

// Apply the persisted theme's CSS vars + density before first paint (no flash).
const THEME_BOOT = `(function(){try{var r=document.documentElement;var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});var M=${JSON.stringify(themeVarMap())};var v=M[t]||M[${JSON.stringify(DEFAULT_THEME_ID)}];if(v){for(var p in v){r.style.setProperty(p,v[p]);}}var s=JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)})||"null");var d=s&&s.state&&s.state.settings&&s.state.settings.density;r.setAttribute("data-density",d==="compact"?"compact":"comfortable");}catch(e){}})();`;

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body className="min-h-screen bg-background text-text antialiased">
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        <AmbientBackground />
        <SettingsEffects />
        <div className="relative">
          <header className="sticky top-0 z-30 border-b border-line bg-background/80 backdrop-blur">
            <div className="mx-auto flex max-w-[1600px] flex-col gap-2 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                <span className="h-2.5 w-2.5 rounded-full bg-neon shadow-[0_0_12px_rgb(var(--gl))]" />
                <div>
                  <p className="font-display text-sm font-semibold tracking-[0.18em] text-text">CONFLUENCE ENGINE</p>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-muted">Training Camp · MNQ / MGC</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <NavTabs />
                <span className="mx-1 h-4 w-px bg-line" />
                <StreakIndicator />
                <SettingsButton />
              </div>
            </div>
          </header>
          <div className="mx-auto max-w-[1600px] px-4 py-4">{children}</div>
          <footer className="mx-auto max-w-[1600px] px-4 pb-6 pt-2">
            <p className="rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-center text-[11px] text-warn">
              Simulation only — no brokerage connection or real-money execution. Data is synthetic; a good
              backtest here proves the code is correct, not that a strategy has a live edge.
            </p>
          </footer>
          <OnboardingModal />
        </div>
      </body>
    </html>
  );
}
