# Accessible audio: read-aloud on `/prepare`

**Status: shipped as progressive enhancement, English only, on-device.** The `/prepare` wildfire guide has a
"Listen to this guide" control ([`guide-listen.tsx`](../src/components/guide-listen.tsx)) that reads the page's
exact English text through the browser's own [Web Speech API `speechSynthesis`](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis).
There is **no ElevenLabs integration, no audio endpoint and no server call**. This is for residents who prefer to
hear the guide (children, seniors, low vision, reading fatigue); it is not an alert channel and never speaks a
notice, order, zone or all-clear.

## What it does

- Speaks only strings that already exist in `GuideContent` and are visible on the page, in page order
  ([`guide-speech.ts`](../src/domain/guide-speech.ts)). One utterance per list item or sentence group; the text stays
  on screen as the transcript. Tests fail if a spoken part is not an exact visible guide string.
- Plays **only after a tap** on Play. Nothing autoplays, nothing preloads. Pause / Resume / Stop are ≥44 px buttons.
- Stops when the control unmounts (client navigation), on `pagehide` (full navigation, language switch, tab close),
  on Stop, and on an engine error. A status line (`aria-live="polite"`) shows which section is being read.
- **English only.** Spanish and Eastern Armenian pages get no control at all, not a fallback English voice: the
  translations are unreviewed ([translations.md](translations.md)), and a translated page reading English aloud
  would be confusing. The component also refuses to render for any non-`en` locale even if handed passages.
- Honest text-only states: no `speechSynthesis` in the browser → "Read-aloud is not available in this browser";
  a known voice list with no English voice → "This device has no English voice"; an engine error mid-way →
  "Audio stopped unexpectedly". Each note says everything is in the page text.
- No microphone, speech recognition, chat, routing or navigation. The code contains no `fetch`, no `/api/` call
  and no analytics.

## Browser support and caveats

| Browser | Behaviour |
| --- | --- |
| Safari iOS / iPadOS, macOS | Works with the device's built-in voices (on-device). Pause / Resume work. |
| Chrome / Edge desktop | Works. Chrome's "Google …" voices are **network voices**: the guide text is sent to Google to synthesize. The control prefers a `localService` English voice when one exists. Historical Chrome bug: single utterances over ~15 s can stop; the guide is split into short utterances to avoid this. |
| Chrome Android | Works with Google TTS if an English voice is installed. |
| Firefox | Works where an OS speech engine exists (Windows, macOS; Linux needs `speech-dispatcher`). |
| Older / locked-down browsers, some kiosks | `speechSynthesis` missing → text-only note. |

Other limits: voices can be silent when the device is in silent mode or media volume is zero (the status still
says "Reading"); some engines ignore `pause()`; background tabs may stop speaking; the `voiceschanged` event fires
late on Chrome, so the button is disabled until the browser confirms support. The read-aloud is not offline-tested:
`public/offline.html` remains text only.

## Privacy

- Nothing from this control is sent to a Firepoint server: no resident location, no address, no text, no analytics.
- The text spoken is the public guide only. Whether the *browser's* voice engine sends that text to a vendor
  (Chrome network voices) is a browser setting outside this app; the app prefers on-device voices when available.
- No audio is recorded. There is no microphone permission request.

## Provider note (ElevenLabs): placeholder only

`.env.example` lists `ELEVENLABS_API_KEY=` as a **placeholder**. No code reads it, there is no `/api/…/speech`
route and no client fetches audio. If a hosted voice is ever added it must follow
[pwa-storage-and-systems.md](pwa-storage-and-systems.md#read-aloud-and-provenance-your-systems-lane) and [hackathon-roles.md](hackathon-roles.md):
server-only key, bound to a cited text hash, explicit tap, transcript visible first, no resident data in the
request, vendor retention reviewed, and a text fallback. The on-device control above is the lower-cost, more
private default and should stay available even if a hosted voice is added.
