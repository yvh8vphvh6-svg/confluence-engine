"use client";

import { CandlestickData, ColorType, createChart, LineStyle, UTCTimestamp } from "lightweight-charts";
import { useEffect, useRef } from "react";

export type ChartBar = { time: number; open: number; high: number; low: number; close: number };
export type ChartOverlay = { kind: string; direction: string; low: number; high: number; label: string };
export type ChartTrade = { entry: number; stop: number; target: number };

// Reusable candle chart with overlay zones drawn as labelled price-lines (the
// chart lib has no native box primitive) and optional entry/stop/target lines.
// Same fixed palette as the app's other charts; the surrounding UI is themed.
export default function BarsChart({
  candles,
  overlays = [],
  trade,
  height = 380,
}: {
  candles: ChartBar[];
  overlays?: ChartOverlay[];
  trade?: ChartTrade | null;
  height?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || candles.length === 0) return;
    const chart = createChart(el, {
      width: el.clientWidth,
      height,
      layout: { background: { type: ColorType.Solid, color: "#0B0F19" }, textColor: "#8A93A8" },
      grid: { vertLines: { color: "rgba(39,48,74,0.5)" }, horzLines: { color: "rgba(39,48,74,0.5)" } },
      rightPriceScale: { borderColor: "#27304a" },
      timeScale: { borderColor: "#27304a", timeVisible: true, secondsVisible: false },
      crosshair: { mode: 0 },
    });
    const series = chart.addCandlestickSeries({
      upColor: "#00E676", downColor: "#FF1744", wickUpColor: "#00E676", wickDownColor: "#FF1744", borderVisible: false,
    });
    series.setData(
      candles.map((c): CandlestickData => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close })),
    );

    const zoneColor = (o: ChartOverlay) =>
      o.kind === "ORB" ? "#FFD600" : o.direction === "long" ? "#00E676" : "#FF1744";
    for (const o of overlays) {
      series.createPriceLine({ price: o.high, color: zoneColor(o), lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: o.label });
      series.createPriceLine({ price: o.low, color: zoneColor(o), lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: "" });
    }
    if (trade) {
      series.createPriceLine({ price: trade.entry, color: "#FFD600", lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: "entry" });
      series.createPriceLine({ price: trade.stop, color: "#FF1744", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "stop" });
      series.createPriceLine({ price: trade.target, color: "#00E676", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "target" });
    }

    chart.timeScale().fitContent();
    const ro = new ResizeObserver(([e]) => chart.applyOptions({ width: e.contentRect.width }));
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [candles, overlays, trade, height]);

  return <div ref={ref} className="w-full" style={{ height }} />;
}
