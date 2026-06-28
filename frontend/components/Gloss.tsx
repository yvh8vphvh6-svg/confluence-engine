"use client";

import { GLOSS } from "../lib/teach";

// A jargon term with a plain-language tooltip. Wrap the visible text:
//   <Gloss k="R">+0.28R</Gloss>
// Renders a dotted-underline span; hover/focus (and the native title) reveals the
// plain-English meaning, so a first-timer is never staring at a number cold.
export function Gloss({ k, children }: { k: keyof typeof GLOSS; children: React.ReactNode }) {
  const text = GLOSS[k];
  return (
    <span
      tabIndex={0}
      title={text}
      aria-label={text}
      className="cursor-help underline decoration-dotted decoration-muted/60 underline-offset-2 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
    >
      {children}
    </span>
  );
}

// A standalone "what does this mean?" note for a concept, shown inline. Use when
// there's no single word to underline (e.g. under a row of stats).
export function GlossNote({ k, className = "" }: { k: keyof typeof GLOSS; className?: string }) {
  return <p className={`text-[10px] leading-snug text-muted ${className}`}>{GLOSS[k]}</p>;
}
