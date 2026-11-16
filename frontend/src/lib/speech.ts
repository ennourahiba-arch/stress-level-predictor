// Voice for the oral exam, using the browser's own speech services.
// Speech-to-text: Chrome/Edge/Safari (in Chrome the audio is processed by Google). Not available in Firefox.
// Text-to-speech: the device's built-in voices, processed locally.
import { useCallback, useEffect, useRef, useState } from "react";

interface RecognitionResult { isFinal: boolean; 0: { transcript: string } }
interface RecognitionEvent { resultIndex: number; results: ArrayLike<RecognitionResult> }
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

const Ctor = (): RecognitionCtor | undefined =>
  typeof window === "undefined" ? undefined
    : ((window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }).SpeechRecognition
      ?? (window as unknown as { webkitSpeechRecognition?: RecognitionCtor }).webkitSpeechRecognition);

export const VOICE_LANGS = [
  { code: "", label: "Browser language" },
  { code: "en-US", label: "English" },
  { code: "fr-FR", label: "Français" },
  { code: "ar-SA", label: "العربية" },
  { code: "es-ES", label: "Español" },
  { code: "de-DE", label: "Deutsch" },
];

const LANG_KEY = "rehearsal:voiceLang";
export function useVoiceLang(): [string, (v: string) => void] {
  const [lang, setLang] = useState(() => { try { return localStorage.getItem(LANG_KEY) ?? ""; } catch { return ""; } });
  const set = (v: string) => { setLang(v); try { localStorage.setItem(LANG_KEY, v); } catch { /* ignore */ } };
  return [lang, set];
}

const ERRORS: Record<string, string> = {
  "not-allowed": "Microphone access is blocked. Allow it in your browser's site settings, or type your answer.",
  "service-not-allowed": "This browser doesn't allow voice input here. You can type your answer instead.",
  "no-speech": "I didn't hear anything. Check your microphone and try again.",
  "audio-capture": "No microphone was found on this device.",
  network: "Voice input needs an internet connection.",
  "language-not-supported": "Voice input doesn't support that language in this browser. Pick another, or type.",
};

/** Dictation into a text field. `onText` receives the full text (what was there before + what was said). */
export function useDictation(lang: string, onText: (t: string) => void) {
  const supported = !!Ctor();
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);

  const stop = useCallback(() => { rec.current?.stop(); }, []);

  const start = useCallback((base: string) => {
    const C = Ctor();
    if (!C) return;
    setError(null);
    const r = new C();
    r.lang = lang || navigator.language || "en-US";
    r.continuous = true;
    r.interimResults = true;
    const prefix = base && !/\s$/.test(base) ? base + " " : base;
    r.onresult = (e) => {
      let said = "";
      for (let i = 0; i < e.results.length; i++) said += e.results[i][0].transcript;
      onText(prefix + said.trim());
    };
    r.onerror = (e) => { if (e.error !== "aborted") setError(ERRORS[e.error] ?? "Voice input stopped. You can try again or type."); };
    r.onend = () => { setListening(false); rec.current = null; };
    rec.current = r;
    try { r.start(); setListening(true); } catch { setError("Voice input couldn't start. Try again, or type your answer."); }
  }, [lang, onText]);

  useEffect(() => () => rec.current?.abort(), []);
  return { supported, listening, error, start, stop };
}

/** Reads text aloud with the device's built-in voice. */
export const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window;
export function speak(text: string, lang: string) {
  if (!canSpeak()) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/\$/g, ""));
  if (lang) u.lang = lang;
  window.speechSynthesis.speak(u);
}
export function stopSpeaking() {
  if (canSpeak()) window.speechSynthesis.cancel();
}
