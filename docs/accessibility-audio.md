# Accessible audio: read-aloud on `/prepare`

**Status: proposed in [PR #30](https://github.com/Astrotemporal/firepoint/pull/30), not merged and not deployed.**
The PR adds a "Listen to this guide" control ([`guide-listen.tsx`](../src/components/guide-listen.tsx)) to the
`/prepare` wildfire guide. It reads the page's exact English text through the browser's own
[Web Speech API `speechSynthesis`](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis), using
**only a voice the browser reports as on-device**. There is **no ElevenLabs integration, no audio endpoint and
no server call**. It is for residents who prefer to hear the guide (children, seniors, low vision, reading
fatigue); it is not an alert channel and never speaks a notice, order, zone or all-clear.

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
- No microphone, speech recognition, chat, routing or navigation. The code contains no `fetch`, no `/api/` call
  and no analytics.

## Voice rule: on-device only, fail closed

The control never lets the browser choose a voice. [`guide-reader.ts`](../src/lib/guide-reader.ts) requires a
voice with `localService === true` and an English `lang`; otherwise there is **no audio**, and the page says so:

| Browser state | Result |
| --- | --- |
| No `speechSynthesis` / `SpeechSynthesisUtterance` | "Read-aloud is not available in this browser." Text only. |
| Voice list still empty (Chrome publishes it after `voiceschanged`) | "Checking for an on-device English voice…", Play disabled. After 4 s with no list: treated as no voice. |
| Voices known, but the only English voices are **network voices** (for example Chrome's "Google …" voices) | "No on-device English voice is available, so there is no audio." Nothing is spoken. |
| Voices known, none English | Same text-only note. |
| An on-device English voice exists | Play enabled; that voice is set on every utterance. Support is re-checked at tap time. |
| Engine error mid-read | Queue cancelled; "Audio stopped unexpectedly." |

Network voices are excluded because they send the text to the vendor's servers; the guide text is public, but the
feature's promise is "read by this device", so a remote voice is not used even as a fallback. Tests
(`guide-reader.test.ts`) assert that an empty list, a network-only list and a no-English list never call `speak`.

## Browser support and caveats

Whether an on-device English voice exists depends on the operating system, its installed language packs and
the browser; **no platform is guaranteed**. Observed behaviour, to be re-verified on real devices before any launch:

- Safari (iOS / iPadOS / macOS) exposes Apple's built-in voices as `localService`; typically usable.
- Chrome / Edge on Windows and macOS usually expose the OS voices as local alongside Google network voices; only the
  OS voices qualify. On ChromeOS or a clean Linux install there may be no local voice at all → text-only note.
- Chrome on Android depends on the installed TTS engine and language data.
- Firefox needs an OS speech engine (Linux: `speech-dispatcher`).
- Headless or locked-down browsers and some kiosks have no voices → text-only note.

Other limits: no sound in silent mode or at zero media volume while the status still says "Reading"; some engines
ignore `pause()`; background tabs may stop; long single utterances can be cut off by a known Chrome bug, which the
short per-item utterances avoid. Read-aloud is not offline-tested; `public/offline.html` remains text only.

## Privacy

- Nothing from this control is sent to a Firepoint server: no resident location, no address, no text, no analytics.
- Only on-device voices are used, so the guide text is not sent to a voice vendor by this feature.
- No audio is recorded. There is no microphone permission request.

## Provider note (ElevenLabs): placeholder only

`.env.example` lists `ELEVENLABS_API_KEY=` as a **placeholder**. No code reads it, there is no `/api/…/speech`
route and no client fetches audio. If a hosted voice is ever added it must follow
[pwa-storage-and-systems.md](pwa-storage-and-systems.md#read-aloud-and-provenance-your-systems-lane) and
[hackathon-roles.md](hackathon-roles.md): server-only key, bound to a cited text hash, explicit tap, transcript
visible first, no resident data in the request, vendor retention reviewed, and a text fallback. The on-device
control above is the lower-cost, more private default and should stay available even if a hosted voice is added.
