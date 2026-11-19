import { describe, expect, it } from "vitest";
import { getMotionPopupView, motionId, selectPopupToShow } from "./motionPopupLogic";
import type { ActiveMotion } from "../types/session";

function motion(overrides: Partial<ActiveMotion> = {}): ActiveMotion {
  return { cardId: "E1", cardType: "expenditure", movedBy: "mover", movedAt: 1000, secondedBy: null, secondedAt: null, ...overrides };
}

describe("getMotionPopupView", () => {
  it("shows nothing when there's no pending motion", () => {
    expect(getMotionPopupView(null, "anyone", true)).toBe("none");
  });

  it("shows nothing to the mover themself (a Commissioner)", () => {
    expect(getMotionPopupView(motion(), "mover", true)).toBe("none");
  });

  it("shows the Second button to a Commissioner other than the mover", () => {
    expect(getMotionPopupView(motion(), "other-commissioner", true)).toBe("second");
  });

  it("shows the info-only version to a non-Commissioner role (Manager/Administrator or Speaker), regardless of uid", () => {
    expect(getMotionPopupView(motion(), "admin-uid", false)).toBe("infoOnly");
    expect(getMotionPopupView(motion(), "mover", false)).toBe("infoOnly");
  });

  it("shows nothing once the motion has been seconded, for every viewer", () => {
    const seconded = motion({ secondedBy: "someone", secondedAt: 1500 });
    expect(getMotionPopupView(seconded, "other-commissioner", true)).toBe("none");
    expect(getMotionPopupView(seconded, "admin-uid", false)).toBe("none");
  });

  // A pop-up decision is made purely from THIS Commission's own
  // activeMotion -- there is no other table's data anywhere in scope for
  // this function to see, so "other tables see none" holds by
  // construction rather than needing its own runtime check.
});

describe("motionId", () => {
  it("is stable per motion (same cardId + movedAt) and distinct for a different motion", () => {
    expect(motionId(motion())).toBe("E1:1000");
    expect(motionId(motion({ cardId: "R1" }))).toBe("R1:1000");
    expect(motionId(motion({ movedAt: 2000 }))).toBe("E1:2000");
  });
});

describe("selectPopupToShow", () => {
  const queueItem = { cardId: "C5", triggeredAt: 500 };

  it("shows nothing when there's no Challenge queued and no Motion waiting", () => {
    expect(selectPopupToShow([], "none")).toBeNull();
  });

  it("shows the Motion pop-up when a Motion is waiting and no Challenge is queued", () => {
    expect(selectPopupToShow([], "second")).toEqual({ type: "motion" });
    expect(selectPopupToShow([], "infoOnly")).toEqual({ type: "motion" });
  });

  it("shows the Challenge pop-up when one is queued, even if a Motion is also waiting", () => {
    expect(selectPopupToShow([queueItem], "second")).toEqual({ type: "challenge", item: queueItem });
  });

  it("falls through to the Motion pop-up once the Challenge queue empties", () => {
    expect(selectPopupToShow([], "second")).toEqual({ type: "motion" });
  });
});
