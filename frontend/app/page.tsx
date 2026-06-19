"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";

import Controls from "../components/dashboard/Controls";
import ChartHeader from "../components/dashboard/ChartHeader";
import RegimeStrip from "../components/dashboard/RegimeStrip";
import MetricsPanel from "../components/dashboard/MetricsPanel";
import StrategySignals from "../components/dashboard/StrategySignals";
import SignalInspector from "../components/dashboard/SignalInspector";
import Blotter from "../components/dashboard/Blotter";
import PositionCard from "../components/dashboard/PositionCard";
import StatusBar from "../components/dashboard/StatusBar";
import BestSetup from "../components/dashboard/BestSetup";
import Coach from "../components/dashboard/Coach";
import TradePanel from "../components/dashboard/TradePanel";
import PaperAccount from "../components/dashboard/PaperAccount";
import ManualController from "../components/dashboard/ManualController";
import TeachCard from "../components/dashboard/TeachCard";
import Tour from "../components/Tour";
import Leaderboard from "../components/Leaderboard";
import { startStream, play, pause, step, stepBack } from "../lib/stream";
import { useStore } from "../lib/store";

const PriceChart = dynamic(() => import("../components/dashboard/PriceChart"), { ssr: false });

export default function PracticePage() {
  const setLearnOpen = useStore((s) => s.setLearnOpen);
  const setTourOpen = useStore((s) => s.setTourOpen);
  const teach = useStore((s) => s.teach);

  useEffect(() => startStream(), []);

  // first-visit: launch the interactive tour
  useEffect(() => {
    try {
      if (!localStorage.getItem("ce_tour_seen_v1")) setTourOpen(true);
    } catch {
      /* ignore */
    }
  }, [setTourOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      const playing = useStore.getState().latestTick?.playing;
      if (e.key === " ") {
        e.preventDefault();
        playing ? pause() : play();
      } else if (e.key === "ArrowRight") step();
      else if (e.key === "ArrowLeft") stepBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text">Practice</h1>
          <p className="text-xs text-muted">
            Streaming synthetic chart · it auto-pauses to teach you qualified setups · Space = play/pause, ← → = step.{" "}
            <button className="text-neon underline" onClick={() => setTourOpen(true)}>Take the tour</button>
            {" · "}
            <button className="text-neon underline" onClick={() => setLearnOpen(true)}>Lessons</button>
          </p>
        </div>
        <StatusBar />
      </div>

      <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_360px]">
        <aside className="order-2 xl:order-1" data-tour="controls">
          <Controls />
        </aside>

        <section className="order-1 min-w-0 space-y-4 xl:order-2">
          {teach && <TeachCard />}
          <div className="panel min-w-0 overflow-hidden" data-tour="chart">
            <ChartHeader />
            <div className="bg-background p-2">
              <PriceChart />
            </div>
            <RegimeStrip />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <TradePanel />
            <BestSetup />
          </div>
          <Blotter />
        </section>

        <aside className="order-3 space-y-4">
          <Coach />
          <PaperAccount />
          <MetricsPanel />
          <Leaderboard compact limit={10} />
        </aside>
      </div>

      <details className="panel p-4">
        <summary className="cursor-pointer text-xs font-medium text-muted">
          Engine internals (auto-sim demo position &amp; per-strategy signals)
        </summary>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <PositionCard />
          <StrategySignals />
        </div>
      </details>

      <ManualController />
      <SignalInspector />
      <Tour />
    </div>
  );
}
