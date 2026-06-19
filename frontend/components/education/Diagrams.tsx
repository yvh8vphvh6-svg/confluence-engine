"use client";

import dynamic from "next/dynamic";

const ConceptChart = dynamic(() => import("./ConceptChart"), { ssr: false });

// Hand-built illustrative candle series (not market data — teaching diagrams).
const FVG = [
  { o: 100, h: 101, l: 99.5, c: 100.5 },
  { o: 100.5, h: 101, l: 100, c: 100.8 },
  { o: 100.8, h: 104.5, l: 100.7, c: 104.2 }, // displacement up
  { o: 104.2, h: 104.6, l: 102.6, c: 103.2 }, // leaves gap above 101
  { o: 103.2, h: 103.4, l: 101.1, c: 101.4 }, // retrace into gap
  { o: 101.4, h: 103.8, l: 101.2, c: 103.6 }, // continuation
  { o: 103.6, h: 105, l: 103.4, c: 104.8 },
];

const OB = [
  { o: 102, h: 102.4, l: 101.6, c: 101.8 },
  { o: 101.8, h: 102, l: 101.2, c: 101.3 }, // last down candle (the OB)
  { o: 101.3, h: 105, l: 101.2, c: 104.8 }, // impulsive up move
  { o: 104.8, h: 105.2, l: 103, c: 103.4 },
  { o: 103.4, h: 103.6, l: 101.5, c: 101.7 }, // mitigation back to OB
  { o: 101.7, h: 104.5, l: 101.6, c: 104.2 },
  { o: 104.2, h: 106, l: 104, c: 105.6 },
];

const ORB = [
  { o: 100, h: 101.5, l: 99.2, c: 100.8 }, // opening range builds
  { o: 100.8, h: 101.4, l: 100.1, c: 100.3 },
  { o: 100.3, h: 101.3, l: 99.8, c: 101.0 },
  { o: 101.0, h: 102.6, l: 100.9, c: 102.4 }, // breakout above OR high
  { o: 102.4, h: 103.5, l: 102.2, c: 103.3 },
  { o: 103.3, h: 104.4, l: 103.1, c: 104.1 },
];

const BOS = [
  { o: 100, h: 101.4, l: 99.8, c: 100.4 },
  { o: 100.4, h: 101.8, l: 100.2, c: 101.6 }, // prior swing high ~101.8
  { o: 101.6, h: 101.9, l: 100.6, c: 100.9 },
  { o: 100.9, h: 101.2, l: 100.0, c: 100.3 },
  { o: 100.3, h: 102.6, l: 100.2, c: 102.4 }, // breaks structure above 101.8
  { o: 102.4, h: 102.8, l: 101.4, c: 101.7 }, // pullback
  { o: 101.7, h: 103.6, l: 101.6, c: 103.3 }, // continuation
];

export function FvgDiagram() {
  return <ConceptChart candles={FVG} zones={[{ low: 101.0, high: 102.6, color: "#4ECBFF", label: "FVG" }]} marks={[{ i: 4, price: 101.4, color: "#00E676", text: "limit fill" }]} />;
}
export function OrderBlockDiagram() {
  return <ConceptChart candles={OB} zones={[{ low: 101.2, high: 102.0, color: "#7C3AED", label: "OB" }]} marks={[{ i: 4, price: 101.7, color: "#00E676", text: "mitigation" }]} />;
}
export function OpeningRangeDiagram() {
  return <ConceptChart candles={ORB} zones={[{ low: 99.2, high: 101.5, color: "#FFD600", label: "OR" }]} marks={[{ i: 3, price: 102.4, color: "#00E676", text: "break" }]} />;
}
export function BosDiagram() {
  return <ConceptChart candles={BOS} zones={[{ low: 101.75, high: 101.85, color: "#8A93A8", label: "prior swing" }]} marks={[{ i: 4, price: 102.4, color: "#00E676", text: "BOS" }]} />;
}

export function EquityCurveDiagram() {
  const pts = [0, 0.8, -0.4, 1.2, 2.1, 1.6, 2.8, 2.2, 3.4, 4.1, 3.6, 4.9];
  const W = 360, H = 120, pad = 6;
  const min = Math.min(...pts), max = Math.max(...pts);
  const sx = (i: number) => pad + ((W - 2 * pad) * i) / (pts.length - 1);
  const sy = (v: number) => H - pad - ((H - 2 * pad) * (v - min)) / (max - min || 1);
  let d = `M ${sx(0)} ${sy(pts[0])}`;
  pts.forEach((v, i) => (d += ` L ${sx(i)} ${sy(v)}`));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ height: 120 }}>
      <line x1="0" y1={sy(0)} x2={W} y2={sy(0)} stroke="#27304a" strokeDasharray="3 3" />
      <path d={d} fill="none" stroke="#00E676" strokeWidth="1.8" />
    </svg>
  );
}

export function WinRateExpectancyDiagram() {
  // illustrative scatter: win rate (x) vs expectancy (y); color by sign
  const W = 360, H = 160, pad = 24;
  const pts = [
    { wr: 0.35, e: 0.4 },
    { wr: 0.45, e: 0.15 },
    { wr: 0.55, e: -0.05 },
    { wr: 0.62, e: 0.08 },
    { wr: 0.7, e: -0.12 },
    { wr: 0.5, e: 0.0 },
    { wr: 0.4, e: 0.25 },
  ];
  const sx = (wr: number) => pad + (W - 2 * pad) * wr;
  const sy = (e: number) => H / 2 - e * 180;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 160 }}>
      <line x1={pad} y1={H / 2} x2={W - 4} y2={H / 2} stroke="#27304a" />
      <line x1={pad} y1={6} x2={pad} y2={H - 6} stroke="#27304a" />
      <text x={W - 4} y={H / 2 + 12} fontSize="9" fill="#8A93A8" textAnchor="end">
        win rate →
      </text>
      <text x={pad + 4} y={14} fontSize="9" fill="#8A93A8">
        + expectancy
      </text>
      {pts.map((p, i) => (
        <circle key={i} cx={sx(p.wr)} cy={sy(p.e)} r="5" fill={p.e > 0 ? "#00E676" : "#FF1744"} opacity="0.85" />
      ))}
    </svg>
  );
}
