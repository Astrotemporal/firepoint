"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { CHECK_ITEMS, PACK_ITEMS, PLAN_ITEMS, STAGES, parseSavedChecks, type CheckItem, type Stage } from "@/domain/fire-readiness";

const CHECKLIST_KEY = "firepoint.prep.v1";

export function FireReadiness({ onStorage }: { onStorage: (ok: boolean) => void }) {
  const [stage, setStage] = useState<Stage["id"]>("ready");
  const [checks, setChecks] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    let active = true;
    // Read device state after hydration, so server HTML and first client render match.
    queueMicrotask(() => {
      if (!active) return;
      try { setChecks(parseSavedChecks(localStorage.getItem(CHECKLIST_KEY))); }
      catch { onStorage(false); }
      setReady(true);
    });
    return () => { active = false; };
  }, [onStorage]);

  function save(next: string[]) {
    setChecks(next);
    try {
      if (next.length) localStorage.setItem(CHECKLIST_KEY, JSON.stringify(next));
      else localStorage.removeItem(CHECKLIST_KEY);
      onStorage(true);
    } catch { onStorage(false); }
  }

  function toggle(id: string) {
    save(checks.includes(id) ? checks.filter((item) => item !== id) : [...checks, id]);
  }

  function onTabKey(event: KeyboardEvent, index: number) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + STAGES.length) % STAGES.length;
    setStage(STAGES[next].id);
    tabs.current[next]?.focus();
  }

  const current = STAGES.find((item) => item.id === stage)!;
  const packed = PACK_ITEMS.filter((item) => checks.includes(item.id)).length;

  const group = (title: string, items: readonly CheckItem[]) => (
    <>
      <div className="checklist-group">{title}</div>
      <ul className="checklist">{items.map((task) => <li key={task.id}><label className="task"><input type="checkbox" checked={checks.includes(task.id)} onChange={() => toggle(task.id)} disabled={!ready} /><span className="checkbox-art" aria-hidden="true">✓</span><span className="task-copy"><strong>{task.label}</strong><small>{task.detail}</small></span></label></li>)}</ul>
    </>
  );

  return (
    <div className="stage-panel">
      <div className="stage-tabs" role="tablist" aria-label="Wildfire stages">
        {STAGES.map((item, index) => <button key={item.id} ref={(el) => { tabs.current[index] = el; }} type="button" role="tab" id={`stage-tab-${item.id}`} aria-controls={`stage-${item.id}`} aria-selected={item.id === stage} tabIndex={item.id === stage ? 0 : -1} className="stage-tab" onClick={() => setStage(item.id)} onKeyDown={(event) => onTabKey(event, index)}>{item.tab}</button>)}
      </div>
      <div className="checklist-card" role="tabpanel" id={`stage-${current.id}`} aria-labelledby={`stage-tab-${current.id}`}>
        <div className="checklist-top"><span>{current.title}</span>{current.id === "ready" && <span aria-live="polite">{ready ? `${packed} / ${PACK_ITEMS.length} packed` : "Local to this device"}</span>}</div>
        <p className="stage-intro">{current.intro}</p>
        {current.id === "ready" ? <>
          {group("Go bag", PACK_ITEMS)}
          {group("Plan", PLAN_ITEMS)}
          <div className="checklist-bottom"><span>{ready ? `${checks.length} / ${CHECK_ITEMS.length} done · saved on this device` : "Saved only when you check an item."}</span>{checks.length > 0 && <button type="button" onClick={() => save([])}>Reset list</button>}</div>
        </> : <ol className="stage-steps">{current.steps.map((step) => <li key={step.label}><strong>{step.label}</strong><small>{step.detail}</small></li>)}</ol>}
        <p className="stage-sources">Adapted from {current.sources.map((source, index) => <span key={source.url}>{index > 0 && " and "}<a href={source.url} target="_blank" rel="noopener noreferrer">{source.label} <span aria-hidden="true">↗</span></a></span>)}. General guidance only. Follow local officials. Call 911 if you are in danger.</p>
      </div>
    </div>
  );
}
