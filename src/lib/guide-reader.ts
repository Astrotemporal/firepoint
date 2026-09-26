import { SPEECH_LANG, type SpeechPassage } from "@/domain/guide-speech";

/*
 * On-device read-aloud for the /prepare guide, built on the browser's Web Speech API (speechSynthesis).
 * It speaks only the exact passages it is given, never before an explicit user action, and it is
 * written against small structural types so tests can drive it without a browser. No network, no
 * server, no microphone, and only voices the browser reports as on-device: no network voice is ever used.
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
  | { kind: "loading" }
  | { kind: "no-local-english-voice" }
  | { kind: "ready"; voice: VoiceLike };

/**
 * Only a voice that the browser reports as running on the device (`localService`) and speaking English
 * qualifies. Network voices (for example Chrome's "Google …" voices) would send the text to a vendor,
 * so they are never used: no voice means no audio.
 */
export function pickLocalEnglishVoice(voices: readonly VoiceLike[]): VoiceLike | null {
  const local = voices.filter((voice) => voice.localService === true && /^en([-_]|$)/i.test(voice.lang));
  return local.find((voice) => voice.default) ?? local[0] ?? null;
}

/**
 * Fail closed. The API must exist, the voice list must be known (Chrome fills it in after
 * `voiceschanged`; until then the state is "loading", not ready), and it must contain an on-device
 * English voice. The engine is never left to pick a voice by itself.
 */
export function detectSpeechSupport(host: SpeechHost): SpeechSupport {
  const engine = host.speechSynthesis;
  if (!engine || typeof host.SpeechSynthesisUtterance !== "function" || typeof engine.speak !== "function") return { kind: "unsupported" };
  const voices = engine.getVoices();
  if (voices.length === 0) return { kind: "loading" };
  const voice = pickLocalEnglishVoice(voices);
  return voice ? { kind: "ready", voice } : { kind: "no-local-english-voice" };
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
  voice: VoiceLike;
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
    const parts = passages.flatMap((passage) => passage.parts.map((text) => ({ section: passage.section, text })));
    const last = parts.length - 1;
    if (last < 0) return;
    try {
      parts.forEach(({ section, text }, i) => speakPart(section, text, i === last));
    } catch {
      // A browser that rejects the voice or utterance gets the same honest failure as a mid-read error.
      generation += 1;
      engine.cancel();
      set({ status: "failed" });
    }
  };

  function speakPart(section: string, text: string, isLast: boolean) {
    const run = generation;
    const utterance = createUtterance(text);
    utterance.text = text;
    utterance.lang = SPEECH_LANG;
    utterance.voice = voice;
    utterance.addEventListener("start", () => { if (run === generation) set({ status: "playing", section }); });
    utterance.addEventListener("end", () => { if (run === generation && isLast) set({ status: "ended" }); });
    utterance.addEventListener("error", (event) => {
      if (run !== generation || CANCELLED.has(event.error ?? "")) return;
      generation += 1;
      engine.cancel();
      set({ status: "failed" });
    });
    engine.speak(utterance);
  }

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

/**
 * The only way the UI obtains a reader: re-checks support at tap time and returns null (speaking
 * nothing) unless an on-device English voice is confirmed right now.
 */
export function openGuideReader(host: SpeechHost, passages: readonly SpeechPassage[], onChange?: (state: ReaderState) => void): GuideReader | null {
  const support = detectSpeechSupport(host);
  if (support.kind !== "ready" || !host.speechSynthesis || !host.SpeechSynthesisUtterance) return null;
  const Utterance = host.SpeechSynthesisUtterance;
  return createGuideReader({ engine: host.speechSynthesis, createUtterance: (text) => new Utterance(text), passages, voice: support.voice, onChange });
}
