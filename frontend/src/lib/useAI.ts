import { useEffect, useState } from "react";
import { api, type AIStatus } from "./api";
import { getKV, setKV } from "./storage";

export const PROVIDER_NAME: Record<string, string> = { gemini: "Google Gemini", anthropic: "Anthropic Claude", fake: "the simulated test AI" };

/** Server AI status plus the user's one-time consent to send lesson text to the AI provider. */
export function useAI() {
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [consent, setConsentState] = useState(false);
  useEffect(() => {
    api.aiStatus().then(setStatus).catch((e) => setError(e.message));
    getKV<boolean>("aiConsent").then((v) => setConsentState(!!v));
  }, []);
  const setConsent = (v: boolean) => { setConsentState(v); setKV("aiConsent", v); };
  const provider = PROVIDER_NAME[status?.provider ?? ""] ?? "the AI provider";
  return { status, error, consent, setConsent, provider };
}
