"use client";

import {
  CandlestickData,
  ColorType,
  createChart,
  IChartApi,
  IPriceLine,
  ISeriesApi,
  LineStyle,
  LineWidth,
  SeriesMarker,
  UTCTimestamp,
} from "lightweight-charts";
import { useCallback, useEffect, useRef } from "react";

import { useStore, type SimulationTick } from "../../lib/store";

const ZONE_COLORS: Record<string, string> = {
  FVG: "#4ECBFF",
  OB: "#7C3AED",
  ORB: "#FFD600",
  BOS: "#8A93A8",
  SWEEP: "#FF1744",
};

// stable view so the chart doesn't rescale on every tick
const BAR_SPACING = 8;
const RIGHT_OFFSET = 6;

type LineSpec = {
  price: number;
  color: string;
  width: 1 | 2;
  style: LineStyle;
  axisLabel: boolean;
  title: string;
};

// Structure overlays (BOS/OB/ORB/SWEEP/FVG) become compact, kind-positioned
// markers — NOT a stack of price-lines. Duplicates at the same time+kind are
// collapsed; a kind→position mapping plus a final (time, position) dedupe
// guarantees labels never overlap on the same bar/side. Trade entries/exits are
// kept. Capped to the most recent few. Pure → easy to signature-compare so we
// set markers once per data change, not every tick.
function buildMarkers(
  tick: SimulationTick,
  toggles: Record<string, boolean>,
  newsTimes: Set<number>,
): SeriesMarker<UTCTimestamp>[] {
  const candidates: SeriesMarker<UTCTimestamp>[] = [];
  const seen = new Set<string>();

  for (const o of tick.overlays) {
    if (!toggles[o.kind]) continue;
    const key = `${o.start_time}|${o.kind}`; // collapse duplicates at same time/level
    if (seen.has(key)) continue;
    seen.add(key);
    const time = o.start_time as UTCTimestamp;
    if (o.kind === "BOS") {
      const long = o.direction === "long";
      candidates.push({ time, position: long ? "belowBar" : "aboveBar", color: long ? "#00E676" : "#FF1744", shape: long ? "arrowUp" : "arrowDown", text: "BOS" });
    } else if (o.kind === "OB") {
      candidates.push({ time, position: "aboveBar", color: ZONE_COLORS.OB, shape: "square", text: "OB" });
    } else if (o.kind === "ORB") {
      candidates.push({ time, position: "belowBar", color: ZONE_COLORS.ORB, shape: "square", text: "ORB" });
    } else if (o.kind === "SWEEP") {
      candidates.push({ time, position: "aboveBar", color: ZONE_COLORS.SWEEP, shape: "arrowDown", text: "SWEEP" });
    } else {
      candidates.push({ time, position: "belowBar", color: ZONE_COLORS.FVG, shape: "circle", text: "FVG" });
    }
  }

  for (const t of tick.recent_trades.slice(-10)) {
    const long = t.direction === "long";
    candidates.push({
      time: Math.floor(new Date(t.entry_time).getTime() / 1000) as UTCTimestamp,
      position: long ? "belowBar" : "aboveBar",
      color: long ? "#00E676" : "#FF1744",
      shape: long ? "arrowUp" : "arrowDown",
      text: t.strategy.split("_")[0],
    });
    candidates.push({
      time: Math.floor(new Date(t.exit_time).getTime() / 1000) as UTCTimestamp,
      position: "inBar",
      color: t.r_multiple >= 0 ? "#FFD600" : "#8A93A8",
      shape: "circle",
      // no text on exits → fewer colliding labels
    });
  }

  // synthetic news windows — amber markers so spread-widening windows are
  // obvious on the chart (the execution layer widens spreads here). Added last
  // so a news window is never hidden by a structure marker on the same bar.
  for (const t of newsTimes) {
    candidates.push({ time: t as UTCTimestamp, position: "aboveBar", color: "#FFB300", shape: "circle", text: "NEWS" });
  }

  // one marker per (time, position) so text never stacks on the same bar/side
  const byAnchor = new Map<string, SeriesMarker<UTCTimestamp>>();
  for (const m of candidates) byAnchor.set(`${m.time}|${m.position}`, m);

  return [...byAnchor.values()]
    .sort((a, b) => (a.time as number) - (b.time as number))
    .slice(-20); // hard cap
}

