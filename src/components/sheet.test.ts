import { describe, expect, it } from "vitest";
import { cycleSnap, settleSnap, snapHeights } from "./sheet";

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

  it("steps peek → half → full → peek on tap, skipping heights the content can't fill", () => {
    expect(cycleSnap("peek", heights)).toBe("half");
    expect(cycleSnap("half", heights)).toBe("full");
    expect(cycleSnap("full", heights)).toBe("peek");
    const short = snapHeights({ peek: 150, content: 300, viewport: 800 });
    expect(cycleSnap("peek", short)).toBe("half");
    expect(cycleSnap("half", short)).toBe("peek");
  });
});
