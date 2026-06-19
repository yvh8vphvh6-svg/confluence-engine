"use client";

import { CandlestickData, ColorType, createChart, UTCTimestamp } from "lightweight-charts";
import { useEffect, useRef } from "react";

export default function RealChartView({
  candles,
}: {
  candles: { time: number; open: number; high: number; low: number; close: number }[];
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = createChart(ref.current, {
      width: ref.current.clientWidth,
      height: 440,
      layout: { background: { type: ColorType.Solid, color: "#0B0F19" }, textColor: "#8A93A8" },
      grid: { vertLines: { color: "rgba(39,48,74,0.5)" }, horzLines: { color: "rgba(39,48,74,0.5)" } },
      rightPriceScale: { borderColor: "#27304a" },
      timeScale: { borderColor: "#27304a", timeVisible: true, secondsVisible: false },
      crosshair: { mode: 0 },
    });
    const series = chart.addCandlestickSeries({
      upColor: "#00E676", downColor: "#FF1744", wickUpColor: "#00E676",
      wickDownColor: "#FF1744", borderVisible: false,
    });
    const data: CandlestickData[] = candles.map((c) => ({
      time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close,
    }));
    series.setData(data);
    chart.timeScale().fitContent();
    const ro = new ResizeObserver(([e]) => chart.applyOptions({ width: e.contentRect.width }));
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [candles]);

  return <div ref={ref} className="h-[440px] w-full" />;
}
