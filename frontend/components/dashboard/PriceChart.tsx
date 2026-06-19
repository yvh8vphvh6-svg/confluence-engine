"use client";

import {
  CandlestickData,
  ColorType,
  createChart,
  IChartApi,
  IPriceLine,
  ISeriesApi,
  LineStyle,
  SeriesMarker,
  UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useRef } from "react";

import { useStore, type OverlayView, type SimulationTick } from "../../lib/store";

const ZONE_COLORS: Record<string, string> = {
  FVG: "#4ECBFF",
  OB: "#7C3AED",
  ORB: "#FFD600",
  BOS: "#8A93A8",
  SWEEP: "#FF1744",
};

function toMarkers(tick: SimulationTick, toggles: Record<string, boolean>): SeriesMarker<UTCTimestamp>[] {
  const markers: SeriesMarker<UTCTimestamp>[] = [];
  for (const o of tick.overlays) {
    if (!toggles[o.kind]) continue;
    if (o.kind === "BOS") {
      markers.push({
        time: o.start_time as UTCTimestamp,
        position: o.direction === "long" ? "belowBar" : "aboveBar",
        color: o.direction === "long" ? "#00E676" : "#FF1744",
        shape: o.direction === "long" ? "arrowUp" : "arrowDown",
        text: "BOS",
      });
    }
  }
  // trade entry/exit markers from recent trades
  for (const t of tick.recent_trades.slice(-12)) {
    markers.push({
      time: Math.floor(new Date(t.entry_time).getTime() / 1000) as UTCTimestamp,
      position: t.direction === "long" ? "belowBar" : "aboveBar",
      color: t.direction === "long" ? "#00E676" : "#FF1744",
      shape: t.direction === "long" ? "arrowUp" : "arrowDown",
      text: t.strategy.split("_")[0],
    });
    markers.push({
      time: Math.floor(new Date(t.exit_time).getTime() / 1000) as UTCTimestamp,
      position: "inBar",
      color: t.r_multiple >= 0 ? "#FFD600" : "#8A93A8",
      shape: "circle",
    });
  }
  markers.sort((a, b) => (a.time as number) - (b.time as number));
  return markers;
}

