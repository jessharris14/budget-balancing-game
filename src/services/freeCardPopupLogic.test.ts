import { describe, expect, it } from "vitest";
import { shouldQueueFreeCardPopup } from "./freeCardPopupLogic";
import type { ChairFreeCardApplication } from "../types/session";

const REPLAY_WINDOW_MS = 2 * 60 * 1000;
const application: ChairFreeCardApplication = { cardId: "E1", cardType: "expenditure", appliedAt: 100_000 };
const neverDismissed = () => false;
const alwaysDismissed = () => true;

describe("shouldQueueFreeCardPopup", () => {
  it("shows nothing when the Chair's free card has never been applied", () => {
    expect(shouldQueueFreeCardPopup(null, undefined, neverDismissed, 100_000, REPLAY_WINDOW_MS)).toBe(false);
    expect(shouldQueueFreeCardPopup(undefined, undefined, neverDismissed, 100_000, REPLAY_WINDOW_MS)).toBe(false);
  });

  it("on first observation (a fresh mount/late join), queues an application that happened recently", () => {
    const now = application.appliedAt + 30_000; // 30s ago -- inside the replay window
    expect(shouldQueueFreeCardPopup(application, undefined, neverDismissed, now, REPLAY_WINDOW_MS)).toBe(true);
  });

  it("on first observation, does NOT queue an application that happened long ago (a late joiner shouldn't get a stale pop-up)", () => {
    const now = application.appliedAt + 10 * 60 * 1000; // 10 minutes ago -- outside the replay window
    expect(shouldQueueFreeCardPopup(application, undefined, neverDismissed, now, REPLAY_WINDOW_MS)).toBe(false);
  });

  it("once already observed with no change, never re-queues (no duplicate on refresh/re-render)", () => {
    expect(shouldQueueFreeCardPopup(application, application.appliedAt, neverDismissed, application.appliedAt + 1000, REPLAY_WINDOW_MS)).toBe(
      false,
    );
  });

  it("a genuinely new appliedAt (a live trigger while already watching) always queues, regardless of age", () => {
    const prevAppliedAt = 50_000;
    const now = application.appliedAt + 10 * 60 * 1000; // outside the replay window, but this isn't a first-run check
    expect(shouldQueueFreeCardPopup(application, prevAppliedAt, neverDismissed, now, REPLAY_WINDOW_MS)).toBe(true);
  });

  it("never re-queues an appliedAt already marked dismissed", () => {
    expect(shouldQueueFreeCardPopup(application, undefined, alwaysDismissed, application.appliedAt, REPLAY_WINDOW_MS)).toBe(false);
  });
});
