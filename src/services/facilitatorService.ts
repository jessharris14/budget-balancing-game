import { ref, runTransaction, update } from "firebase/database";
import { rtdb } from "../firebase/config";
import { applyChallengeToLedger } from "./ledgerService";
import { computeFinalScore } from "./scoringService";
import { drawPromptIds } from "./sessionService";
import type { ChallengeCard, PromptBankEntry } from "../types/catalog";
import { SESSION_PHASE_ORDER, type Session, type SessionPhase } from "../types/session";

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

/**
 * Phase 7 B1/B2: computes and stores finalScore for every Commission that
 * doesn't have one yet. Called from the Facilitator's client -- the
 * project stays on the Spark plan (no billing account linked, confirmed
 * this round via the Cloud Billing API returning SERVICE_DISABLED), so
 * Cloud Functions aren't deployable here; this is the documented
 * fallback, structured so computeFinalScore itself (the actual scoring
 * logic) could move into a Cloud Function later with no changes -- only
 * this orchestration layer would need to move.
 *
 * Idempotent by construction: only commissions missing a finalScore get
 * one written, so calling this again (e.g. the Facilitator's device
 * refreshes mid-debrief, re-mounting the component that triggers it)
 * is always safe and never recomputes or overwrites an existing score.
 * finalScore's own RTDB rule additionally enforces write-once
 * server-side, as a second line of defense.
 */
export async function computeAndStoreFinalScores(code: string, session: Session): Promise<void> {
  const updates: Record<string, unknown> = {};
  for (const [commissionId, commission] of Object.entries(session.commissions ?? {})) {
    if (commission.finalScore != null) continue;
    const breakdown = computeFinalScore(commission.ledger, commission.priority, commission.publicTrustTally);
    updates[`sessions/${code}/commissions/${commissionId}/finalScore`] = { ...breakdown, computedAt: Date.now() };
  }
  if (Object.keys(updates).length > 0) {
    await update(ref(rtdb), updates);
  }
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

  // Phase 8.2: the ledger effect lands FIRST, before the visible
  // "a Challenge happened" metadata (challengesApplied/activeChallenge).
  // That ordering matters for what a dropped connection leaves behind:
  // if applyChallengeToLedger succeeds but the metadata update below
  // never lands (or vice versa with the old order), this way the
  // ledger -- the thing that actually affects scoring -- is always
  // correct, and the worst case is the Applied Challenges panel briefly
  // not reflecting a Challenge whose dollar effect already landed,
  // rather than the panel showing a Challenge whose money never moved.
  // applyChallengeToLedger is itself idempotent (challengeLedgerAppliedAt
  // transaction, keyed by this exact triggeredAt), so retriggering the
  // same card at the same `now` can't double-apply it.
  await applyChallengeToLedger(code, commissionId, card, now);

  const updates: Record<string, unknown> = {
    [`sessions/${code}/commissions/${commissionId}/challengesApplied/${card.id}`]: now,
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
}

/**
 * Facilitator-only (spec Section 8 #3): re-draws 1-2 fresh prompts for a
 * Speaker whose assigned prompt is a poor fit for the room, and bumps
 * rerollCount as an audit trail. Reuses the exact same draw logic as the
 * initial join-time assignment, so a reroll is statistically identical to
 * getting a fresh draw at join.
 */
export async function rerollSpeakerPrompts(code: string, speakerUid: string, promptBank: PromptBankEntry[], currentRerollCount: number): Promise<void> {
  await update(ref(rtdb), {
    [`sessions/${code}/publicHearingSpeakers/${speakerUid}/assignedPrompts`]: drawPromptIds(promptBank),
    [`sessions/${code}/publicHearingSpeakers/${speakerUid}/rerollCount`]: currentRerollCount + 1,
  });
}

/**
 * Phase 8.2 disaster-recovery escape hatch: managerAdminId and chairId
 * are single-seat, claimed once and permanent (no uid can ever overwrite
 * an existing claim, by design -- see the Phase 8.1 rules audit). That's
 * correct for preventing a seat from being hijacked, but it also means
 * if the person holding one of those seats genuinely loses their
 * anonymous auth identity (cleared browser storage, a new device, no
 * recovery path), that seat is stuck forever with no legitimate way for
 * anyone -- including them -- to reclaim it. Only the Facilitator can
 * release it (clear the field back to null so it becomes claimable
 * again), and only by explicit action -- this is NOT triggered by a
 * disconnect or any automatic timeout.
 */
export async function releaseSeat(code: string, commissionId: string, seat: "managerAdmin" | "chair"): Promise<void> {
  const field = seat === "managerAdmin" ? "managerAdminId" : "chairId";
  await update(ref(rtdb), {
    [`sessions/${code}/commissions/${commissionId}/members/${field}`]: null,
  });
}