// ONLY the three trade levels — entry (solid), stop (dashed red), target
// (dashed green). No structure/context price-line stack (that's shown as faint
// markers instead) so the chart stays readable. Source priority: the user's
// paper trade → the teaching setup → the engine's auto-sim position.
function buildLineSpecs(tick: SimulationTick): LineSpec[] {
  let entry: number | null = null;
  let stop: number | null = null;
  let target: number | null = null;

  const paper = useStore.getState().paperPosition;
  if (paper) {
    entry = paper.entry;
    stop = paper.stop;
    target = paper.target;
  } else {
    const teach = useStore.getState().teach;
    const sig = teach ? tick.signals.find((s) => s.name === teach.setup) : undefined;
    if (sig && sig.entry != null && sig.stop != null && sig.target != null) {
      entry = sig.entry;
      stop = sig.stop;
      target = sig.target;
    } else if (tick.position) {
      entry = tick.position.entry_price;
      stop = tick.position.stop;
      target = tick.position.target;
    }
  }

  if (entry === null || stop === null || target === null) return [];
  return [
    { price: entry, color: "#FFD600", width: 2, style: LineStyle.Solid, axisLabel: true, title: "entry" },
    { price: stop, color: "#FF1744", width: 2, style: LineStyle.Dashed, axisLabel: true, title: "stop" },
    { price: target, color: "#00E676", width: 2, style: LineStyle.Dashed, axisLabel: true, title: "target" },
  ];
}