export default function PriceChart() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const linesRef = useRef<IPriceLine[]>([]);
  const lastTokenRef = useRef<number>(-1);
  const lastBarRef = useRef<number>(-1);

  const setup = () => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 440,
      layout: {
        background: { type: ColorType.Solid, color: "#0B0F19" },
        textColor: "#8A93A8",
        fontFamily: "Inter, ui-sans-serif, system-ui",
      },
      grid: {
        vertLines: { color: "rgba(39, 48, 74, 0.5)" },
        horzLines: { color: "rgba(39, 48, 74, 0.5)" },
      },
      rightPriceScale: { borderColor: "#27304a" },
      timeScale: { borderColor: "#27304a", timeVisible: true, secondsVisible: false },
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

    const ro = new ResizeObserver(([entry]) => chart.applyOptions({ width: entry.contentRect.width }));
    ro.observe(containerRef.current);
    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      linesRef.current = [];
    };
  };

  useEffect(setup, []);

  const drawOverlays = (tick: SimulationTick) => {
    const series = seriesRef.current;
    if (!series) return;
    const toggles = useStore.getState().overlayToggles;
    // price-line zones (FVG/OB/ORB)
    for (const l of linesRef.current) series.removePriceLine(l);
    linesRef.current = [];
    const zones = tick.overlays.filter((o: OverlayView) => ["FVG", "OB", "ORB"].includes(o.kind) && toggles[o.kind]);
    for (const z of zones.slice(-8)) {
      const color = ZONE_COLORS[z.kind];
      linesRef.current.push(
        series.createPriceLine({ price: z.high, color, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: z.kind }),
      );
      linesRef.current.push(
        series.createPriceLine({ price: z.low, color, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: "" }),
      );
    }
    // engine auto-sim position (de-emphasised, dotted)
    if (tick.position) {
      linesRef.current.push(
        series.createPriceLine({ price: tick.position.stop, color: "#5b6172", lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: "auto stop" }),
      );
      linesRef.current.push(
        series.createPriceLine({ price: tick.position.target, color: "#5b6172", lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: "auto tp" }),
      );
    }
    // YOUR paper position (emphasised) — drawn so you always see your trade
    const paper = useStore.getState().paperPosition;
    if (paper) {
      linesRef.current.push(
        series.createPriceLine({ price: paper.entry, color: "#FFD600", lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: "YOUR entry" }),
      );
      linesRef.current.push(
        series.createPriceLine({ price: paper.stop, color: "#FF1744", lineWidth: 2, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "YOUR stop" }),
      );
      linesRef.current.push(
        series.createPriceLine({ price: paper.target, color: "#00E676", lineWidth: 2, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "YOUR target" }),
      );
    }
    // teaching highlight — the qualified setup we auto-paused on (entry/stop/TP)
    const teach = useStore.getState().teach;
    if (teach && !paper) {
      const sig = tick.signals.find((s) => s.name === teach.setup);
      if (sig && sig.entry != null && sig.stop != null && sig.target != null) {
        linesRef.current.push(
          series.createPriceLine({ price: sig.entry, color: "#FFD600", lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: "setup entry" }),
        );
        linesRef.current.push(
          series.createPriceLine({ price: sig.stop, color: "#FF1744", lineWidth: 2, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "setup stop" }),
        );
        linesRef.current.push(
          series.createPriceLine({ price: sig.target, color: "#00E676", lineWidth: 2, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "setup target" }),
        );
      }
    }
    series.setMarkers(toMarkers(tick, toggles));
  };

  // full redraw on frame (seek / reconfigure / pause-jump)
  useEffect(() => {
    const unsub = useStore.subscribe((state) => {
      const frame = state.frame;
      const series = seriesRef.current;
      if (!series || !frame || frame.token === lastTokenRef.current) return;
      lastTokenRef.current = frame.token;
      const data: CandlestickData[] = frame.candles.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));
      series.setData(data);
      if (state.latestTick) {
        lastBarRef.current = state.latestTick.bar_index;
        drawOverlays(state.latestTick);
      }
      chartRef.current?.timeScale().fitContent();
    });
    return unsub;
  }, []);

  // incremental update on each forward tick (no React re-render of candles)
  useEffect(() => {
    const unsub = useStore.subscribe((state) => {
      const tick = state.latestTick;
      const series = seriesRef.current;
      if (!series || !tick || tick.type === "frame") return;
      // dedup: only update/redraw when the bar actually changed (the no-selector
      // subscription otherwise fires on every unrelated store mutation)
      if (tick.bar_index === lastBarRef.current) return;
      lastBarRef.current = tick.bar_index;
      series.update({
        time: tick.ohlc.time as UTCTimestamp,
        open: tick.ohlc.open,
        high: tick.ohlc.high,
        low: tick.ohlc.low,
        close: tick.ohlc.close,
      });
      drawOverlays(tick);
    });
    return unsub;
  }, []);

  // on a teach pause: zoom in and frame the setup, then redraw highlight lines
  useEffect(() => {
    let lastTeach = useStore.getState().teach;
    return useStore.subscribe((state) => {
      if (state.teach === lastTeach) return;
      lastTeach = state.teach;
      const chart = chartRef.current;
      if (!chart) return;
      if (state.teach) {
        chart.timeScale().applyOptions({ barSpacing: 12 });
        chart.timeScale().scrollToRealTime();
      } else {
        chart.timeScale().applyOptions({ barSpacing: 6 });
      }
      if (state.latestTick) drawOverlays(state.latestTick);
    });
  }, []);

  // redraw immediately when the user opens/closes a paper position (between ticks)
  useEffect(() => {
    let last = useStore.getState().paperPosition;
    return useStore.subscribe((state) => {
      if (state.paperPosition === last) return;
      last = state.paperPosition;
      if (state.latestTick) drawOverlays(state.latestTick);
    });
  }, []);

  return <div ref={containerRef} className="h-[440px] w-full" />;
}
