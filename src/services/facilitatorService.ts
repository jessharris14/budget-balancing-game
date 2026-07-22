import { ref, runTransaction, update } from "firebase/database";
import { rtdb } from "../firebase/config";
import { applyChallengeToLedger } from "./ledgerService";
import type { ChallengeCard } from "../types/catalog";
import { SESSION_PHASE_ORDER, type SessionPhase } from "../types/session";

const RANK_PRIORITIES_MS = 3 * 60 * 1000;
const MAIN_GAME_MS = 45 * 60 * 1000;
const CHALLENGE_REMINDER_CUTOFF_MS = 10 * 60 * 1000;

function randomChallengeIntervalMs(): number {
  const minutes = 3 + Math.random() * 2; // 3-5 minutes, per spec Section 3
  return minutes * 60 * 1000;
}

/** Null once the next reminder would fall inside the last 10 minutes of Main Game -- this is what makes reminders "auto-stop." */
function computeNextChallengeDue(now: number, mainGameEndsAt: number): number | null {
  const candidate = now + randomChallengeIntervalMs();
  const cutoff = mainGameEndsAt - CHALLENGE_REMINDER_CUTOFF_MS;
  return candidate < cutoff ? candidate : null;
}

/**
 * Advances session.phase to the next step in SESSION_PHASE_ORDER and starts
 * whichever timer that phase needs. No-op once already at the last phase
 * (debrief). Facilitator-only at the RTDB rules layer.
 */
export async function advancePhase(code: string, currentPhase: SessionPhase): Promise<void> {
  const idx = SESSION_PHASE_ORDER.indexOf(currentPhase);
  if (idx === -1 || idx === SESSION_PHASE_ORDER.length - 1) return;
  const nextPhase = SESSION_PHASE_ORDER[idx + 1];
  const now = Date.now();

  const updates: Record<string, unknown> = {
    [`sessions/${code}/phase`]: nextPhase,
  };

  if (nextPhase === "rankPriorities") {
    updates[`sessions/${code}/clock/phaseTimer`] = now + RANK_PRIORITIES_MS;
  } else if (nextPhase === "mainGame") {
    const mainGameEndsAt = now + MAIN_GAME_MS;
    updates[`sessions/${code}/clock/phaseTimer`] = null;
    updates[`sessions/${code}/clock/mainGameTimer`] = mainGameEndsAt;
    updates[`sessions/${code}/clock/nextChallengeDue`] = computeNextChallengeDue(now, mainGameEndsAt);
  } else {
    updates[`sessions/${code}/clock/phaseTimer`] = null;
  }

  await update(ref(rtdb), updates);
}

export interface RollForChairResult {
  rolls: Record<string, number>;
  chairId: string;
}

/**
 * Rolls a d6 for each commissioner; highest wins, re-rolling only among
 * ties until a unique winner emerges. Records both the rolls (audit trail)
 * and the resulting chairId, but only if a Chair hasn't already been set --
 * one-shot per Commission, guarded by a transaction so two concurrent rolls
 * can't both "win."
 */
export async function rollForChair(
  code: string,
  commissionId: string,
  commissionerUids: string[],
): Promise<RollForChairResult | null> {
  if (commissionerUids.length === 0) return null;

  let contenders = commissionerUids;
  let rolls: Record<string, number> = {};
  let winner: string;

  for (;;) {
    const roundRolls: Record<string, number> = {};
    for (const uid of contenders) {
      roundRolls[uid] = 1 + Math.floor(Math.random() * 6);
    }
    rolls = { ...rolls, ...roundRolls };
    const highest = Math.max(...Object.values(roundRolls));
    const tied = contenders.filter((uid) => roundRolls[uid] === highest);
    if (tied.length === 1) {
      winner = tied[0];
      break;
    }
    contenders = tied;
  }

  const chairRef = ref(rtdb, `sessions/${code}/commissions/${commissionId}/members/chairId`);
  const result = await runTransaction(chairRef, (current: string | null) => {
    if (current !== null) return undefined;
    return winner;
  });

  if (!result.committed) return null;

  await update(ref(rtdb), {
    [`sessions/${code}/commissions/${commissionId}/chairRoll`]: rolls,
  });

  return { rolls, chairId: winner };
}

export async function recordCommissionPriority(code: string, commissionId: string, cardId: string): Promise<void> {
  await update(ref(rtdb), {
    [`sessions/${code}/commissions/${commissionId}/priority/selectedCardId`]: cardId,
  });
}

/**
 * Broadcasts a Challenge card to a Commission: marks it applied (audit
 * trail) and sets activeChallenge, which is what live-subscribed clients
 * actually react to. Also reschedules the next reminder due-time, since any
 * trigger -- for any Commission -- resets the shared facilitator cadence.
 *
 * Immediately applies the Challenge's dollar impact to the ledger too --
 * Challenges cannot be debated or declined ("there is no debate... they
 * must be funded"), so there's never a legitimate case where a triggered
 * Challenge shouldn't take effect. This runs under the Facilitator's own
 * write, since they're guaranteed present at the moment they trigger it
 * (unlike the Manager/Administrator, whose console might not be open).
 */
export async function triggerChallenge(
  code: string,
  commissionId: string,
  card: ChallengeCard,
  mainGameEndsAt: number | null,
): Promise<void> {
  const now = Date.now();
  const updates: Record<string, unknown> = {
    [`sessions/${code}/commissions/${commissionId}/challengesApplied/${card.id}`]: true,
    [`sessions/${code}/commissions/${commissionId}/activeChallenge`]: {
      cardId: card.id,
      printedText: card.printedText,
      triggeredAt: now,
    },
  };

  if (mainGameEndsAt !== null) {
    updates[`sessions/${code}/clock/nextChallengeDue`] = computeNextChallengeDue(now, mainGameEndsAt);
  }

  await update(ref(rtdb), updates);
  await applyChallengeToLedger(code, commissionId, card, now);
}