export default function PriceChart() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const linesRef = useRef<IPriceLine[]>([]);

  const frameTokenRef = useRef<number>(-1);
  const didFitRef = useRef<boolean>(false);
  const lastTickRef = useRef<SimulationTick | null>(null);
  const pendingTickRef = useRef<SimulationTick | null>(null);
  const rafRef = useRef<number | null>(null);
  const markerSigRef = useRef<string>("");
  const lineSigRef = useRef<string>("");
  const newsTimesRef = useRef<Set<number>>(new Set());

  // difficulty + live news flag (selectors → re-render only when they change,
  // not every tick) for the on-chart indicators.
  const difficulty = useStore((s) => s.meta?.difficulty ?? null);
  const newsNow = useStore((s) => s.latestTick?.news ?? false);

  // Sync price-lines + markers for the current tick. Signature-gated so it only
  // touches the DOM when the overlay set actually changes — safe to call on
  // every tick/event without flicker. Stable (only refs + the store), so it's a
  // valid, lint-clean effect dependency.
  const redrawOverlays = useCallback(() => {
    const series = seriesRef.current;
    const tick = useStore.getState().latestTick;
    if (!series || !tick) return;
    const toggles = useStore.getState().overlayToggles;

    // price-lines (only the three trade levels)
    const specs = buildLineSpecs(tick);
    const lineSig = specs.map((s) => `${s.price}|${s.color}|${s.width}|${s.style}|${s.axisLabel}|${s.title}`).join(",");
    if (lineSig !== lineSigRef.current) {
      lineSigRef.current = lineSig;
      for (const l of linesRef.current) series.removePriceLine(l);
      linesRef.current = specs.map((s) =>
        series.createPriceLine({
          price: s.price,
          color: s.color,
          lineWidth: s.width as LineWidth,
          lineStyle: s.style,
          axisLabelVisible: s.axisLabel,
          title: s.title,
        }),
      );
    }

    // markers
    if (tick.news) newsTimesRef.current.add(tick.ohlc.time);
    const markers = buildMarkers(tick, toggles, newsTimesRef.current);
    const markerSig = markers.map((m) => `${m.time}|${m.position}|${m.shape}|${m.text ?? ""}|${m.color}`).join(",");
    if (markerSig !== markerSigRef.current) {
      markerSigRef.current = markerSig;
      series.setMarkers(markers);
    }
  }, []);

  // ---- chart setup (once) ----
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: "#0B0F19" },
        textColor: "#8A93A8",
        fontFamily: "Inter, ui-sans-serif, system-ui",
      },
      grid: {
        vertLines: { color: "rgba(39, 48, 74, 0.5)" },
        horzLines: { color: "rgba(39, 48, 74, 0.5)" },
      },
      rightPriceScale: { borderColor: "#27304a", scaleMargins: { top: 0.12, bottom: 0.12 } },
      // stable time axis: fixed spacing + right gutter so it doesn't re-zoom per tick
      timeScale: {
        borderColor: "#27304a",
        timeVisible: true,
        secondsVisible: false,
        barSpacing: BAR_SPACING,
        rightOffset: RIGHT_OFFSET,
      },
      crosshair: { mode: 0 },
    });
    const series = chart.addCandlestickSeries({
      upColor: "#00E676",
      downColor: "#FF1744",
      wickUpColor: "#00E676",
      wickDownColor: "#FF1744",
      borderVisible: false,
    });
    chartRef.current = chart;
    seriesRef.current = series;

    chart.subscribeClick(() => {
      const tick = useStore.getState().latestTick;
      if (!tick) return;
      const active =
        tick.signals.find((s) => s.name === tick.active_strategy) ||
        [...tick.signals].sort(
          (a, b) => (b.confluence?.confidence ?? 0) - (a.confluence?.confidence ?? 0),
        )[0];
      if (active) useStore.getState().openInspector(active);
    });

    // resize only changes width/height — never the zoom level
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      chart.applyOptions({ width, height });
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      linesRef.current = [];
    };
  }, []);

  // ---- full reload via setData: ONLY on initial load / instrument / timeframe / seek ----
  useEffect(() => {
    return useStore.subscribe((state) => {
      const frame = state.frame;
      const series = seriesRef.current;
      if (!series || !frame || frame.token === frameTokenRef.current) return;
      frameTokenRef.current = frame.token;
      const data: CandlestickData[] = frame.candles.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));
      series.setData(data);
      // reset overlay signatures + news accumulation so the new dataset draws clean
      markerSigRef.current = "";
      lineSigRef.current = "";
      newsTimesRef.current = new Set();
      redrawOverlays();
      // fit ONCE on first load; afterwards just keep the latest bars in view at
      // the stable spacing (no per-load "fit everything" rescale)
      const chart = chartRef.current;
      if (chart) {
        if (!didFitRef.current) {
          chart.timeScale().fitContent();
          didFitRef.current = true;
        } else {
          chart.timeScale().scrollToRealTime();
        }
      }
    });
  }, [redrawOverlays]);

  // ---- per-tick: coalesce to one rAF, then update the forming/latest bar ----
  useEffect(() => {
    const flush = () => {
      rafRef.current = null;
      const tick = pendingTickRef.current;
      const series = seriesRef.current;
      if (!tick || !series) return;
      // update() on the latest time updates the forming bar; a new time appends.
      // Never setData() here — that would re-render the whole series (flicker).
      series.update({
        time: tick.ohlc.time as UTCTimestamp,
        open: tick.ohlc.open,
        high: tick.ohlc.high,
        low: tick.ohlc.low,
        close: tick.ohlc.close,
      });
      redrawOverlays();
    };

    return useStore.subscribe((state) => {
      const tick = state.latestTick;
      // frames are handled by the setData effect; skip unchanged references
      if (!tick || tick.type === "frame" || tick === lastTickRef.current) return;
      lastTickRef.current = tick;
      pendingTickRef.current = tick;
      if (rafRef.current == null) rafRef.current = requestAnimationFrame(flush);
    });
  }, [redrawOverlays]);

  // teach pause: bring the highlighted setup into view (no zoom change) + redraw
  useEffect(() => {
    let lastTeach = useStore.getState().teach;
    return useStore.subscribe((state) => {
      if (state.teach === lastTeach) return;
      lastTeach = state.teach;
      if (state.teach) chartRef.current?.timeScale().scrollToRealTime();
      redrawOverlays();
    });
  }, [redrawOverlays]);

  // redraw lines immediately when the user opens/closes a paper position or
  // toggles overlays (between ticks)
  useEffect(() => {
    let lastPaper = useStore.getState().paperPosition;
    let lastToggles = useStore.getState().overlayToggles;
    return useStore.subscribe((state) => {
      if (state.paperPosition === lastPaper && state.overlayToggles === lastToggles) return;
      lastPaper = state.paperPosition;
      lastToggles = state.overlayToggles;
      redrawOverlays();
    });
  }, [redrawOverlays]);

  // responsive height: clamped 320–420px on phones, 440px from md up
  return (
    <div className="relative">
      <div ref={containerRef} className="h-[clamp(320px,48vh,420px)] w-full touch-pan-y md:h-[440px]" />
      <div className="pointer-events-none absolute left-2 top-2 z-10 flex items-center gap-1.5">
        <span className="rounded border border-line/60 bg-black/40 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-muted">
          Synthetic · illustrative
        </span>
        {difficulty && (
          <span
            className="rounded border border-line/60 bg-black/40 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-muted"
            title={difficulty === "master" ? "Master ≈ real-market noise" : "Synthetic chart clarity tier"}
          >
            {difficulty}
          </span>
        )}
      </div>
      {newsNow && (
        <span className="pointer-events-none absolute right-2 top-2 z-10 rounded border border-amber-400/60 bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-300">
          ⚡ News · wide spreads
        </span>
      )}
    </div>
  );
}
