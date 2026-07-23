import { ref, runTransaction } from "firebase/database";
import { rtdb } from "../firebase/config";
import type { EndorsementAction, EndorsementType } from "../types/session";

export interface CastEndorsementResult {
  ok: boolean;
  reason?: string;
}

const MAX_ENDORSEMENTS = 3;

/**
 * Casts one of a Speaker's 3 lifetime Endorse/Oppose actions (spec Section
 * 8a #7). Permanent once cast -- no undo, doesn't need to target a specific
 * card, usable any time during Main Game. Not app-enforced that they use at
 * least one; the cap here only prevents more than 3.
 *
 * Two writes:
 * 1. Claims one of the 3 numbered slots ("0"/"1"/"2") under the Speaker's
 *    own endorsementsUsed, trying each in turn via a transaction scoped to
 *    that single slot (write-only-if-absent, same "first write wins"
 *    pattern used elsewhere for single-seat claims). This writes only the
 *    one new key rather than rewriting the whole map, so the RTDB rule for
 *    each slot can be a simple one-shot !data.exists() check instead of
 *    needing to count children.
 * 2. A transaction on publicTrustTally for the Speaker's own assigned
 *    Commission only -- Speakers pick one table to watch at join, same as
 *    a Commissioner (spec correction: was originally session-wide, which
 *    incorrectly fanned one endorsement out to every Commission's tally).
 */
export async function castEndorsement(
  code: string,
  uid: string,
  type: EndorsementType,
  commissionId: string,
): Promise<CastEndorsementResult> {
  let claimed = false;
  for (let slot = 0; slot < MAX_ENDORSEMENTS; slot++) {
    const slotRef = ref(rtdb, `sessions/${code}/publicHearingSpeakers/${uid}/endorsementsUsed/${slot}`);
    const claim = await runTransaction(slotRef, (current: EndorsementAction | null) => {
      if (current !== null) return undefined;
      return { type, timestamp: Date.now() };
    });
    if (claim.committed) {
      claimed = true;
      break;
    }
  }
  if (!claimed) return { ok: false, reason: "All 3 endorsements have already been used." };

  const delta = type === "endorse" ? 1 : -1;
  await runTransaction(ref(rtdb, `sessions/${code}/commissions/${commissionId}/publicTrustTally`), (current: number | null) => {
    return (current ?? 0) + delta;
  });

  return { ok: true };
}
