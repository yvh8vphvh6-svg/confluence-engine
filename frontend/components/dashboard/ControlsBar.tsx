"use client";

import { useEffect, useRef, useState } from "react";

import { REGIME_LABEL } from "../../lib/format";
import { play, pause, step, stepBack } from "../../lib/stream";
import { useStore } from "../../lib/store";
import Controls from "./Controls";

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// Compact control rail. Shows the active setup as pills + a live transport, and
// tucks the full Controls (instrument / timeframe / regime / difficulty / seed /
// strategies / replay) into a slide-out drawer. Replaces the always-expanded
// desktop column AND the mobile hamburger — one calm bar on every viewport.
export default function ControlsBar() {
  const config = useStore((s) => s.config);
  const playing = useStore((s) => s.latestTick?.playing ?? false);

  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const prevOpen = useRef(false);

  // enter / leave animation lifecycle
  useEffect(() => {
    if (open) {
      setMounted(true);
      const raf = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(raf);
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), 200);
    return () => clearTimeout(t);
  }, [open]);

  // focus into the drawer on open, restore to the trigger on close
  useEffect(() => {
    if (open && panelRef.current) {
      panelRef.current.querySelector<HTMLElement>("button, a[href], select, input, textarea")?.focus();
    } else if (prevOpen.current && !open) {
      triggerRef.current?.focus();
    }
    prevOpen.current = open;
  }, [open, mounted]);

  // focus trap + Escape while open
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const f = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
      );
      if (f.length === 0) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const regime = config.regime_filter ? REGIME_LABEL[config.regime_filter] ?? config.regime_filter : "All regimes";

  return (
    <div data-tour="controls" className="panel flex flex-wrap items-center gap-2 p-2">
      {/* live transport (keyboard Space / ← / → also work) */}
      <div className="flex items-center gap-1">
        <button type="button" onClick={stepBack} aria-label="Step back" className="btn px-2 py-1">⏮</button>
        <button type="button" onClick={() => (playing ? pause() : play())} aria-label={playing ? "Pause" : "Play"} className="btn px-2.5 py-1">
          {playing ? "⏸" : "▶"}
        </button>
        <button type="button" onClick={step} aria-label="Step forward" className="btn px-2 py-1">⏭</button>
      </div>

      <span className="hidden h-5 w-px bg-line sm:block" />

      {/* active setup as pills — tap to change */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Edit setup"
        className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 rounded-lg px-1 py-1 text-left transition hover:bg-line/20"
      >
        <span className="chip border-line text-text">{config.symbol}</span>
        <span className="chip border-line text-text">{config.timeframe}</span>
        <span className="chip border-line text-muted">{regime}</span>
        <span className="chip border-line text-muted">{cap(config.difficulty)}</span>
        <span className="chip border-line text-muted">{config.strategies.length}/8 strategies</span>
      </button>

      <button ref={triggerRef} type="button" onClick={() => setOpen(true)} className="btn ml-auto">
        Edit ▸
      </button>

      {mounted && (
        <>
          <div
            onClick={() => setOpen(false)}
            aria-hidden="true"
            className={`fixed inset-0 z-40 bg-black/60 transition-opacity duration-200 ${shown ? "opacity-100" : "opacity-0"}`}
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Setup controls"
            className={`fixed inset-y-0 left-0 z-50 flex w-[88vw] max-w-[340px] flex-col overflow-y-auto border-r border-line bg-panel pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(0px,env(safe-area-inset-left))] transition duration-200 ease-out motion-reduce:transform-none ${shown ? "translate-x-0 opacity-100" : "-translate-x-full opacity-0"}`}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-panel px-4 py-3">
              <p className="panel-head">Setup</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close controls"
                className="flex h-11 w-11 items-center justify-center rounded-md text-muted transition hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4">
              <Controls />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
