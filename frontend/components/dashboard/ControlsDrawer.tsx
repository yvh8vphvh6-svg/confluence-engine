"use client";

import { useEffect, useRef, useState } from "react";

import Controls from "./Controls";

// Mobile-only: a hamburger button that opens the strategy/timeframe/regime
// Controls in a left slide-over drawer. On md+ the Controls render inline as a
// column (see app/page.tsx) and this whole component is hidden.
export default function ControlsDrawer() {
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
      const focusables = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
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

  return (
    <div className="md:hidden">
      <button
        ref={triggerRef}
        type="button"
        aria-label="Open controls"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="btn flex min-h-[44px] items-center gap-2"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
        Controls
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
            aria-label="Controls"
            className={`fixed inset-y-0 left-0 z-50 flex w-[82vw] max-w-[320px] flex-col overflow-y-auto border-r border-line bg-panel pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(0px,env(safe-area-inset-left))] transition duration-200 ease-out motion-reduce:transform-none ${shown ? "translate-x-0 opacity-100" : "-translate-x-full opacity-0"}`}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-panel px-4 py-3">
              <p className="panel-head">Controls</p>
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
