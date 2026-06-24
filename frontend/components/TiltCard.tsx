"use client";

import type { ReactNode } from "react";

// A lightweight glass TILE (for metric tiles nested inside a panel) that
// participates in the ambient ParallaxStage tilt. Uses a translucent surface +
// subtle blur + hover glow in the theme accent. `.tilt3d` is a no-op outside a
// stage or on touch/reduced-motion. (Top-level cards use `.panel` directly.)
export default function TiltCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`tilt3d rounded-lg border border-line/70 bg-surface2/50 backdrop-blur-[2px] transition-shadow hover:shadow-[0_0_18px_rgb(var(--gl)/0.18)] ${className}`}
    >
      {children}
    </div>
  );
}
