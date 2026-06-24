"use client";

import { useEffect, useRef } from "react";

import { useSettings } from "../lib/settings";
import { readAccentRgb, THEME_CHANGE_EVENT } from "../lib/themes";
import { useMediaQuery } from "../lib/useMediaQuery";
import { useReducedMotion } from "../lib/useMotion";

type Star = { x: number; y: number; z: number; r: number };

// Fixed full-screen depth-layered starfield + nebula glow in the active accent.
// Off when the Settings toggle is off, on touch (hover:none), or reduced-motion.
export default function AmbientBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const noHover = useMediaQuery("(hover: none)");
  const reduced = useReducedMotion();
  const wanted = useSettings((s) => s.settings.ambientBackground);
  const enabled = wanted && !noHover && !reduced;

  useEffect(() => {
    if (!enabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let accent = readAccentRgb();
    let stars: Star[] = [];
    let w = 0;
    let h = 0;
    let raf = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // cap node count by area so big screens don't explode
      const count = Math.min(140, Math.floor((w * h) / 14000));
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        z: 0.3 + Math.random() * 0.7, // depth: smaller/slower = farther
        r: 0.4 + Math.random() * 1.4,
      }));
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      const [ar, ag, ab] = accent;

      // nebula: two slow radial glows in the accent color
      const t = raf * 0.0004;
      const blobs = [
        { x: w * (0.25 + 0.05 * Math.sin(t)), y: h * (0.3 + 0.04 * Math.cos(t * 0.8)), rad: Math.max(w, h) * 0.45 },
        { x: w * (0.78 + 0.04 * Math.cos(t * 1.1)), y: h * (0.65 + 0.05 * Math.sin(t)), rad: Math.max(w, h) * 0.4 },
      ];
      for (const b of blobs) {
        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.rad);
        g.addColorStop(0, `rgba(${ar}, ${ag}, ${ab}, 0.06)`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }

      // depth-layered starfield drifting slowly down-right
      for (const s of stars) {
        s.x += s.z * 0.12;
        s.y += s.z * 0.06;
        if (s.x > w) s.x = 0;
        if (s.y > h) s.y = 0;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * s.z, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${ar}, ${ag}, ${ab}, ${0.12 + s.z * 0.35})`;
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    };

    const onTheme = () => {
      accent = readAccentRgb();
    };

    resize();
    raf = requestAnimationFrame(draw);
    window.addEventListener("resize", resize);
    window.addEventListener(THEME_CHANGE_EVENT, onTheme);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener(THEME_CHANGE_EVENT, onTheme);
    };
  }, [enabled]);

  if (!enabled) return null;
  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 opacity-60"
    />
  );
}
