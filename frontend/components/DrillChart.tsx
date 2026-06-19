"use client";

import {
  CandlestickData, ColorType, createChart, IPriceLine, ISeriesApi, LineStyle, UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useRef } from "react";

type C = { time: number; open: number; high: number; low: number; close: number };

export default function DrillChart({
  candles, entry, stop, target,
}: {
  candles: C[];
  entry?: number | null;
  stop?: number | null;
  target?: number | null;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const linesRef = useRef<IPriceLine[]>([]);

  useEffect(() => {
    if (!ref.current) return;
    const chart = createChart(ref.current, {
      width: ref.current.clientWidth,
      height: 360,
      layout: { background: { type: ColorType.Solid, color: "#0B0F19" }, textColor: "#8A93A8" },
      grid: { vertLines: { color: "rgba(39,48,74,0.5)" }, horzLines: { color: "rgba(39,48,74,0.5)" } },
      rightPriceScale: { borderColor: "#27304a" },
      timeScale: { borderColor: "#27304a", timeVisible: true, secondsVisible: false },
    });
    const series = chart.addCandlestickSeries({
      upColor: "#00E676", downColor: "#FF1744", wickUpColor: "#00E676", wickDownColor: "#FF1744", borderVisible: false,
    });
    seriesRef.current = series;
    const ro = new ResizeObserver(([e]) => chart.applyOptions({ width: e.contentRect.width }));
    ro.observe(ref.current);
    return () => { ro.disconnect(); chart.remove(); seriesRef.current = null; linesRef.current = []; };
  }, []);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    const data: CandlestickData[] = candles.map((c) => ({
      time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close,
    }));
    series.setData(data);
    for (const l of linesRef.current) series.removePriceLine(l);
    linesRef.current = [];
    const add = (price: number | null | undefined, color: string, title: string, style: LineStyle) => {
      if (price == null) return;
      linesRef.current.push(series.createPriceLine({ price, color, lineWidth: 2, lineStyle: style, axisLabelVisible: true, title }));
    };
    add(entry, "#FFD600", "entry", LineStyle.Solid);
    add(stop, "#FF1744", "stop", LineStyle.Dashed);
    add(target, "#00E676", "target", LineStyle.Dashed);
  }, [candles, entry, stop, target]);

  return <div ref={ref} className="w-full" />;
}
