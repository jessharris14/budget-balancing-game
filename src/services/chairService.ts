import { ref, update } from "firebase/database";
import { rtdb } from "../firebase/config";

/**
 * Chair mechanics per spec Section 8a #2: the Chair is an elected
 * Commissioner status (via Roll for Chair), not a separate login, and gets
 * exactly two live controls -- which card is under debate, and the debate
 * timer. Neither writes anything that gates the Manager/Administrator's
 * apply/reconsider actions, and neither records a vote outcome of any kind.
 * Both fields live on the Commission node and are readable by every other
 * role in that Commission except the Facilitator (enforced by what each
 * view chooses to render, not by RTDB read rules -- read access is already
 * session-wide for every signed-in participant).
 */

export async function setChairHighlightedCard(
  code: string,
  commissionId: string,
  cardId: string | null,
): Promise<void> {
  await update(ref(rtdb), {
    [`sessions/${code}/commissions/${commissionId}/chairHighlightedCardId`]: cardId,
  });
}

/** Starts (or restarts) the debate timer using the Facilitator-configured length. */
export async function startDebateTimer(code: string, commissionId: string, debateTimerMinutes: number): Promise<void> {
  const endsAt = Date.now() + debateTimerMinutes * 60 * 1000;
  await update(ref(rtdb), {
    [`sessions/${code}/commissions/${commissionId}/debateTimerEndsAt`]: endsAt,
  });
}

/** Stops the timer early (also doubles as "reset" -- the Chair can start it again from the full length). */
export async function stopDebateTimer(code: string, commissionId: string): Promise<void> {
  await update(ref(rtdb), {
    [`sessions/${code}/commissions/${commissionId}/debateTimerEndsAt`]: null,
  });
}
