import { describe, expect, it } from "vitest";
import { cycleSnap, handleGesture, settleSnap, snapHeights } from "./sheet";

const heights = snapHeights({ peek: 150, content: 900, viewport: 800 });

describe("bottom sheet snaps", () => {
  it("sizes half and full to the screen, never taller than the content", () => {
    expect(heights).toEqual({ peek: 150, half: 400, full: 690 });
    expect(snapHeights({ peek: 150, content: 300, viewport: 800 })).toEqual({ peek: 150, half: 300, full: 300 });
    expect(snapHeights({ peek: 150, content: 120, viewport: 800 })).toEqual({ peek: 150, half: 150, full: 150 });
  });

  it("settles on the nearest height after a slow drag", () => {
    expect(settleSnap(180, 0, heights)).toBe("peek");
    expect(settleSnap(430, 0, heights)).toBe("half");
    expect(settleSnap(640, 0, heights)).toBe("full");
  });

  it("follows a flick one step in its direction", () => {
    expect(settleSnap(420, 1, heights)).toBe("full"); // flicked up from about half
    expect(settleSnap(390, -1, heights)).toBe("peek"); // flicked down from about half
    expect(settleSnap(160, -1, heights)).toBe("peek");
    expect(settleSnap(680, 1, heights)).toBe("full");
  });

  describe("handle gestures on a phone-sized drawer (synthetic heights: an iPhone-height screen, short content)", () => {
    // The directions drawer with an escape route is usually shorter than half the screen, so half === full.
    const short = snapHeights({ peek: 96, content: 227, viewport: 844 });

    it("keeps the route on a tap: a tap moves the sheet but never counts as closing", () => {
      expect(short).toEqual({ peek: 96, half: 227, full: 227 });
      expect(handleGesture("half", { kind: "tap" }, short)).toEqual({ snap: "peek", closes: false });
      expect(handleGesture("peek", { kind: "tap" }, short)).toEqual({ snap: "half", closes: false });
      expect(handleGesture("full", { kind: "tap" }, heights)).toEqual({ snap: "peek", closes: false });
    });

    it("closes only when the sheet is slid all the way down", () => {
      expect(handleGesture("half", { kind: "drag", height: 100, velocity: 0 }, short)).toEqual({ snap: "peek", closes: true });
      expect(handleGesture("half", { kind: "drag", height: 200, velocity: -1 }, short)).toEqual({ snap: "peek", closes: true });
      expect(handleGesture("half", { kind: "drag", height: 210, velocity: 0 }, short)).toEqual({ snap: "half", closes: false });
      expect(handleGesture("peek", { kind: "drag", height: 96, velocity: -1 }, short)).toEqual({ snap: "peek", closes: true });
    });

    it("follows arrow keys, closing on ArrowDown from half but not on ArrowUp", () => {
      expect(handleGesture("peek", { kind: "key", key: "ArrowUp" }, short)).toEqual({ snap: "half", closes: false });
      expect(handleGesture("half", { kind: "key", key: "ArrowUp" }, short)).toEqual({ snap: "full", closes: false });
      expect(handleGesture("full", { kind: "key", key: "ArrowDown" }, heights)).toEqual({ snap: "half", closes: false });
      expect(handleGesture("half", { kind: "key", key: "ArrowDown" }, short)).toEqual({ snap: "peek", closes: true });
    });
  });

  it("steps peek → half → full → peek on tap, skipping heights the content can't fill", () => {
    expect(cycleSnap("peek", heights)).toBe("half");
    expect(cycleSnap("half", heights)).toBe("full");
    expect(cycleSnap("full", heights)).toBe("peek");
    const short = snapHeights({ peek: 150, content: 300, viewport: 800 });
    expect(cycleSnap("peek", short)).toBe("half");
    expect(cycleSnap("half", short)).toBe("peek");
  });
});
