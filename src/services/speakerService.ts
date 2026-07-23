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
 * 1. A transaction on the Speaker's own endorsementsUsed map -- reads the
 *    current map, rejects if already at 3, and adds the next sequential
 *    key ("0"/"1"/"2"). Transactional so two rapid taps (or two tabs) can't
 *    both succeed and push the count past 3.
 * 2. A transaction on publicTrustTally for every Commission in the session
 *    -- Speakers are session-wide, not tied to one table (see
 *    Commission.publicTrustTally's doc comment), so every table's tally
 *    receives the same +1/-1. Each Commission's increment is its own
 *    transaction so concurrent endorsements from different Speakers never
 *    clobber each other.
 */
export async function castEndorsement(
  code: string,
  uid: string,
  type: EndorsementType,
  commissionIds: string[],
): Promise<CastEndorsementResult> {
  const endorsementsRef = ref(rtdb, `sessions/${code}/publicHearingSpeakers/${uid}/endorsementsUsed`);
  const claim = await runTransaction(endorsementsRef, (current: Record<string, EndorsementAction> | null) => {
    const existing = current ?? {};
    const count = Object.keys(existing).length;
    if (count >= MAX_ENDORSEMENTS) return undefined;
    return { ...existing, [String(count)]: { type, timestamp: Date.now() } };
  });
  if (!claim.committed) return { ok: false, reason: "All 3 endorsements have already been used." };

  const delta = type === "endorse" ? 1 : -1;
  await Promise.all(
    commissionIds.map((commissionId) =>
      runTransaction(ref(rtdb, `sessions/${code}/commissions/${commissionId}/publicTrustTally`), (current: number | null) => {
        return (current ?? 0) + delta;
      }),
    ),
  );

  return { ok: true };
}
