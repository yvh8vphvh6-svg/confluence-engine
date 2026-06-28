"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";

import ControlsBar from "../components/dashboard/ControlsBar";
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

  // "Replay tour" handoff from Settings (it navigates here via window.location so
  // it doesn't depend on the app-router context in that app-wide layout button).
  useEffect(() => {
    try {
      if (sessionStorage.getItem("ce_replay_tour") === "1") {
        sessionStorage.removeItem("ce_replay_tour");
        setTourOpen(true);
      }
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
      <BootHero />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text">Practice</h1>
          <p className="text-xs text-muted">
            Watch, predict, learn.{" "}
            <button className="text-neon underline" onClick={() => setTourOpen(true)}>Take the tour</button>
            {" · "}
            <button className="text-neon underline" onClick={() => setLearnOpen(true)}>Lessons</button>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SessionReview />
          <StatusBar />
        </div>
      </div>

      {/* ONE focal point: the chart + a plain "what do you see?" prompt and the
          current decision. Everything else is closed by default so a first-time
          user lands on the chart with nothing competing for attention. */}
      <ParallaxStage className="space-y-4">
        <ControlsBar />
        <PreSessionCheckin />
        <DisciplineBanner />
        {teach && <TeachCard />}

        <div className="panel panel-focus min-w-0 overflow-hidden" data-tour="chart">
          <ChartHeader />
          <div className="bg-background p-2">
            <PriceChart />
          </div>
          <RegimeStrip />
          <p className="border-t border-line px-3 py-2 text-center text-xs text-muted">
            👀 <span className="font-medium text-text">What do you see?</span> Just watch it play — it pauses the moment a real setup forms and walks you through it.
          </p>
        </div>

        <BestSetup />

        {/* everything secondary — closed by default, one tap to open */}
        <details className="group">
          <summary className="btn flex w-full cursor-pointer list-none items-center justify-between [&::-webkit-details-marker]:hidden" data-tour="challenges">
            <span>Daily challenges</span>
            <span aria-hidden="true" className="text-muted motion-safe:transition-transform group-open:rotate-90">▸</span>
          </summary>
          <div className="mt-3"><ChallengesCard /></div>
        </details>

        <details className="group">
          <summary className="btn flex w-full cursor-pointer list-none items-center justify-between [&::-webkit-details-marker]:hidden" data-tour="trade">
            <span>Place a manual trade</span>
            <span aria-hidden="true" className="text-muted motion-safe:transition-transform group-open:rotate-90">▸</span>
          </summary>
          <div className="mt-3"><TradePanel /></div>
        </details>

        <details className="group">
          <summary className="btn flex w-full cursor-pointer list-none items-center justify-between [&::-webkit-details-marker]:hidden">
            <span>Your account, history &amp; stats</span>
            <span aria-hidden="true" className="text-muted motion-safe:transition-transform group-open:rotate-90">▸</span>
          </summary>
          <div className="mt-3 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <PaperAccount />
              <MetricsPanel />
            </div>
            <Blotter />
            <Leaderboard compact limit={10} />
          </div>
        </details>

        <details className="group">
          <summary className="btn flex w-full cursor-pointer list-none items-center justify-between [&::-webkit-details-marker]:hidden">
            <span>Engine internals (auto-sim &amp; per-strategy signals)</span>
            <span aria-hidden="true" className="text-muted motion-safe:transition-transform group-open:rotate-90">▸</span>
          </summary>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <PositionCard />
            <StrategySignals />
          </div>
        </details>
      </ParallaxStage>

      <ManualController />
      <SignalInspector />
      <Tour />
      <CoachWidget />
      <PostTradeCard />
      <BadgeToaster />
    </div>
  );
}
