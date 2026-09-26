"use client";

import { useEffect, useRef, useState } from "react";
import { SPEECH_UI_EN, speechAllowed, type SpeechPassage } from "@/domain/guide-speech";
import type { Locale } from "@/i18n/locales";
import { createGuideReader, detectSpeechSupport, type GuideReader, type ReaderState, type SpeechSupport } from "@/lib/guide-reader";
import "./guide-listen.css";

/*
 * "Listen to this guide": on-device read-aloud of the exact English /prepare text via the browser's
 * speechSynthesis. Progressive enhancement only: the page is complete without it, nothing plays
 * until a tap, speech stops when the control unmounts or the page is left, and an unsupported
 * browser or a device without an English voice gets a plain text note. No server, no network call
 * from this code, no microphone. Never rendered for the unreviewed Spanish/Armenian pages.
 */
export function GuideListen({ locale, passages }: { locale: Locale; passages: readonly SpeechPassage[] }) {
  const [support, setSupport] = useState<SpeechSupport | null>(null);
  const [state, setState] = useState<ReaderState>({ status: "idle" });
  const reader = useRef<GuideReader | null>(null);
  const allowed = speechAllowed(locale);

  useEffect(() => {
    if (!allowed) return;
    const host = window as unknown as Parameters<typeof detectSpeechSupport>[0];
    const detect = () => setSupport(detectSpeechSupport(host));
    detect();
    // Chrome fills in the voice list after load.
    const engine = host.speechSynthesis as (EventTarget & typeof host.speechSynthesis) | undefined;
    engine?.addEventListener?.("voiceschanged", detect);
    const stop = () => reader.current?.stop();
    window.addEventListener("pagehide", stop);
    return () => {
      engine?.removeEventListener?.("voiceschanged", detect);
      window.removeEventListener("pagehide", stop);
      stop();
      reader.current = null;
    };
  }, [allowed]);

  if (!allowed) return null;
  const t = SPEECH_UI_EN;

  const play = () => {
    if (support?.kind !== "ready") return;
    const host = window as unknown as Parameters<typeof detectSpeechSupport>[0];
    if (!host.speechSynthesis || !host.SpeechSynthesisUtterance) return;
    const Utterance = host.SpeechSynthesisUtterance;
    reader.current?.stop();
    reader.current = createGuideReader({
      engine: host.speechSynthesis,
      createUtterance: (text) => new Utterance(text),
      passages,
      voice: support.voice,
      onChange: setState,
    });
    reader.current.play();
  };

  const ready = support?.kind === "ready";
  const busy = state.status === "playing" || state.status === "paused";
  const note =
    support === null ? t.checking
    : support.kind === "unsupported" ? t.unsupported
    : support.kind === "no-english-voice" ? t.noEnglishVoice
    : state.status === "playing" ? `${t.reading} ${state.section}`
    : state.status === "paused" ? `${t.paused} ${state.section}`
    : state.status === "ended" ? t.ended
    : state.status === "failed" ? t.failed
    : "";

  return (
    <div className="g-listen" role="group" aria-label={t.label} lang="en">
      <p className="g-listen-intro"><strong>{t.label}</strong> {t.intro}</p>
      {(support === null || ready) && (
        <div className="g-listen-buttons">
          {state.status === "playing" ? (
            <button type="button" onClick={() => reader.current?.pause()}>{t.pause}</button>
          ) : state.status === "paused" ? (
            <button type="button" onClick={() => reader.current?.resume()}>{t.resume}</button>
          ) : (
            <button type="button" onClick={play} disabled={!ready}>{t.play}</button>
          )}
          <button type="button" className="g-listen-stop" onClick={() => reader.current?.stop()} disabled={!busy}>{t.stop}</button>
        </div>
      )}
      <p className="g-listen-status" role="status" aria-live="polite">{note}</p>
    </div>
  );
}
