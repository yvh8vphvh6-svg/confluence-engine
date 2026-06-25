"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import Controls from "../components/dashboard/Controls";
import ControlsDrawer from "../components/dashboard/ControlsDrawer";
import ChartHeader from "../components/dashboard/ChartHeader";
import RegimeStrip from "../components/dashboard/RegimeStrip";
import MetricsPanel from "../components/dashboard/MetricsPanel";
import StrategySignals from "../components/dashboard/StrategySignals";
import SignalInspector from "../components/dashboard/SignalInspector";
import Blotter from "../components/dashboard/Blotter";
import PositionCard from "../components/dashboard/PositionCard";
import StatusBar from "../components/dashboard/StatusBar";
import BestSetup from "../components/dashboard/BestSetup";
import CoachWidget from "../components/dashboard/CoachWidget";
import TradePanel from "../components/dashboard/TradePanel";
import PaperAccount from "../components/dashboard/PaperAccount";
import ManualController from "../components/dashboard/ManualController";
import TeachCard from "../components/dashboard/TeachCard";
import PostTradeCard from "../components/dashboard/PostTradeCard";
import SessionReview from "../components/dashboard/SessionReview";
import PreSessionCheckin from "../components/dashboard/PreSessionCheckin";
import DisciplineBanner from "../components/dashboard/DisciplineBanner";
import ChallengesCard from "../components/dashboard/ChallengesCard";
import BadgeToaster from "../components/BadgeToaster";
import Tour from "../components/Tour";
import Leaderboard from "../components/Leaderboard";
import ParallaxStage from "../components/ParallaxStage";
import BootHero from "../components/BootHero";
import { startStream, play, pause, step, stepBack, applyConfig, setSpeed } from "../lib/stream";
import { useStore } from "../lib/store";
import { useSettings } from "../lib/settings";
import { getProgression } from "../lib/api";

const DIFFICULTY_TIERS = ["novice", "apprentice", "journeyman", "master"];

const PriceChart = dynamic(() => import("../components/dashboard/PriceChart"), { ssr: false });

export default function PracticePage() {
  const setLearnOpen = useStore((s) => s.setLearnOpen);
  const setTourOpen = useStore((s) => s.setTourOpen);
  const teach = useStore((s) => s.teach);
  const autoPauseSetting = useSettings((s) => s.settings.autoPause);
  const [metricsOpen, setMetricsOpen] = useState(false);

  useEffect(() => startStream(), []);

  // apply saved simulation defaults once on entry
  useEffect(() => {
    const st = useSettings.getState().settings;
    const cur = useStore.getState().config;
    const cfg = {
      ...cur,
      symbol: st.defaultInstrument,
      timeframe: st.defaultTimeframe,
      seed: st.seed,
      regime_filter: (st.defaultRegimeFilter || null) as typeof cur.regime_filter,
    };
    useStore.getState().setConfig(cfg);
    useStore.setState({ paperStart: st.paperBalance, paperBalance: st.paperBalance });
    useStore.getState().setAutoPause(st.autoPause);
    // only reconfigure the live stream when defaults differ from the server's
    const isServerDefault = cfg.symbol === "MNQ" && cfg.timeframe === "5m" && cfg.seed === 42 && cfg.regime_filter === null;
    if (!isServerDefault) applyConfig(cfg);
    if (st.replaySpeed !== 1) setSpeed(st.replaySpeed);
  }, []);

  // synthetic difficulty (chart clarity) follows the user's progression tier on
  // entry — Novice gets clean textbook structure, Master ≈ real-market noise.
  // The Controls difficulty selector can still override for the session.
  useEffect(() => {
    const ctrl = new AbortController();
    getProgression(ctrl.signal)
      .then((p) => {
        const tier = (p?.xp?.tier?.tier ?? "").toLowerCase();
        if (DIFFICULTY_TIERS.includes(tier) && useStore.getState().config.difficulty !== tier) {
          useStore.getState().setConfig({ difficulty: tier });
          applyConfig(useStore.getState().config);
        }
      })
      .catch(() => undefined);
    return () => ctrl.abort();
  }, []);

  // keep auto-pause synced with the setting (cheap, live)
  useEffect(() => {
    useStore.getState().setAutoPause(autoPauseSetting);
  }, [autoPauseSetting]);

  // first-visit: launch the interactive tour — but only AFTER the BootHero
  // load-in has finished/been dismissed, so the two never overlap on screen.
  const bootComplete = useStore((s) => s.bootComplete);
  useEffect(() => {
    if (!bootComplete) return;
    try {
      if (!localStorage.getItem("ce_tour_seen_v1")) setTourOpen(true);
    } catch {
      /* ignore */
    }
  }, [bootComplete, setTourOpen]);

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
      <BootHero />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ControlsDrawer />
          <div>
            <h1 className="text-xl font-semibold text-text">Practice</h1>
            <p className="text-xs text-muted">
              Streaming synthetic chart · it auto-pauses to teach you qualified setups · Space = play/pause, ← → = step.{" "}
              <button className="text-neon underline" onClick={() => setTourOpen(true)}>Take the tour</button>
              {" · "}
              <button className="text-neon underline" onClick={() => setLearnOpen(true)}>Lessons</button>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SessionReview />
          <StatusBar />
        </div>
      </div>

      <ParallaxStage className="grid gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
        {/* inline controls column on md+; on mobile they live in the slide-over drawer */}
        <aside className="hidden md:block" data-tour="controls">
          <Controls />
        </aside>

        <section className="min-w-0 space-y-4">
          <PreSessionCheckin />
          <DisciplineBanner />
          {teach && <TeachCard />}
          <ChallengesCard />
          <div className="panel panel-focus min-w-0 overflow-hidden" data-tour="chart">
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

          {/* secondary panels: collapsed below the chart on mobile, always shown on md+ */}
          <button
            type="button"
            onClick={() => setMetricsOpen((o) => !o)}
            aria-expanded={metricsOpen}
            className="btn flex w-full items-center justify-between md:hidden"
          >
            <span>Account, metrics &amp; leaderboard</span>
            <span aria-hidden="true">{metricsOpen ? "▾" : "▸"}</span>
          </button>
          <div className={`${metricsOpen ? "block" : "hidden"} space-y-4 md:block`}>
            <div className="grid gap-4 md:grid-cols-2">
              <PaperAccount />
              <MetricsPanel />
            </div>
            <Leaderboard compact limit={10} />
          </div>
        </section>
      </ParallaxStage>

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
      <CoachWidget />
      <PostTradeCard />
      <BadgeToaster />
    </div>
  );
}
