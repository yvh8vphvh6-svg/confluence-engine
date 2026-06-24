"use client";

import {
  AutoscaleInfo,
  CandlestickData,
  ColorType,
  createChart,
  IPriceLine,
  ISeriesApi,
  LineStyle,
  SeriesMarker,
  UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useRef, useState } from "react";

// A reusable, lightweight "clip" that draws a hand-authored OHLC pattern left to
// right (~1–2s), then reveals highlight zones/markers and holds the finished
// shape. Same chart style as the rest of the app. Reuse for more glossary terms
// and the strategy library — just pass new bars/zones/marks.

export type OHLC = { o: number; h: number; l: number; c: number };
export type DemoZone = { low: number; high: number; color: string; label?: string };
export type DemoMark = { i: number; color: string; text: string; above?: boolean };

type Props = {
  bars: OHLC[];
  zones?: DemoZone[];
  marks?: DemoMark[];
  height?: number;
  durationMs?: number;
};

const BASE_TIME = 1_700_000_000;

export default function PatternDemo({
  bars,
  zones = [],
  marks = [],
  height = 200,
  durationMs = 1500,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const linesRef = useRef<IPriceLine[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [runId, setRunId] = useState(0); // bump to replay
  const [done, setDone] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const chart = createChart(el, {
      width: el.clientWidth,
      height,
      layout: { background: { type: ColorType.Solid, color: "#0B0F19" }, textColor: "#8A93A8" },
      grid: { vertLines: { color: "rgba(39,48,74,0.4)" }, horzLines: { color: "rgba(39,48,74,0.4)" } },
      rightPriceScale: { borderColor: "#27304a" },
      timeScale: { borderColor: "#27304a", visible: false },
      crosshair: { vertLine: { visible: false, labelVisible: false }, horzLine: { visible: false, labelVisible: false } },
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

    const data: CandlestickData[] = bars.map((k, i) => ({
      time: (BASE_TIME + i * 60) as UTCTimestamp,
      open: k.o,
      high: k.h,
      low: k.l,
      close: k.c,
    }));

    // Lock the y-axis so candles don't rescale as they appear (textbook-clean).
    const min = Math.min(...bars.map((b) => b.l));
    const max = Math.max(...bars.map((b) => b.h));
    const pad = (max - min) * 0.14 || 1;
    series.applyOptions({
      autoscaleInfoProvider: (): AutoscaleInfo => ({
        priceRange: { minValue: min - pad, maxValue: max + pad },
      }),
    });
    // Reserve the full width up front so the x-axis stays put while drawing.
    const lockView = () =>
      chart.timeScale().setVisibleLogicalRange({ from: -0.7, to: data.length - 0.3 });

    const revealOverlays = () => {
      for (const z of zones) {
        linesRef.current.push(
          series.createPriceLine({ price: z.high, color: z.color, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: z.label ?? "" }),
        );
        if (z.low !== z.high) {
          linesRef.current.push(
            series.createPriceLine({ price: z.low, color: z.color, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "" }),
          );
        }
      }
      if (marks.length) {
        const ms: SeriesMarker<UTCTimestamp>[] = marks.map((m) => ({
          time: (BASE_TIME + m.i * 60) as UTCTimestamp,
          position: m.above ? "aboveBar" : "belowBar",
          color: m.color,
          shape: m.above ? "arrowDown" : "arrowUp",
          text: m.text,
        }));
        series.setMarkers(ms);
      }
      setDone(true);
    };

    const perBar = Math.max(70, durationMs / Math.max(1, data.length));
    let n = 1;
    setDone(false);
    series.setData(data.slice(0, 1));
    lockView();

    const step = () => {
      n += 1;
      series.setData(data.slice(0, n));
      lockView();
      if (n >= data.length) {
        revealOverlays();
        return;
      }
      timerRef.current = setTimeout(step, perBar);
    };
    timerRef.current = setTimeout(step, perBar);

    const ro = new ResizeObserver(([e]) => chart.applyOptions({ width: e.contentRect.width }));
    ro.observe(el);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      ro.disconnect();
      chart.remove();
      linesRef.current = [];
    };
  }, [runId, bars, zones, marks, height, durationMs]);

  return (
    <div className="space-y-1.5">
      <div ref={ref} className="w-full overflow-hidden rounded-lg border border-line" />
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-muted">Illustration — idealized example, not real market data.</p>
        <button
          onClick={() => setRunId((r) => r + 1)}
          disabled={!done}
          className="chip border-line text-muted hover:text-text disabled:opacity-40"
        >
          ↻ Replay
        </button>
      </div>
    </div>
  );
}
