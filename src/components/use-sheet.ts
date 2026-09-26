"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { cycleSnap, settleSnap, snapHeights, type Snap, type SnapHeights } from "./sheet";

/** Movement (px) below which a press on the handle counts as a tap. */
const TAP_SLOP = 6;

/**
 * Drag, tap and measure logic for the directions bottom sheet (phones; desktop CSS ignores the height).
 * Publishes the visible height as --ev-sheet-h and the peek height as --ev-peek on the enclosing .ev-shell,
 * so the map and its floating buttons can stay clear of the sheet.
 */
export function useSheet() {
  const sheetRef = useRef<HTMLElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const peekRef = useRef<HTMLDivElement | null>(null);
  const [snap, setSnap] = useState<Snap>("peek");
  const [heights, setHeights] = useState<SnapHeights | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const gesture = useRef<{ startY: number; startHeight: number; lastY: number; lastTime: number; velocity: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  const measure = useCallback(() => {
    const sheet = sheetRef.current, inner = innerRef.current, peek = peekRef.current;
    if (!sheet || !inner || !peek) return;
    const pad = parseFloat(getComputedStyle(sheet).paddingBottom) || 0;
    setHeights(snapHeights({
      peek: Math.ceil(peek.offsetTop + peek.offsetHeight + pad),
      content: Math.ceil(inner.offsetHeight + pad),
      viewport: window.innerHeight,
    }));
  }, []);

  useEffect(() => {
    measure();
    const observer = new ResizeObserver(measure);
    if (innerRef.current) observer.observe(innerRef.current);
    if (peekRef.current) observer.observe(peekRef.current);
    window.addEventListener("resize", measure);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); };
  }, [measure]);

  const visible = heights ? drag ?? heights[snap] : null;
  useEffect(() => {
    const shell = sheetRef.current?.closest<HTMLElement>(".ev-shell");
    if (!shell || !heights || visible === null) return;
    shell.style.setProperty("--ev-sheet-h", `${visible}px`);
    shell.style.setProperty("--ev-peek", `${heights.peek}px`);
    shell.dataset.sheet = snap;
  }, [visible, heights, snap]);

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (!heights || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { startY: event.clientY, startHeight: heights[snap], lastY: event.clientY, lastTime: event.timeStamp, velocity: 0, moved: false };
  };
  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const g = gesture.current;
    if (!g || !heights) return;
    if (!g.moved && Math.abs(event.clientY - g.startY) < TAP_SLOP) return;
    g.moved = true;
    const dt = Math.max(1, event.timeStamp - g.lastTime);
    g.velocity = (g.lastY - event.clientY) / dt;
    g.lastY = event.clientY;
    g.lastTime = event.timeStamp;
    setDrag(Math.min(heights.full, Math.max(heights.peek, g.startHeight + g.startY - event.clientY)));
  };
  const onPointerUp = () => {
    const g = gesture.current;
    gesture.current = null;
    if (!g?.moved || !heights || drag === null) return;
    suppressClick.current = true;
    setSnap(settleSnap(drag, g.velocity, heights));
    setDrag(null);
  };
  const onClick = () => {
    if (suppressClick.current) { suppressClick.current = false; return; }
    if (heights) setSnap(cycleSnap(snap, heights));
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "ArrowUp") { event.preventDefault(); setSnap(snap === "peek" ? "half" : "full"); }
    if (event.key === "ArrowDown") { event.preventDefault(); setSnap(snap === "full" ? "half" : "peek"); }
  };

  return {
    snap, setSnap, dragging: drag !== null, sheetRef, innerRef, peekRef,
    style: (visible === null ? undefined : { "--ev-sheet-visible": `${visible}px` }) as CSSProperties | undefined,
    handleProps: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onClick, onKeyDown },
  };
}
