"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";

import { GLOSSARY, GLOSSARY_CATEGORIES, type GlossaryCategory } from "../../lib/glossary";
import { PATTERN_DEMOS } from "../../lib/patternDemos";

// Heavy chart lib loads only when a demo is expanded.
const PatternDemo = dynamic(() => import("../../components/PatternDemo"), { ssr: false });

function GlossaryDemo({ term }: { term: string }) {
  const demo = PATTERN_DEMOS[term];
  const [open, setOpen] = useState(false);
  if (!demo) return null;
  return (
    <div className="mt-2 border-t border-line/60 pt-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-xs font-medium text-neon hover:brightness-110"
      >
        {open ? "Hide example ▾" : "Show example ▸"}
      </button>
      {open && (
        <div className="mt-2">
          {demo.caption && <p className="mb-1.5 text-[11px] text-muted">{demo.caption}</p>}
          <PatternDemo bars={demo.bars} zones={demo.zones} marks={demo.marks} />
        </div>
      )}
    </div>
  );
}

export default function GlossaryPage() {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<GlossaryCategory | "All">("All");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return GLOSSARY.filter((t) => {
      if (cat !== "All" && t.category !== cat) return false;
      if (!needle) return true;
      return (t.term + t.definition + t.why + t.example).toLowerCase().includes(needle);
    });
  }, [q, cat]);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-text">Glossary</h1>
        <p className="text-sm text-muted">
          {GLOSSARY.length} terms across {GLOSSARY_CATEGORIES.length} categories — plain definitions, why it
          matters, and an example. Education only, not financial advice.
        </p>
      </header>

      <div className="panel sticky top-16 z-10 flex flex-wrap items-center gap-2 p-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search terms…"
          className="min-w-[160px] flex-1 rounded-lg border border-line bg-black/30 px-3 py-1.5 text-sm"
        />
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setCat("All")} className={`chip ${cat === "All" ? "border-neon/60 text-neon" : "text-muted"}`}>All</button>
          {GLOSSARY_CATEGORIES.map((c) => (
            <button key={c} onClick={() => setCat(c)} className={`chip ${cat === c ? "border-neon/60 text-neon" : "text-muted"}`}>{c}</button>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted">{filtered.length} term{filtered.length === 1 ? "" : "s"}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {filtered.map((t) => (
          <div key={t.term} className="panel p-4">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-sm font-semibold text-text">{t.term}</h2>
              <span className="chip shrink-0 border-line text-muted">{t.category}</span>
            </div>
            <p className="mt-2 text-sm text-text">{t.definition}</p>
            <p className="mt-2 text-xs text-muted"><span className="font-medium text-neon">Why it matters:</span> {t.why}</p>
            <p className="mt-1 text-xs text-muted"><span className="font-medium text-warn">Example:</span> {t.example}</p>
            <GlossaryDemo term={t.term} />
          </div>
        ))}
        {filtered.length === 0 && <p className="text-sm text-muted">No terms match.</p>}
      </div>
    </div>
  );
}
