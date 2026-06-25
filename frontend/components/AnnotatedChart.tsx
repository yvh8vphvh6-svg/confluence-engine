"use client";

import {
  CandlestickData,
  ColorType,
  createChart,
  LineStyle,
  type SeriesMarker,
  type Time,
  UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useRef } from "react";

import type { Annotation } from "../lib/annotations";
import { useReducedMotion } from "../lib/useMotion";

export type AnnChartBar = { time: number; open: number; high: number; low: number; close: number };

// The ONE annotation/teaching chart. Draws a focused candle window with the
// engine's structure as zones (price-line boxes), trade levels, and action
// markers, plus a plain-language legend tying each mark to what price DID.
// Used by the live teach reveal (Part 1) and the glossary playbook (Part 2).
export default function AnnotatedChart({
  candles,
  annotations,
  height = 300,
  caption,
}: {
  candles: AnnChartBar[];
  annotations: Annotation[];
  height?: number;
  caption?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const reduced = useReducedMotion();

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
      handleScroll: false,
      handleScale: false,
    });
    const series = chart.addCandlestickSeries({
      upColor: "#00E676", downColor: "#FF1744", wickUpColor: "#00E676", wickDownColor: "#FF1744", borderVisible: false,
    });
    series.setData(
      candles.map((c): CandlestickData => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close })),
    );

    const markers: SeriesMarker<Time>[] = [];
    for (const a of annotations) {
      if (a.kind === "zone") {
        series.createPriceLine({ price: a.high, color: a.color, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: a.label });
        series.createPriceLine({ price: a.low, color: a.color, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: "" });
      } else if (a.kind === "level") {
        series.createPriceLine({ price: a.price, color: a.color, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: a.label });
      } else {
        markers.push({ time: a.time as UTCTimestamp, position: a.position, color: a.color, shape: a.shape, text: a.label });
      }
    }
    if (markers.length) series.setMarkers(markers.sort((x, y) => (x.time as number) - (y.time as number)));

    // focus = the passed window (instant; no animated zoom → reduced-motion safe)
    chart.timeScale().fitContent();
    const ro = new ResizeObserver(([e]) => chart.applyOptions({ width: e.contentRect.width }));
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [candles, annotations, height]);

  if (candles.length === 0) {
    return <div className="grid h-[180px] w-full place-items-center text-xs text-muted">No structure to annotate for this window.</div>;
  }

  return (
    <div className={reduced ? "" : "motion-safe:animate-[fadeIn_.3s_ease-out]"}>
      <div ref={ref} className="w-full overflow-hidden rounded-lg border border-line" style={{ height }} />
      {caption && <p className="mt-1 text-[11px] text-muted">{caption}</p>}
      <ul className="mt-2 space-y-1">
        {annotations.map((a, i) => (
          <li key={`${a.kind}-${a.label}-${i}`} className="flex items-start gap-2 text-[11px]">
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: a.color }} aria-hidden="true" />
            <span className="text-text"><span className="font-medium">{a.label}:</span> <span className="text-muted">{a.note}</span></span>
          </li>
        ))}
      </ul>
    </div>
  );
}
