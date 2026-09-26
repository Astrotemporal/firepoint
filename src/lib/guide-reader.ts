import { SPEECH_LANG, type SpeechPassage } from "@/domain/guide-speech";

/*
 * On-device read-aloud for the /prepare guide, built on the browser's Web Speech API (speechSynthesis).
 * It speaks only the exact passages it is given, never before an explicit user action, and it is
 * written against small structural types so tests can drive it without a browser. No network, no
 * server, no microphone: nothing leaves the device except whatever the browser's own voice engine does.
 */

export type VoiceLike = { readonly name: string; readonly lang: string; readonly localService: boolean; readonly default: boolean };
export type UtteranceEvent = { readonly type: string; readonly error?: string };
export interface UtteranceLike {
  text: string;
  lang: string;
  voice: VoiceLike | null;
  addEventListener(type: "start" | "end" | "error", listener: (event: UtteranceEvent) => void): void;
}
export interface SpeechEngineLike {
  speak(utterance: UtteranceLike): void;
  cancel(): void;
  pause(): void;
  resume(): void;
  getVoices(): readonly VoiceLike[];
}
export type SpeechHost = { speechSynthesis?: SpeechEngineLike; SpeechSynthesisUtterance?: new (text: string) => UtteranceLike };

export type SpeechSupport =
  | { kind: "unsupported" }
  | { kind: "no-english-voice" }
  | { kind: "ready"; voice: VoiceLike | null };

/** Prefer a voice that runs on the device, then any English voice; null lets the engine pick by `lang`. */
export function pickEnglishVoice(voices: readonly VoiceLike[]): VoiceLike | null {
  const english = voices.filter((voice) => /^en([-_]|$)/i.test(voice.lang));
  return english.find((voice) => voice.localService && voice.default) ?? english.find((voice) => voice.localService) ?? english[0] ?? null;
}

/**
 * Whether this browser can read English aloud. An empty voice list is not proof of absence (Chrome
 * fills it in later), so only a non-empty list with no English voice counts as "no English voice".
 */
export function detectSpeechSupport(host: SpeechHost): SpeechSupport {
  const engine = host.speechSynthesis;
  if (!engine || typeof host.SpeechSynthesisUtterance !== "function" || typeof engine.speak !== "function") return { kind: "unsupported" };
  const voices = engine.getVoices();
  const voice = pickEnglishVoice(voices);
  if (voices.length > 0 && !voice) return { kind: "no-english-voice" };
  return { kind: "ready", voice };
}

export type ReaderState =
  | { status: "idle" }
  | { status: "playing"; section: string }
  | { status: "paused"; section: string }
  | { status: "ended" }
  | { status: "failed" };

export interface GuideReader {
  readonly state: ReaderState;
  /** Queues every passage, in order. Only ever called from a user action. */
  play(): void;
  pause(): void;
  resume(): void;
  /** Cancels everything queued. Safe to call repeatedly, and on unmount. */
  stop(): void;
}

// Browsers report these when *we* cancel; they are not failures.
const CANCELLED = new Set(["interrupted", "canceled"]);

export function createGuideReader(options: {
  engine: SpeechEngineLike;
  createUtterance: (text: string) => UtteranceLike;
  passages: readonly SpeechPassage[];
  voice: VoiceLike | null;
  onChange?: (state: ReaderState) => void;
}): GuideReader {
  const { engine, createUtterance, passages, voice, onChange } = options;
  let state: ReaderState = { status: "idle" };
  let generation = 0;
  const set = (next: ReaderState) => { state = next; onChange?.(next); };

  const stop = () => {
    generation += 1;
    engine.cancel();
    set({ status: "idle" });
  };

  const play = () => {
    stop();
    const run = generation;
    const parts = passages.flatMap((passage) => passage.parts.map((text) => ({ section: passage.section, text })));
    const last = parts.length - 1;
    if (last < 0) return;
    parts.forEach(({ section, text }, i) => {
      const utterance = createUtterance(text);
      utterance.text = text;
      utterance.lang = SPEECH_LANG;
      utterance.voice = voice;
      utterance.addEventListener("start", () => { if (run === generation) set({ status: "playing", section }); });
      utterance.addEventListener("end", () => { if (run === generation && i === last) set({ status: "ended" }); });
      utterance.addEventListener("error", (event) => {
        if (run !== generation || CANCELLED.has(event.error ?? "")) return;
        generation += 1;
        engine.cancel();
        set({ status: "failed" });
      });
      engine.speak(utterance);
    });
  };

  const pause = () => {
    if (state.status !== "playing") return;
    engine.pause();
    set({ status: "paused", section: state.section });
  };

  const resume = () => {
    if (state.status !== "paused") return;
    engine.resume();
    set({ status: "playing", section: state.section });
  };

  return { get state() { return state; }, play, pause, resume, stop };
}
