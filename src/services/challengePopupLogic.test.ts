import { describe, expect, it } from "vitest";
import { selectChallengesToQueue } from "./challengePopupLogic";

const REPLAY_WINDOW_MS = 2 * 60 * 1000;
const notDismissed = () => false;

describe("selectChallengesToQueue", () => {
  it("queues a late-join challenge triggered recently", () => {
    const now = 1_000_000;
    const applied = { CH1: now - 30_000 }; // 30s ago
    const result = selectChallengesToQueue(applied, null, notDismissed, now, REPLAY_WINDOW_MS);
    expect(result).toEqual([{ cardId: "CH1", triggeredAt: now - 30_000 }]);
  });

  it("does not queue a late-join challenge older than the replay window", () => {
    const now = 1_000_000;
    const applied = { CH1: now - 5 * 60_000 }; // 5 minutes ago
    const result = selectChallengesToQueue(applied, null, notDismissed, now, REPLAY_WINDOW_MS);
    expect(result).toEqual([]);
  });

  it("always queues a genuinely new trigger while already connected, regardless of age", () => {
    const now = 1_000_000;
    const prev = {}; // this device was already watching with nothing applied yet
    const applied = { CH1: now - 10 * 60_000 }; // old timestamp, but it's new to `prev`
    const result = selectChallengesToQueue(applied, prev, notDismissed, now, REPLAY_WINDOW_MS);
    expect(result).toEqual([{ cardId: "CH1", triggeredAt: now - 10 * 60_000 }]);
  });

  it("never re-queues an entry unchanged since the last check", () => {
    const now = 1_000_000;
    const prev = { CH1: now - 30_000 };
    const applied = { CH1: now - 30_000 }; // same triggeredAt
    const result = selectChallengesToQueue(applied, prev, notDismissed, now, REPLAY_WINDOW_MS);
    expect(result).toEqual([]);
  });

  it("never re-queues an entry that's already been dismissed", () => {
    const now = 1_000_000;
    const applied = { CH1: now - 10_000 };
    const result = selectChallengesToQueue(applied, null, () => true, now, REPLAY_WINDOW_MS);
    expect(result).toEqual([]);
  });

  it("queues two challenges that arrive close together, in trigger order", () => {
    const now = 1_000_000;
    const prev = { CH1: now - 5000 };
    const applied = { CH1: now - 5000, CH2: now - 1000, CH3: now - 3000 };
    const result = selectChallengesToQueue(applied, prev, notDismissed, now, REPLAY_WINDOW_MS);
    expect(result).toEqual([
      { cardId: "CH3", triggeredAt: now - 3000 },
      { cardId: "CH2", triggeredAt: now - 1000 },
    ]);
  });

  it("re-triggering the same card with a new timestamp counts as a new event", () => {
    const now = 1_000_000;
    const prev = { CH1: now - 60_000 };
    const applied = { CH1: now }; // same card, new triggeredAt
    const result = selectChallengesToQueue(applied, prev, notDismissed, now, REPLAY_WINDOW_MS);
    expect(result).toEqual([{ cardId: "CH1", triggeredAt: now }]);
  });
});
