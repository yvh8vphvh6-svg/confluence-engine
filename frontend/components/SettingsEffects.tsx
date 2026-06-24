"use client";

import { useEffect } from "react";

import { useSettings } from "../lib/settings";

// Applies globally-scoped settings to the document. (Sim/coach wiring lives in
// the dashboard where the store/stream are used.)
export default function SettingsEffects() {
  const density = useSettings((s) => s.settings.density);

  // load persisted settings after mount (store uses skipHydration to keep the
  // first render in sync with the server-rendered HTML)
  useEffect(() => {
    void useSettings.persist.rehydrate();
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-density", density);
  }, [density]);

  return null;
}
