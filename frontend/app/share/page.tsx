"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { getCustomStrategies, logStrategyImport, saveCustomStrategy, type CustomStrategy } from "../../lib/api";

const PREFIX = "CE1:"; // portable share-code marker

function encodeStrategy(s: CustomStrategy): string {
  return PREFIX + btoa(encodeURIComponent(JSON.stringify(s)));
}

function decodeStrategy(raw: string): CustomStrategy {
  const text = raw.trim();
  const body = text.startsWith(PREFIX) ? text.slice(PREFIX.length) : text;
  // accept either a CE1: code or raw JSON
  const json = body.startsWith("{") ? body : decodeURIComponent(atob(body));
  const o = JSON.parse(json) as Partial<CustomStrategy>;
  if (!o || typeof o.name !== "string" || !o.name.trim()) throw new Error("missing strategy name");
  return {
    name: o.name.trim(),
    family: typeof o.family === "string" ? o.family : "custom",
    description: typeof o.description === "string" ? o.description : "",
    conditions: Array.isArray(o.conditions) ? o.conditions.map(String) : [],
    entry_trigger: typeof o.entry_trigger === "string" ? o.entry_trigger : "",
    stop_logic: typeof o.stop_logic === "string" ? o.stop_logic : "",
    target_rr: typeof o.target_rr === "number" ? o.target_rr : 2,
    sizing: typeof o.sizing === "string" ? o.sizing : "1% risk",
    timeframes: Array.isArray(o.timeframes) ? o.timeframes.map(String) : [],
    notes: typeof o.notes === "string" ? o.notes : "",
  };
}

function download(name: string, content: string) {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

export default function SharePage() {
  const [strategies, setStrategies] = useState<(CustomStrategy & { id: number })[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [code, setCode] = useState("");
  const [importText, setImportText] = useState("");
  const [preview, setPreview] = useState<CustomStrategy | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  const loadList = useCallback(() => {
    getCustomStrategies().then((d) => setStrategies(d.strategies)).catch(() => undefined);
  }, []);
  useEffect(() => loadList(), [loadList]);

  const doExport = () => {
    const s = strategies.find((x) => x.name === selected);
    if (!s) return;
    const clean: CustomStrategy = {
      name: s.name, family: s.family, description: s.description, conditions: s.conditions,
      entry_trigger: s.entry_trigger, stop_logic: s.stop_logic, target_rr: s.target_rr,
      sizing: s.sizing, timeframes: s.timeframes, notes: s.notes,
    };
    setCode(encodeStrategy(clean));
  };

  const parseImport = (raw: string) => {
    setErr(""); setMsg(""); setPreview(null);
    try {
      setPreview(decodeStrategy(raw));
    } catch (e) {
      setErr(`Couldn't read that strategy: ${e instanceof Error ? e.message : "invalid format"}`);
    }
  };

  const onFile = (f: File | null) => {
    if (!f) return;
    f.text().then((t) => { setImportText(t); parseImport(t); }).catch(() => setErr("couldn't read file"));
  };

  const saveImported = async () => {
    if (!preview) return;
    try {
      await saveCustomStrategy(preview);
      await logStrategyImport({ name: preview.name, origin: "share" }).catch(() => undefined);
      setMsg(`Saved "${preview.name}" — it's now a usable custom strategy in Strategy Lab.`);
      setPreview(null); setImportText("");
      loadList();
    } catch (e) {
      setErr(`Save failed: ${e instanceof Error ? e.message : "error"}`);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header>
        <h1 className="font-display text-xl font-semibold text-text">Strategy Sharing</h1>
        <p className="text-sm text-muted">Export a custom strategy as a portable code or file; import one to use it. No server, no account.</p>
      </header>

      <div className="panel p-4">
        <p className="panel-head mb-2">Export</p>
        {strategies.length === 0 ? (
          <p className="text-xs text-muted">No custom strategies yet — build one in Strategy Lab, then export it here.</p>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <select value={selected} onChange={(e) => setSelected(e.target.value)} className="rounded-lg border border-line bg-black/30 px-2 py-1.5 text-xs">
                <option value="">Choose a strategy…</option>
                {strategies.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
              <button onClick={doExport} disabled={!selected} className="btn text-[11px] disabled:opacity-40">Generate code</button>
              {code && <button onClick={() => download(`${selected || "strategy"}.json`, JSON.stringify(decodeStrategy(code), null, 2))} className="btn text-[11px]">Download JSON</button>}
            </div>
            {code && (
              <div>
                <textarea readOnly value={code} rows={3} className="w-full break-all rounded-lg border border-line bg-black/30 px-2 py-1.5 font-mono text-[11px]" />
                <button onClick={() => navigator.clipboard?.writeText(code).then(() => setMsg("Code copied."), () => undefined)} className="btn mt-1 text-[11px]">Copy code</button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="panel p-4">
        <p className="panel-head mb-2">Import</p>
        <textarea
          value={importText}
          onChange={(e) => { setImportText(e.target.value); parseImport(e.target.value); }}
          rows={3}
          placeholder="Paste a CE1: code or strategy JSON…"
          className="w-full break-all rounded-lg border border-line bg-black/30 px-2 py-1.5 font-mono text-[11px]"
        />
        <div className="mt-2 flex items-center gap-2">
          <input ref={fileRef} type="file" accept="application/json,.json,.txt" onChange={(e) => onFile(e.target.files?.[0] ?? null)} className="hidden" />
          <button onClick={() => fileRef.current?.click()} className="btn text-[11px]">Load file</button>
        </div>
        {err && <p className="mt-2 text-xs text-loss">{err}</p>}
        {preview && (
          <div className="mt-3 rounded-lg border border-neon/40 bg-neon/5 p-3 text-xs">
            <p className="font-semibold text-text">{preview.name} <span className="text-muted">· {preview.family} · R:R {preview.target_rr}</span></p>
            {preview.description && <p className="mt-1 text-muted">{preview.description}</p>}
            {preview.conditions.length > 0 && <p className="mt-1 text-muted">Conditions: {preview.conditions.join("; ")}</p>}
            <button onClick={saveImported} className="mt-2 rounded-lg bg-neon px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110">Save as custom strategy</button>
          </div>
        )}
        {msg && <p className="mt-2 text-xs text-profit">{msg}</p>}
      </div>
      <p className="text-[10px] text-muted">Round-trip: export here → share the code/file → import → save → trade it in Practice and track it in Strategy Lab.</p>
    </div>
  );
}
