import { ref, update } from "firebase/database";
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
 * approval). Plain updates rather than transactions: unlike a single-seat
 * claim or a ledger delta, there's no "first write wins" invariant to
 * protect here -- a Commissioner motioning a moment after another simply
 * replaces the pending one, same as a real room moving on.
 */

/** Any Commissioner (including the Chair) signals "I move to adopt [card]." Replaces whatever motion was already pending. */
export async function signalMotion(
  code: string,
  commissionId: string,
  cardId: string,
  cardType: "revenue" | "expenditure",
): Promise<void> {
  const uid = requireUid();
  const motion: ActiveMotion = {
    cardId,
    cardType,
    movedBy: uid,
    movedAt: Date.now(),
    secondedBy: null,
    secondedAt: null,
  };
  await update(ref(rtdb), {
    [`sessions/${code}/commissions/${commissionId}/activeMotion`]: motion,
  });
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
