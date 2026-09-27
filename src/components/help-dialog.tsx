"use client";

import { useRef, type MouseEvent } from "react";
import { Flame } from "./flame";
import { useMapText } from "./map-text";

/** A "?" button that opens a short guide to the map screen in a modal dialog. */
export function HelpButton() {
  const t = useMapText().help;
  const dialog = useRef<HTMLDialogElement>(null);

  // A press on the backdrop lands on the <dialog> itself; presses inside land on its content.
  function onDialogClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) event.currentTarget.close();
  }

  const flame = <Flame className="help-step-flame" />;
  const check = <span className="help-step-num" aria-hidden="true">✓</span>;
  const steps = [
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
      <dialog ref={dialog} className="help-dialog" aria-labelledby="help-title" onClick={onDialogClick}>
        <div className="help-body">
          <header className="help-head">
            <h2 id="help-title">{t.title}</h2>
            <button type="button" className="help-x" onClick={() => dialog.current?.close()} aria-label={t.closeLabel}>×</button>
          </header>
          <p className="help-intro">{t.intro}</p>
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
          <p className="help-safety" role="note">{t.safety}</p>
          <button type="button" className="help-close" onClick={() => dialog.current?.close()}>{t.close}</button>
        </div>
      </dialog>
    </>
  );
}
