import type { ActiveMotion } from "../types/session";
import type { ChallengeQueueItem } from "./challengePopupLogic";

export type MotionPopupView = "none" | "second" | "infoOnly";

/**
 * Pure "who sees what" decision behind the motion pop-up (spec 3a), given
 * only THIS Commission's own activeMotion -- there's no cross-table data
 * in scope at all, which is what makes "other tables see none" true by
 * construction rather than something this function has to check.
 *
 * canSecond is true for Commissioners (including the Chair, who is always
 * also a Commissioner -- see CommissionMembers -- and whom the current
 * seconding rules do allow to second, same as any other Commissioner) and
 * false for the Manager/Administrator and Public Hearing Speakers.
 */
export function getMotionPopupView(motion: ActiveMotion | null, myUid: string, canSecond: boolean): MotionPopupView {
  if (!motion || motion.secondedBy) return "none";
  if (canSecond) {
    return motion.movedBy === myUid ? "none" : "second";
  }
  return "infoOnly";
}

/** Stable per-motion identity for dismissal tracking -- ActiveMotion has no id field of its own. */
export function motionId(motion: Pick<ActiveMotion, "cardId" | "movedAt">): string {
  return `${motion.cardId}:${motion.movedAt}`;
}

export type PopupToShow = { type: "challenge"; item: ChallengeQueueItem } | { type: "motion" } | { type: "freeCard" } | null;

/**
 * Rule 3b's queue order, extended for the Chair's free card pop-up: a
 * Challenge always takes priority, then the Motion pop-up (if still
 * waiting), then the Chair's free card pop-up (if pending) once both of
 * those are clear.
 */
export function selectPopupToShow(challengeQueue: ChallengeQueueItem[], motionView: MotionPopupView, freeCardPending: boolean): PopupToShow {
  if (challengeQueue.length > 0) return { type: "challenge", item: challengeQueue[0] };
  if (motionView !== "none") return { type: "motion" };
  if (freeCardPending) return { type: "freeCard" };
  return null;
}
