"use client";

export default function EquityCurve({ curve }: { curve: number[] }) {
  const data = curve.length ? curve : [0];
  const W = 320;
  const H = 90;
  const pad = 4;
  const min = Math.min(0, ...data);
  const max = Math.max(0.0001, ...data);
  const sx = (i: number) => pad + (W - 2 * pad) * (data.length < 2 ? 0 : i / (data.length - 1));
  const sy = (v: number) => H - pad - (H - 2 * pad) * ((v - min) / (max - min));
  const zero = sy(0);
  let d = `M ${sx(0)} ${sy(data[0])}`;
  for (let i = 1; i < data.length; i++) d += ` L ${sx(i)} ${sy(data[i])}`;
  const up = data[data.length - 1] >= 0;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-[90px] w-full">
      <line x1="0" y1={zero} x2={W} y2={zero} stroke="#27304a" strokeDasharray="3 3" />
      <path d={d} fill="none" stroke={up ? "#00E676" : "#FF1744"} strokeWidth="1.6" />
    </svg>
  );
}
