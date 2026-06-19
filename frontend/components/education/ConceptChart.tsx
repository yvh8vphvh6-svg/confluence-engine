"use client";

import {
  CandlestickData,
  ColorType,
  createChart,
  IChartApi,
  ISeriesApi,
  LineStyle,
  SeriesMarker,
  UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useRef } from "react";

export type Zone = { low: number; high: number; color: string; label?: string };
export type Mark = { i: number; price: number; color: string; text: string; above?: boolean };

type Props = {
  candles: { o: number; h: number; l: number; c: number }[];
  zones?: Zone[];
  marks?: Mark[];
  height?: number;
};

export default function ConceptChart({ candles, zones = [], marks = [], height = 200 }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart: IChartApi = createChart(ref.current, {
      width: ref.current.clientWidth,
      height,
      layout: { background: { type: ColorType.Solid, color: "#0B0F19" }, textColor: "#8A93A8" },
      grid: { vertLines: { color: "rgba(39,48,74,0.4)" }, horzLines: { color: "rgba(39,48,74,0.4)" } },
      rightPriceScale: { borderColor: "#27304a" },
      timeScale: { borderColor: "#27304a", visible: false },
      handleScroll: false,
      handleScale: false,
    });
    const series: ISeriesApi<"Candlestick"> = chart.addCandlestickSeries({
      upColor: "#00E676",
      downColor: "#FF1744",
      wickUpColor: "#00E676",
      wickDownColor: "#FF1744",
      borderVisible: false,
    });
    const base = 1_700_000_000;
    const data: CandlestickData[] = candles.map((k, i) => ({
      time: (base + i * 60) as UTCTimestamp,
      open: k.o,
      high: k.h,
      low: k.l,
      close: k.c,
    }));
    series.setData(data);
    for (const z of zones) {
      series.createPriceLine({ price: z.high, color: z.color, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: z.label ?? "" });
      series.createPriceLine({ price: z.low, color: z.color, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "" });
    }
    if (marks.length) {
      const ms: SeriesMarker<UTCTimestamp>[] = marks.map((m) => ({
        time: (base + m.i * 60) as UTCTimestamp,
        position: m.above ? "aboveBar" : "belowBar",
        color: m.color,
        shape: m.above ? "arrowDown" : "arrowUp",
        text: m.text,
      }));
      series.setMarkers(ms);
    }
    chart.timeScale().fitContent();
    const ro = new ResizeObserver(([e]) => chart.applyOptions({ width: e.contentRect.width }));
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [candles, zones, marks, height]);

  return <div ref={ref} className="w-full" />;
}
