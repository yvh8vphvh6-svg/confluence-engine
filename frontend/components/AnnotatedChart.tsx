"use client";

import {
  CandlestickData,
  ColorType,
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  LineStyle,
  type SeriesMarker,
  type Time,
  UTCTimestamp,
} from "lightweight-charts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Annotation } from "../lib/annotations";
import { useReducedMotion } from "../lib/useMotion";

export type AnnChartBar = { time: number; open: number; high: number; low: number; close: number };

// lightweight-charts throws if times aren't finite + strictly ascending, which
// would leave a blank chart. Drop any bar that's malformed or out-of-order so the
// chart always gets drawable data (or nothing → the text fallback below).
function sanitizeBars(bars: AnnChartBar[]): AnnChartBar[] {
  const out: AnnChartBar[] = [];
  let lastT = -Infinity;
  for (const b of bars) {
    if (
      !Number.isFinite(b.time) || !Number.isFinite(b.open) || !Number.isFinite(b.high) ||
      !Number.isFinite(b.low) || !Number.isFinite(b.close) || b.high < b.low || b.time <= lastT
    ) {
      continue;
    }
    out.push(b);
    lastT = b.time;
  }
  return out;
}

type TradeLevel = Extract<Annotation, { kind: "level" }>;
type PlacedLabel = { id: string; label: string; price?: number; note: string; color: string; ax: number; ay: number; lx: number; ly: number };

const HINT_KEY = "ce_pricelevel_hint_v1";
// Only the first chart instance per page-load surfaces the first-view hint, so
// the 8-card playbook doesn't show it eight times.
let hintClaimedThisLoad = false;

const SETUP_BARS = 45; // how many recent bars "Zoom to setup" frames
const CHIP_W = 160;
const CHIP_H = 42; // tall enough for a 2-line trade-level chip (label + plain-language tag)
const STACK_GAP = 6;
const STACK_PAD = 6;

