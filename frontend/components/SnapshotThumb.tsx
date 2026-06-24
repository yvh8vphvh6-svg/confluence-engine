"use client";

import { CandlestickData, ColorType, createChart, LineStyle, UTCTimestamp } from "lightweight-charts";
import { useEffect, useRef } from "react";

import type { TradeSnapshot } from "../lib/api";

// Redraws a captured trade snapshot (bar window + entry/stop/target) as a static
// thumbnail using the same lightweight-charts renderer as the live chart.
export default function SnapshotThumb({ snapshot, height = 110 }: { snapshot: TradeSnapshot; height?: number }) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || snapshot.bars.length === 0) return;
    const chart = createChart(el, {
      width: el.clientWidth,
      height,
      layout: { background: { type: ColorType.Solid, color: "#0B0F19" }, textColor: "#8A93A8" },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      rightPriceScale: { visible: false },
      leftPriceScale: { visible: false },
      timeScale: { visible: false },
      handleScroll: false,
      handleScale: false,
      crosshair: { vertLine: { visible: false, labelVisible: false }, horzLine: { visible: false, labelVisible: false } },
    });
    const series = chart.addCandlestickSeries({
      upColor: "#00E676", downColor: "#FF1744", wickUpColor: "#00E676", wickDownColor: "#FF1744", borderVisible: false,
    });
    series.setData(
      snapshot.bars.map((b): CandlestickData => ({ time: b.time as UTCTimestamp, open: b.open, high: b.high, low: b.low, close: b.close })),
    );
    series.createPriceLine({ price: snapshot.entry, color: "#FFD600", lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: false, title: "" });
    series.createPriceLine({ price: snapshot.stop, color: "#FF1744", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "" });
    series.createPriceLine({ price: snapshot.target, color: "#00E676", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "" });
    chart.timeScale().fitContent();
    const ro = new ResizeObserver(([e]) => chart.applyOptions({ width: e.contentRect.width }));
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [snapshot, height]);

  if (snapshot.bars.length === 0) {
    return <div className="grid h-[110px] w-full place-items-center text-[10px] text-muted">no snapshot</div>;
  }
  return <div ref={ref} className="w-full overflow-hidden rounded-lg border border-line" />;
}
