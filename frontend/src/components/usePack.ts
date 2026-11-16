import { useCallback, useEffect, useMemo, useState } from "react";
import { useT } from "../i18n";
import { loadPack, localizePack } from "../lib/pack";
import type { Pack } from "../lib/types";

/** The Calculus question bank, in the interface language. */
export function usePack() {
  const { lang, t } = useT();
  const [raw, setRaw] = useState<Pack | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    loadPack().then(setRaw).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);
  const pack = useMemo(() => (raw ? localizePack(raw, lang) : null), [raw, lang]);
  return { pack, error: error && t(error), retry: load };
}
