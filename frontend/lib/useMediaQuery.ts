"use client";

import { useEffect, useState } from "react";

// SSR-safe media query hook. Starts `false` on the server / first paint, then
// syncs to the real match after mount and on change.
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
