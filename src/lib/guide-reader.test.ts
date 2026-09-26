import { describe, expect, it } from "vitest";
import type { SpeechPassage } from "@/domain/guide-speech";
import { createGuideReader, detectSpeechSupport, pickEnglishVoice, type ReaderState, type SpeechEngineLike, type UtteranceLike, type VoiceLike } from "./guide-reader";

// Synthetic only: a fake speech engine that records calls and lets a test fire utterance events.
class FakeUtterance implements UtteranceLike {
  lang = "";
  voice: VoiceLike | null = null;
  listeners: Record<string, ((event: { type: string; error?: string }) => void)[]> = {};
  constructor(public text: string) {}
  addEventListener(type: "start" | "end" | "error", listener: (event: { type: string; error?: string }) => void) {
    (this.listeners[type] ??= []).push(listener);
  }
  fire(type: "start" | "end" | "error", error?: string) { for (const listener of this.listeners[type] ?? []) listener({ type, error }); }
}

function fakeEngine(voices: VoiceLike[] = []) {
  const calls: string[] = [];
  const spoken: FakeUtterance[] = [];
  const engine: SpeechEngineLike = {
    speak(utterance) { calls.push("speak"); spoken.push(utterance as FakeUtterance); },
    cancel() { calls.push("cancel"); },
    pause() { calls.push("pause"); },
    resume() { calls.push("resume"); },
    getVoices: () => voices,
  };
  return { engine, calls, spoken };
}

const voice = (lang: string, extra: Partial<VoiceLike> = {}): VoiceLike => ({ name: lang, lang, localService: false, default: false, ...extra });

const PASSAGES: readonly SpeechPassage[] = [
  { section: "First", parts: ["One.", "Two."] },
  { section: "Second", parts: ["Three."] },
];

function reader(voices: VoiceLike[] = []) {
  const fake = fakeEngine(voices);
  const states: ReaderState[] = [];
  const guide = createGuideReader({
    engine: fake.engine, createUtterance: (text) => new FakeUtterance(text), passages: PASSAGES,
    voice: pickEnglishVoice(voices), onChange: (state) => states.push(state),
  });
  return { ...fake, states, guide };
}

describe("speech support detection", () => {
  it("reports an honest text-only state when the browser has no speechSynthesis", () => {
    expect(detectSpeechSupport({})).toEqual({ kind: "unsupported" });
    expect(detectSpeechSupport({ speechSynthesis: fakeEngine().engine })).toEqual({ kind: "unsupported" });
  });

  it("reports no English voice when the voice list is known and has none", () => {
    const host = { speechSynthesis: fakeEngine([voice("es-MX"), voice("hy-AM")]).engine, SpeechSynthesisUtterance: FakeUtterance };
    expect(detectSpeechSupport(host)).toEqual({ kind: "no-english-voice" });
  });

  it("is ready with an empty voice list (Chrome fills it in later) and prefers a local English voice", () => {
    expect(detectSpeechSupport({ speechSynthesis: fakeEngine().engine, SpeechSynthesisUtterance: FakeUtterance })).toEqual({ kind: "ready", voice: null });
    const remote = voice("en-US");
    const local = voice("en-GB", { localService: true });
    expect(pickEnglishVoice([voice("es-ES"), remote, local])).toBe(local);
    expect(pickEnglishVoice([voice("es-ES"), remote])).toBe(remote);
    expect(pickEnglishVoice([voice("english")])).toBeNull();
  });
});

describe("guide reader", () => {
  it("never speaks until play is called", () => {
    const { calls, guide } = reader();
    expect(calls).toEqual([]);
    expect(guide.state).toEqual({ status: "idle" });
  });

  it("queues every exact part in order, in English, after play", () => {
    const local = voice("en-US", { localService: true });
    const { spoken, guide } = reader([local]);
    guide.play();
    expect(spoken.map((u) => u.text)).toEqual(["One.", "Two.", "Three."]);
    for (const u of spoken) { expect(u.lang).toBe("en-US"); expect(u.voice).toBe(local); }
    spoken[0]!.fire("start");
    expect(guide.state).toEqual({ status: "playing", section: "First" });
    spoken[2]!.fire("start");
    spoken[2]!.fire("end");
    expect(guide.state).toEqual({ status: "ended" });
  });

  it("stops by cancelling the engine and ignores events from the cancelled queue", () => {
    const { calls, spoken, guide, states } = reader();
    guide.play();
    spoken[0]!.fire("start");
    guide.stop();
    expect(calls.at(-1)).toBe("cancel");
    expect(guide.state).toEqual({ status: "idle" });
    spoken[0]!.fire("error", "interrupted");
    spoken[1]!.fire("start");
    expect(guide.state).toEqual({ status: "idle" });
    expect(states.filter((s) => s.status === "failed")).toEqual([]);
  });

  it("pauses and resumes only while playing", () => {
    const { calls, spoken, guide } = reader();
    guide.pause();
    expect(calls).not.toContain("pause");
    guide.play();
    spoken[0]!.fire("start");
    guide.pause();
    expect(guide.state).toEqual({ status: "paused", section: "First" });
    guide.resume();
    expect(guide.state).toEqual({ status: "playing", section: "First" });
    expect(calls.filter((c) => c === "pause" || c === "resume")).toEqual(["pause", "resume"]);
  });

  it("reports a failure and cancels the rest when the engine errors", () => {
    const { calls, spoken, guide } = reader();
    guide.play();
    spoken[0]!.fire("start");
    spoken[0]!.fire("error", "synthesis-failed");
    expect(guide.state).toEqual({ status: "failed" });
    expect(calls.at(-1)).toBe("cancel");
    spoken[1]!.fire("start");
    expect(guide.state).toEqual({ status: "failed" });
  });
});
