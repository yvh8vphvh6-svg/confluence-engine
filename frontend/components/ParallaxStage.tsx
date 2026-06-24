"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

import { useSettings } from "../lib/settings";
import { useMediaQuery } from "../lib/useMediaQuery";
import { useReducedMotion } from "../lib/useMotion";

const MAX_DEG = 4; // gentle
const EASE = 0.08; // spring follow factor

// Wraps dashboard cards and applies a gentle ambient mouse-follow 3D tilt by
// writing spring-eased `--rx`/`--ry` (cascading to `.tilt3d` descendants).
// Cards opt in with `.tilt3d`; the chart panel omits it so candles stay flat.
// Disabled on touch + reduced-motion (no listener, no transform).
export default function ParallaxStage({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const noHover = useMediaQuery("(hover: none)");
  const reduced = useReducedMotion();
  const wanted = useSettings((s) => s.settings.parallaxTilt);
  const enabled = wanted && !noHover && !reduced;

  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;

    let targetX = 0;
    let targetY = 0;
    let curX = 0;
    let curY = 0;
    let raf: number | null = null;

    const clamp = (v: number) => Math.max(-1, Math.min(1, v));

    const loop = () => {
      curX += (targetX - curX) * EASE;
      curY += (targetY - curY) * EASE;
      el.style.setProperty("--rx", `${curX.toFixed(2)}deg`);
      el.style.setProperty("--ry", `${curY.toFixed(2)}deg`);
      if (Math.abs(targetX - curX) > 0.01 || Math.abs(targetY - curY) > 0.01) {
        raf = requestAnimationFrame(loop);
      } else {
        raf = null;
      }
    };

    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const nx = clamp((e.clientX - (rect.left + rect.width / 2)) / (rect.width / 2));
      const ny = clamp((e.clientY - (rect.top + rect.height / 2)) / (rect.height / 2));
      targetY = nx * MAX_DEG; // horizontal cursor → rotateY
      targetX = -ny * MAX_DEG; // vertical cursor → rotateX (inverted)
      if (raf === null) raf = requestAnimationFrame(loop);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (raf !== null) cancelAnimationFrame(raf);
      el.style.removeProperty("--rx");
      el.style.removeProperty("--ry");
    };
  }, [enabled]);

  const style = { "--rx": "0deg", "--ry": "0deg" } as CSSProperties;
  return (
    <div ref={ref} data-tilt={enabled ? "on" : undefined} style={style} className={className}>
      {children}
    </div>
  );
}
