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
 * Any Commissioner (including the Chair) signals "I move to adopt [card]."
 * Phase 7 change: only one motion may be pending at a time (previously a
 * later motion silently replaced an earlier one, which let two
 * Commissioners tap different cards nearly simultaneously and leave the
 * room debating two things at once). Claimed transactionally -- "first
 * write wins," same pattern as every other single-seat claim in this app
 * -- so a losing second tap aborts cleanly client-side without ever
 * reaching the server, rather than racing a plain update() against the
 * RTDB rule's own (defense-in-depth) rejection of the same case.
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
  const result = await runTransaction(
    ref(rtdb, `sessions/${code}/commissions/${commissionId}/activeMotion`),
    (current: ActiveMotion | null) => {
      if (current !== null) return undefined;
      return motion;
    },
  );
  if (!result.committed) {
    return { ok: false, reason: "Someone else just moved to adopt a different card. Wait for that motion to resolve first." };
  }
  return { ok: true };
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
