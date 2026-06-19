import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import NavTabs from "../components/NavTabs";
import OnboardingModal from "../components/OnboardingModal";
import "./globals.css";

export const metadata: Metadata = {
  title: "Confluence Engine — Training Camp",
  description: "Deterministic, no-lookahead futures backtesting engine with a live training dashboard.",
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#0B0F19",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-text antialiased">
        <div className="pointer-events-none fixed inset-0 bg-dashboard-glow" />
        <div className="relative">
          <header className="sticky top-0 z-30 border-b border-line bg-background/90 backdrop-blur">
            <div className="mx-auto flex max-w-[1600px] flex-col gap-2 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                <span className="h-2.5 w-2.5 rounded-full bg-neon shadow-[0_0_12px_#00E676]" />
                <div>
                  <p className="text-sm font-semibold tracking-[0.18em] text-text">CONFLUENCE ENGINE</p>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-muted">Training Camp · MNQ / MGC</p>
                </div>
              </div>
              <NavTabs />
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
