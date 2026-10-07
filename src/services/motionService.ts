import { ref, runTransaction, update } from "firebase/database";
import { auth, rtdb } from "../firebase/config";
import type { ActiveMotion, Commission } from "../types/session";

function requireUid(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Not signed in");
  return uid;
}

export interface ActionResult {
  ok: boolean;
  reason?: string;
}

/**
 * Motion/second signaling (spec Phase 6 #1): a lightweight, non-gating
 * signal so the room can see "who's moving what" at a glance -- it never
 * blocks or enables the Chair's highlight action or the Manager/
 * Administrator's apply action, matching this app's trust model (the
 * room's real verbal process is what matters, not an in-app vote or
 * approval).
 */

/**
 * True whenever the Commission is currently debating something -- the
 * single shared signal every role's view checks before showing "I move to
 * adopt," instead of each view growing its own copy of this logic. True
 * if any of:
 *   a) a motion has been moved but not yet seconded
 *   b) a motion has been seconded and promoted to Card Under Debate
 *      (chairHighlightedCardId set) -- covers the whole window up to
 *      Motion Passes/Fails, not just the moved-not-seconded window A2
 *      originally covered
 *   c) a millage card's Ballot Measure is open and unresolved
 *      (activeBallotId set) -- from the moment Motion Passes creates it
 *      through voting through closing, until the outcome is applied
 * chairHighlightedCardId is checked directly (not just "does it match a
 * known motion") so a table that skips motion/second and highlights
 * verbally instead still locks out competing motions while it debates.
 */
export function isMotionLocked(commission: Commission): boolean {
  return commission.activeMotion != null || commission.chairHighlightedCardId != null || commission.activeBallotId != null;
}

/**
 * Any Commissioner (including the Chair) signals "I move to adopt [card]."
 * Phase 7 change: only one motion may be pending at a time (previously a
 * later motion silently replaced an earlier one, which let two
 * Commissioners tap different cards nearly simultaneously and leave the
 * room debating two things at once). Claimed transactionally -- "first
 * write wins," same pattern as every other single-seat claim in this app
 * -- so a losing second tap aborts cleanly client-side without ever
 * reaching the server. The RTDB rule enforces the same thing server-side
 * (rejecting a create while a motion, Card Under Debate, or Ballot
 * Measure already occupies this Commission), so a win here isn't the only
 * thing standing between two near-simultaneous taps -- hence the
 * try/catch: a rule rejection throws rather than returning
 * committed:false, and without this catch it would reach the caller as a
 * raw Firebase error instead of the friendly message asked for.
 */
export async function signalMotion(
  code: string,
  commissionId: string,
  cardId: string,
  cardType: "revenue" | "expenditure",
): Promise<ActionResult> {
  const uid = requireUid();
  const motion: ActiveMotion = {
    cardId,
    cardType,
    movedBy: uid,
    movedAt: Date.now(),
    secondedBy: null,
    secondedAt: null,
  };
  try {
    const result = await runTransaction(
      ref(rtdb, `sessions/${code}/commissions/${commissionId}/activeMotion`),
      (current: ActiveMotion | null) => {
        if (current !== null) return undefined;
        return motion;
      },
    );
    if (!result.committed) {
      return { ok: false, reason: "A motion is already on the table. Wait for it to resolve first." };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "A motion is already on the table. Wait for it to resolve first." };
  }
}

/** Any Commissioner other than the mover signals "I second." No-op guards are client-side (this is a signal, not a gate). */
export async function signalSecond(code: string, commissionId: string): Promise<ActionResult> {
  const uid = requireUid();
  await update(ref(rtdb), {
    [`sessions/${code}/commissions/${commissionId}/activeMotion/secondedBy`]: uid,
    [`sessions/${code}/commissions/${commissionId}/activeMotion/secondedAt`]: Date.now(),
  });
  return { ok: true };
}

/** Clears the pending motion -- available to any Commissioner, e.g. once debate has moved on. */
export async function clearMotion(code: string, commissionId: string): Promise<void> {
  await update(ref(rtdb), {
    [`sessions/${code}/commissions/${commissionId}/activeMotion`]: null,
  });
}

/** True if this Commission's pending motion (if any) is for the given card -- used to auto-clear it once that card is actually applied. */
export function motionMatchesCard(commission: Commission, cardId: string): boolean {
  return commission.activeMotion?.cardId === cardId;
}
