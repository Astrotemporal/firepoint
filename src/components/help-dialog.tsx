"use client";

import { useRef, type MouseEvent } from "react";
import { Flame } from "./flame";
import { useMapText } from "./map-text";

/*
 * The public homepage has no location, directions, Escape or shelters (see src/server/release-gate.ts), so its
 * guide covers only private marks and prep. Like the public status card, that copy is English only: no reviewed
 * Spanish or Armenian version exists, and the prototype's translated help promises routes and shelters.
 */
const PUBLIC_HELP = {
  intro: "Firepoint is a map with private marks. No live incidents, shelters or routes are shown.",
  fireBody: "Use the fire button in the corner to mark a spot on this map for yourself.",
  fireDrag: "Press and hold the fire, drag it to the spot on the map, and let go.",
  fireTap: "Or press it once to drop a mark at the centre of the map, then drag it into place.",
  fireMove: "To move a mark, drag it. To remove one, select it and choose Remove mark. Clear removes them all.",
  fireNote: "Marks stay on this device. They are not reports, fire locations or evacuation zones, and no one else sees them.",
  prepTitle: "Get ready before a fire",
  prepBody: "Official sources & prep, at the top of the screen, links official alerts and a checklist of what to pack.",
  safety: "This app is not an all-clear. Always follow official evacuation orders. To report a fire, call 911.",
};

/**
 * A "?" button that opens a short guide to the map screen in a modal dialog.
 * `public` is the homepage's guide (marks and prep only, English); the default describes the routing prototype.
 */
export function HelpButton({ variant = "prototype" }: { variant?: "prototype" | "public" }) {
  const t = useMapText().help;
  const isPublic = variant === "public";
  const dialog = useRef<HTMLDialogElement>(null);

  // A press on the backdrop lands on the <dialog> itself; presses inside land on its content.
  function onDialogClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) event.currentTarget.close();
  }

  const flame = <Flame className="help-step-flame" />;
  const check = <span className="help-step-num" aria-hidden="true">✓</span>;
  const p = PUBLIC_HELP;
  const steps = isPublic ? [
    { icon: flame, title: "Mark a spot for yourself", body: p.fireBody, how: [p.fireDrag, p.fireTap, p.fireMove], note: p.fireNote },
    { icon: check, title: p.prepTitle, body: p.prepBody },
  ] : [
    { icon: <span className="help-step-dot" aria-hidden="true" />, title: t.locationTitle, body: t.locationBody },
    { icon: <span className="help-step-num" aria-hidden="true">→</span>, title: t.directionsTitle, body: t.directionsBody },
    { icon: <span className="help-step-num help-step-escape" aria-hidden="true">!</span>, title: t.escapeTitle, body: t.escapeBody },
    { icon: flame, title: t.fireTitle, body: t.fireBody, how: [t.fireDrag, t.fireTap, t.fireMove], note: t.fireNote },
    { icon: check, title: t.prepTitle, body: t.prepBody },
  ];

  return (
    <>
      <button type="button" className="map-help" onClick={() => dialog.current?.showModal()} aria-label={t.open} title={t.open} aria-haspopup="dialog">
        <span aria-hidden="true">?</span>
      </button>
      <dialog ref={dialog} lang={isPublic ? "en" : undefined} className="help-dialog" aria-labelledby="help-title" onClick={onDialogClick}>
        <div className="help-body">
          <header className="help-head">
            <h2 id="help-title">{isPublic ? "How to use Firepoint" : t.title}</h2>
            <button type="button" className="help-x" onClick={() => dialog.current?.close()} aria-label={isPublic ? "Close help" : t.closeLabel}>×</button>
          </header>
          <p className="help-intro">{isPublic ? p.intro : t.intro}</p>
          <ol className="help-steps">
            {steps.map((step) => (
              <li key={step.title}>
                <span className="help-step-icon">{step.icon}</span>
                <div>
                  <strong>{step.title}</strong>
                  <p>{step.body}</p>
                  {step.how && <ul className="help-how">{step.how.map((line) => <li key={line}>{line}</li>)}</ul>}
                  {step.note && <p className="help-note">{step.note}</p>}
                </div>
              </li>
            ))}
          </ol>
          <p className="help-safety" role="note">{isPublic ? p.safety : t.safety}</p>
          <button type="button" className="help-close" onClick={() => dialog.current?.close()}>{isPublic ? "Got it" : t.close}</button>
        </div>
      </dialog>
    </>
  );
}