function fmtPrice(p: number): string {
  return p.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function fmtClock(t: number): string {
  // chart times are unix-seconds in UTC wall-clock; show HH:MM to match the axis
  return new Date(t * 1000).toISOString().slice(11, 16);
}

// The ONE annotation/teaching chart. By default it shows ONLY the trade plan —
// entry / stop / target as three lines, each labelled with a leader line so the
// tags never overlap. Market structure (FVG / OB / BOS / sweep) is hidden behind
// "Show the structure" so beginners see a clean chart. It opens framed to the
// setup window and supports scroll/pinch zoom, +/− and "Zoom to setup", with a
// price+time crosshair readout. Every mark is derived from real engine setup
// data. Used by the live teach reveal (Part 1) and the glossary playbook (Part 2).
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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const rafRef = useRef<number | null>(null);

  // live values read by the imperative chart callbacks (so zoom survives parent
  // re-renders — the chart is created once, never torn down on data churn)
  // sanitized once per data change; everything downstream uses these safe bars
  const safe = useMemo(() => sanitizeBars(candles), [candles]);

  const candlesRef = useRef(safe);
  const annotationsRef = useRef(annotations);
  const structureRef = useRef(false);
  candlesRef.current = safe;
  annotationsRef.current = annotations;

  const reduced = useReducedMotion();
  const [showStructure, setShowStructure] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [labels, setLabels] = useState<PlacedLabel[]>([]);
  const [readout, setReadout] = useState<{ price: number; time: number } | null>(null);
  structureRef.current = showStructure;

  const tradeLevels = annotations.filter((a): a is TradeLevel => a.group === "trade");
  const structure = annotations.filter((a) => a.group === "structure");
  // dedupe the structure legend by label — one entry per type (no "Bull FVG" ×3)
  const structureLegend = Array.from(new Map(structure.map((a) => [a.label, a])).values());

  // content signatures — re-run data/annotation effects only on real change, not
  // on every new array identity (keeps the user's zoom from snapping back)
  const candlesSig = useMemo(
    () => (safe.length ? `${safe.length}:${safe[0].time}:${safe[safe.length - 1].time}:${safe[safe.length - 1].close}` : "0"),
    [safe],
  );
  const annoSig = useMemo(
    () =>
      annotations
        .map((a) => (a.kind === "level" ? `l${a.label}${a.price}` : a.kind === "zone" ? `z${a.label}${a.low}${a.high}` : `m${a.label}${a.time}`))
        .join("|"),
    [annotations],
  );

  // place label chips in a right-side column, de-overlapped, with leader lines
  // back to each mark's true position on the chart
  const relayout = useCallback(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    const el = containerRef.current;
    if (!chart || !series || !el) return;
    const width = el.clientWidth;
    const h = el.clientHeight;
    const ts = chart.timeScale();
    const cands = candlesRef.current;

    type Raw = { id: string; label: string; price?: number; note: string; color: string; ax: number; ay: number };
    const raws: Raw[] = [];
    for (const a of annotationsRef.current) {
      if (a.kind === "level") {
        const y = series.priceToCoordinate(a.price);
        if (y == null) continue;
        // trade levels carry the plain-language tag onto the chart chip itself
        raws.push({ id: `lvl-${a.label}`, label: a.label, price: a.price, note: a.note, color: a.color, ax: width - 2, ay: y });
      } else if (structureRef.current && a.kind === "zone") {
        const y = series.priceToCoordinate(a.high);
        if (y == null) continue;
        raws.push({ id: `zone-${a.label}`, label: a.label, note: "", color: a.color, ax: width - 2, ay: y });
      } else if (structureRef.current && a.kind === "marker") {
        const x = ts.timeToCoordinate(a.time as UTCTimestamp);
        const cand = cands.find((c) => c.time === a.time);
        const p = cand ? (a.position === "aboveBar" ? cand.high : cand.low) : null;
        const y = p != null ? series.priceToCoordinate(p) : null;
        if (x == null || y == null) continue;
        raws.push({ id: `mk-${a.label}`, label: a.label, note: "", color: a.color, ax: x, ay: y });
      }
    }

    // one chip per label (no repeats) and stack vertically to avoid overlap
    const byLabel = new Map<string, Raw>();
    for (const r of raws) if (!byLabel.has(r.label)) byLabel.set(r.label, r);
    const sorted = [...byLabel.values()].sort((a, b) => a.ay - b.ay);
    const lx = Math.max(8, width - CHIP_W - 8);
    let cursor = STACK_PAD;
    const placed: PlacedLabel[] = sorted.map((r) => {
      let ly = Math.max(cursor, r.ay - CHIP_H / 2);
      if (ly + CHIP_H > h - STACK_PAD) ly = Math.max(STACK_PAD, h - STACK_PAD - CHIP_H);
      cursor = ly + CHIP_H + STACK_GAP;
      return { ...r, lx, ly };
    });
    setLabels(placed);
  }, []);

  const scheduleRelayout = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      relayout();
    });
  }, [relayout]);

  const redrawAnnotations = useCallback(() => {
    const series = seriesRef.current;
    if (!series) return;
    for (const l of priceLinesRef.current) series.removePriceLine(l);
    priceLinesRef.current = [];
    const markers: SeriesMarker<Time>[] = [];
    for (const a of annotationsRef.current) {
      if (a.kind === "level") {
        priceLinesRef.current.push(
          series.createPriceLine({ price: a.price, color: a.color, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "" }),
        );
      } else if (structureRef.current && a.kind === "zone") {
        // tracked in priceLinesRef so both edges are removed on the next redraw
        priceLinesRef.current.push(
          series.createPriceLine({ price: a.high, color: a.color, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: "" }),
          series.createPriceLine({ price: a.low, color: a.color, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: "" }),
        );
      } else if (structureRef.current && a.kind === "marker") {
        markers.push({ time: a.time as UTCTimestamp, position: a.position, color: a.color, shape: a.shape, text: "" });
      }
    }
    series.setMarkers(markers.sort((x, y) => (x.time as number) - (y.time as number)));
  }, []);

  const frameSetup = useCallback(() => {
    const chart = chartRef.current;
    const len = candlesRef.current.length;
    if (!chart || !len) return;
    const w = Math.min(SETUP_BARS, len);
    chart.timeScale().setVisibleLogicalRange({ from: len - w - 0.5, to: len - 0.5 + 2 });
  }, []);

  const applyData = useCallback(() => {
    const series = seriesRef.current;
    if (!series) return;
    try {
      series.setData(
        candlesRef.current.map((c): CandlestickData => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close })),
      );
    } catch {
      return; // unexpected bad data → leave the chart empty rather than throw
    }
    redrawAnnotations();
    frameSetup(); // default view: framed to the setup window, not the whole stream
    relayout();
  }, [redrawAnnotations, frameSetup, relayout]);

  const zoomBy = (factor: number) => {
    const chart = chartRef.current;
    if (!chart) return;
    const ts = chart.timeScale();
    const r = ts.getVisibleLogicalRange();
    if (!r) return;
    const center = (r.from + r.to) / 2;
    const half = Math.max(2, ((r.to - r.from) / 2) * factor);
    ts.setVisibleLogicalRange({ from: center - half, to: center + half });
    scheduleRelayout();
  };

  // first-view "what's a price level?" hint — once per device, one card per load
  useEffect(() => {
    let seen = false;
    try {
      seen = localStorage.getItem(HINT_KEY) === "1";
    } catch {
      seen = false;
    }
    if (seen || hintClaimedThisLoad || tradeLevels.length === 0) return;
    hintClaimedThisLoad = true;
    setShowHint(true);
  }, [tradeLevels.length]);

  const dismissHint = () => {
    setShowHint(false);
    try {
      localStorage.setItem(HINT_KEY, "1");
    } catch {
      /* ignore unavailable storage */
    }
  };

  // create the chart ONCE (so zooming/panning persists across parent renders)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = createChart(el, {
      width: el.clientWidth,
      height,
      layout: { background: { type: ColorType.Solid, color: "#0B0F19" }, textColor: "#8A93A8" },
      grid: { vertLines: { color: "rgba(39,48,74,0.5)" }, horzLines: { color: "rgba(39,48,74,0.5)" } },
      rightPriceScale: { borderColor: "#27304a" },
      timeScale: { borderColor: "#27304a", timeVisible: true, secondsVisible: false },
      crosshair: { mode: 0 },
      // zoom / navigate: wheel + pinch zoom, drag + horizontal touch pan
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    });
    const series = chart.addCandlestickSeries({
      upColor: "#00E676", downColor: "#FF1744", wickUpColor: "#00E676", wickDownColor: "#FF1744", borderVisible: false,
    });
    chartRef.current = chart;
    seriesRef.current = series;

    const onRange = () => scheduleRelayout();
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);

    const onCross = (param: Parameters<Parameters<IChartApi["subscribeCrosshairMove"]>[0]>[0]) => {
      const time = typeof param.time === "number" ? param.time : null;
      if (!param.point || time == null) {
        setReadout(null);
        return;
      }
      const price = series.coordinateToPrice(param.point.y);
      setReadout(price == null ? null : { price, time });
    };
    chart.subscribeCrosshairMove(onCross);

    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: el.clientWidth });
      scheduleRelayout();
    });
    ro.observe(el);

    applyData();

    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
      chart.unsubscribeCrosshairMove(onCross);
      ro.disconnect();
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      priceLinesRef.current = [];
    };
  }, [height, applyData, scheduleRelayout]);

  // data changed → reset candles + re-frame to the setup window
  useEffect(() => {
    if (chartRef.current) applyData();
  }, [candlesSig, applyData]);

  // annotations or the structure toggle changed → redraw marks WITHOUT re-framing
  useEffect(() => {
    if (!chartRef.current) return;
    redrawAnnotations();
    relayout();
  }, [annoSig, showStructure, redrawAnnotations, relayout]);

  if (safe.length === 0) {
    return <div className="grid h-[180px] w-full place-items-center text-xs text-muted">No structure to annotate for this window.</div>;
  }

  const btn =
    "grid h-6 w-6 place-items-center rounded border border-line bg-background/80 text-xs text-muted backdrop-blur transition hover:text-text";

  return (
    <div className={reduced ? "" : "motion-safe:animate-[fadeIn_.3s_ease-out]"}>
      <div className="relative w-full overflow-hidden rounded-lg border border-line" style={{ height }}>
        <div ref={containerRef} className="h-full w-full touch-pan-y" />

        {/* leader lines + label chips overlay (non-interactive) */}
        <div className="pointer-events-none absolute inset-0">
          <svg className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
            {labels.map((l) => (
              <g key={`lead-${l.id}`}>
                <line x1={l.ax} y1={l.ay} x2={l.lx} y2={l.ly + CHIP_H / 2} stroke={l.color} strokeWidth={1} opacity={0.7} />
                <circle cx={l.ax} cy={l.ay} r={2.5} fill={l.color} />
              </g>
            ))}
          </svg>
          {labels.map((l) => (
            <div
              key={`chip-${l.id}`}
              style={{ left: l.lx, top: l.ly, width: CHIP_W }}
              className="absolute rounded-md border border-line bg-background/85 px-1.5 py-1 backdrop-blur"
            >
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: l.color }} />
                <span className="text-[11px] font-semibold text-text">{l.label}</span>
                {l.price != null && <span className="ml-auto font-mono text-[10px] text-muted">{fmtPrice(l.price)}</span>}
              </div>
              {l.note && <p className="mt-0.5 text-[9px] leading-tight text-muted">{l.note}</p>}
            </div>
          ))}
        </div>

        {/* crosshair readout */}
        {readout && (
          <div className="pointer-events-none absolute left-2 top-2 rounded border border-line bg-background/85 px-2 py-1 font-mono text-[10px] text-text backdrop-blur">
            {fmtPrice(readout.price)} <span className="text-muted">· {fmtClock(readout.time)}</span>
          </div>
        )}

        {/* zoom toolbar */}
        <div className="absolute right-2 top-2 flex items-center gap-1">
          <button type="button" onClick={() => zoomBy(0.6)} aria-label="Zoom in" className={btn}>+</button>
          <button type="button" onClick={() => zoomBy(1.7)} aria-label="Zoom out" className={btn}>−</button>
          <button
            type="button"
            onClick={() => {
              frameSetup();
              scheduleRelayout();
            }}
            className="rounded border border-line bg-background/80 px-2 py-1 text-[10px] font-medium text-muted backdrop-blur transition hover:text-text"
          >
            Zoom to setup
          </button>
        </div>
      </div>

      {caption && <p className="mt-1 text-[11px] text-muted">{caption}</p>}

      {showHint && (
        <div className="mt-2 flex items-start gap-2 rounded-md border border-line bg-surface2/40 px-2.5 py-1.5 text-[11px] text-muted">
          <span aria-hidden="true">💡</span>
          <span>
            A price level{tradeLevels.length ? ` like ${fmtPrice(tradeLevels[0].price)}` : ""} is just a price on the chart —
            the labelled lines mark the exact price where you&apos;d act. Scroll to zoom, drag to pan.
          </span>
          <button onClick={dismissHint} aria-label="Dismiss tip" className="ml-auto shrink-0 text-muted hover:text-text">✕</button>
        </div>
      )}

      {/* trade plan — plain-language tags, always shown */}
      <ul className="mt-2 space-y-1">
        {tradeLevels.map((a, i) => (
          <li key={`trade-${a.label}-${i}`} className="flex items-start gap-2 text-[11px]">
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: a.color }} aria-hidden="true" />
            <span className="text-text">
              <span className="font-medium">{a.label}</span>{" "}
              <span className="font-mono text-muted">{fmtPrice(a.price)}</span>
              {" — "}
              <span className="text-muted">{a.note}</span>
            </span>
          </li>
        ))}
      </ul>

      {/* market structure — opt-in, deduped legend */}
      {structure.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowStructure((s) => !s)}
            aria-pressed={showStructure}
            className="text-[11px] font-medium text-neon hover:brightness-110"
          >
            {showStructure ? "Hide the structure ▾" : "Show the structure ▸"}
          </button>
          {showStructure && (
            <ul className="mt-1 space-y-1">
              {structureLegend.map((a, i) => (
                <li key={`struct-${a.label}-${i}`} className="flex items-start gap-2 text-[11px]">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: a.color }} aria-hidden="true" />
                  <span className="text-text"><span className="font-medium">{a.label}:</span> <span className="text-muted">{a.note}</span></span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
