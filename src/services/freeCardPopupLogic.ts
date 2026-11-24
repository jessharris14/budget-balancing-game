import type { ChairFreeCardApplication } from "../types/session";

/**
 * Pure "should the Chair's free card pop-up show right now" decision,
 * mirroring challengePopupLogic.ts's selectChallengesToQueue -- chairFreeCardUsed
 * is one-shot per Commission, so unlike the Challenge queue there is at
 * most ever one of these per table, tracked as a single appliedAt rather
 * than a map.
 *
 * `prevAppliedAt` is the appliedAt this component last observed for this
 * commissionId, or `undefined` on its very first check (a mount: fresh
 * load, refresh, or late join) -- same three-state distinction
 * EventPopupHost already uses for the "seconded" toast. On that first
 * check, an application that already happened only queues if it's within
 * replayWindowMs of `now` (a late joiner shouldn't get a pop-up for
 * something that happened an hour ago); any genuinely new appliedAt this
 * component hasn't seen before always queues, regardless of age (a live
 * trigger while already watching). Either way, an appliedAt isDismissed()
 * already is never re-queued.
 */
export function shouldQueueFreeCardPopup(
  application: ChairFreeCardApplication | null | undefined,
  prevAppliedAt: number | null | undefined,
  isDismissed: (appliedAt: number) => boolean,
  now: number,
  replayWindowMs: number,
): boolean {
  if (!application) return false;
  if (application.appliedAt === prevAppliedAt) return false;
  if (isDismissed(application.appliedAt)) return false;

  const isFirstRun = prevAppliedAt === undefined;
  if (isFirstRun) return now - application.appliedAt <= replayWindowMs;
  return true;
}
