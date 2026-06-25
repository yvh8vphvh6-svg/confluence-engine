"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useStore } from "../lib/store";

type Item = { href: string; label: string };

// Primary modes shown as flat tabs
const MODES: Item[] = [
  { href: "/", label: "Practice" },
  { href: "/backtest", label: "Backtest" },
  { href: "/real", label: "Real Chart" },
  { href: "/real-mode", label: "Real Mode" },
];

// Grouped dropdown sections
const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: "Train",
    items: [
      { href: "/drills", label: "Decision Drills" },
      { href: "/pattern-drills", label: "Pattern Drills" },
      { href: "/compare", label: "Synthetic vs Real" },
      { href: "/scenarios", label: "Scenarios" },
      { href: "/psychology", label: "Psychology" },
      { href: "/strategy-lab", label: "Strategy Lab" },
    ],
  },
  {
    title: "Learn",
    items: [
      { href: "/glossary", label: "Glossary" },
      { href: "/strategies", label: "Strategies" },
      { href: "/indicators", label: "Indicators" },
      { href: "/anti-patterns", label: "Anti-Patterns" },
      { href: "/education", label: "Education" },
      { href: "/books", label: "Books" },
      { href: "/sources", label: "Sources" },
    ],
  },
  {
    title: "Track",
    items: [
      { href: "/journal", label: "Journal" },
      { href: "/library", label: "Pattern Library" },
      { href: "/risk-lab", label: "Risk Lab" },
      { href: "/performance", label: "Performance" },
      { href: "/progress", label: "Progression" },
      { href: "/context", label: "Market Context" },
      { href: "/validation", label: "Validation" },
    ],
  },
  {
    title: "Social",
    items: [
      { href: "/leaderboard", label: "Leaderboard" },
      { href: "/duels", label: "Duels" },
      { href: "/community", label: "Community" },
      { href: "/mentor", label: "Mentor Mode" },
      { href: "/success", label: "Success Stories" },
      { href: "/share", label: "Strategy Sharing" },
    ],
  },
];

function Dropdown({ title, items, pathname }: { title: string; items: Item[]; pathname: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const groupActive = items.some((i) => i.href === pathname);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // close the menu whenever the route changes
  useEffect(() => { setOpen(false); }, [pathname]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
          groupActive ? "bg-neon/10 text-neon" : "text-muted hover:text-text"
        }`}
      >
        {title} <span className="text-[8px]">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[170px] rounded-lg border border-line bg-panel p-1 shadow-xl">
          {items.map((i) => {
            const active = pathname === i.href;
            return (
              <Link
                key={i.href}
                href={i.href}
                className={`block rounded-md px-3 py-1.5 text-xs transition ${
                  active ? "bg-neon/10 text-neon" : "text-text hover:bg-line/40"
                }`}
              >
                {i.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function NavTabs() {
  const pathname = usePathname();
  const setLearnOpen = useStore((s) => s.setLearnOpen);

  return (
    <nav className="flex flex-wrap items-center gap-1" data-tour="nav">
      <button
        onClick={() => setLearnOpen(true)}
        className="rounded-lg bg-neon/15 px-3 py-1.5 text-xs font-semibold text-neon transition hover:bg-neon/25"
      >
        ⊞ Learn
      </button>
      <span className="mx-1 h-4 w-px bg-line" />
      {MODES.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              active ? "bg-neon/10 text-neon" : "text-text hover:text-neon"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
      <span className="mx-1 h-4 w-px bg-line" />
      {GROUPS.map((g) => (
        <Dropdown key={g.title} title={g.title} items={g.items} pathname={pathname} />
      ))}
    </nav>
  );
}
