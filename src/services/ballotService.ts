import { get, push, ref, runTransaction, update } from "firebase/database";
import { rtdb } from "../firebase/config";
import { applyCard, type ActionResult, type CardType } from "./ledgerService";
import type { CardCatalog } from "../types/catalog";
import type { BallotMeasure, BallotVote } from "../types/session";

/**
 * Millage cards are identified by the catalog's existing "millage-rate"
 * exclusivityGroup tag on R2/R3/R4 -- the single source of truth already
 * in the data for this set of cards. There's no separate "millage"
 * catalog field (flagged back per the open question): if the catalog
 * ever grows a second, non-millage exclusivity group, this check would
 * need to become more specific than "any exclusivityGroup," but today
 * millage-rate is the only group that exists.
 */
export function isMillageCard(catalog: CardCatalog, cardType: CardType, cardId: string): boolean {
  if (cardType !== "revenue") return false;
  const card = catalog.revenueCards.find((c) => c.id === cardId);
  return card?.exclusivityGroup === "millage-rate";
}

/**
 * Creates the ballot the instant Motion Passes is clicked on a millage
 * card. Voting isn't open to Speakers yet (openedAt stays null) -- the
 * Administrator's "Run the Election" modal shows this pending state until
 * openBallotMeasure is called.
 */
export async function createBallotMeasure(
  code: string,
  commissionId: string,
  cardType: CardType,
  cardId: string,
): Promise<string> {
  const base = `sessions/${code}/commissions/${commissionId}`;
  const ballotId = push(ref(rtdb, `${base}/ballotMeasures`)).key;
  if (!ballotId) throw new Error("Could not generate a ballot id.");
  const ballot: BallotMeasure = {
    id: ballotId,
    cardId,
    cardType,
    openedAt: null,
    closedAt: null,
    outcome: null,
    yesCount: 0,
    noCount: 0,
  };
  await update(ref(rtdb), {
    [`${base}/ballotMeasures/${ballotId}`]: ballot,
    [`${base}/activeBallotId`]: ballotId,
  });
  return ballotId;
}

/** Cancels a ballot that was created but never opened to voting -- nothing of consequence happened yet, so it's removed rather than kept as "cancelled" history. Card Under Debate is left as-is, so the Administrator can reconsider (Motion Fails, or re-click Motion Passes to restart the ballot). */
export async function cancelBallotMeasure(code: string, commissionId: string, ballotId: string): Promise<void> {
  const base = `sessions/${code}/commissions/${commissionId}`;
  await update(ref(rtdb), {
    [`${base}/ballotMeasures/${ballotId}`]: null,
    [`${base}/activeBallotId`]: null,
  });
}

/** Opens voting to every Public Hearing Speaker assigned to this Commission. */
export async function openBallotMeasure(code: string, commissionId: string, ballotId: string): Promise<void> {
  await update(ref(rtdb), {
    [`sessions/${code}/commissions/${commissionId}/ballotMeasures/${ballotId}/openedAt`]: Date.now(),
  });
}

/**
 * Closes voting, tallies anonymous yes/no counts (majority of votes cast,
 * not all registered Speakers; a tie -- including 0-0 -- fails), and
 * resolves the ballot.
 *
 * Voting is locked (closedAt set) as its own first write, before the
 * tally is even computed, so no vote can land mid-resolution. If the
 * outcome is "passed," applies the card via the exact same atomic
 * applyCard used for every other Motion Passes -- not a second apply
 * path. outcome and activeBallotId are only cleared once that (or the
 * no-op "failed" case) has actually succeeded: if applyCard itself fails,
 * closedAt stays set (voting is over either way) but outcome stays null
 * and activeBallotId keeps pointing at this ballot, so the Administrator
 * sees the error and can retry closing rather than the ballot silently
 * recording a "passed" outcome that was never actually applied.
 */
export async function closeBallotMeasure(
  code: string,
  commissionId: string,
  catalog: CardCatalog,
  ballot: BallotMeasure,
): Promise<ActionResult & { outcome: "passed" | "failed"; yes: number; no: number }> {
  const base = `sessions/${code}/commissions/${commissionId}`;
  // Phase 8.1: yesCount/noCount are the only tally anyone -- including
  // the Administrator closing this ballot -- can read; the raw per-voter
  // values live in the separate, voter-only-readable ballotVotes tree
  // (see castBallotVote) and are never read back here or anywhere else.
  const yes = ballot.yesCount ?? 0;
  const no = ballot.noCount ?? 0;
  const outcome: "passed" | "failed" = yes > no ? "passed" : "failed";

  if (ballot.closedAt == null) {
    await update(ref(rtdb), { [`${base}/ballotMeasures/${ballot.id}/closedAt`]: Date.now() });
  }

  if (outcome === "passed") {
    // applyCard already clears a matching activeMotion itself once the
    // card lands in cardsInPlay -- not duplicated here.
    const result = await applyCard(code, commissionId, catalog, ballot.cardType, ballot.cardId);
    if (!result.ok) {
      return { ok: false, reason: result.reason, outcome, yes, no };
    }
  } else {
    // Unlike the passed branch, nothing else clears Card Under Debate or
    // the motion that put this card there -- do both here so the lock
    // (Change 1) releases the instant the ballot fails, not just when
    // chairHighlightedCardId happens to get noticed elsewhere.
    const motionSnapshot = await get(ref(rtdb, `${base}/activeMotion`));
    const motionUpdates: Record<string, unknown> = { [`${base}/chairHighlightedCardId`]: null };
    if (motionSnapshot.exists() && motionSnapshot.val()?.cardId === ballot.cardId) {
      motionUpdates[`${base}/activeMotion`] = null;
    }
    await update(ref(rtdb), motionUpdates);
  }

  await update(ref(rtdb), {
    [`${base}/ballotMeasures/${ballot.id}/outcome`]: outcome,
    [`${base}/activeBallotId`]: null,
  });

  return { ok: true, outcome, yes, no };
}

/**
 * One vote per Speaker per ballot, cast once, no changing it afterward --
 * and, as of Phase 8.1, genuinely unreadable by anyone but the voter
 * themself (see the BallotMeasure.yesCount/noCount comment in types/
 * session.ts for why the old in-tree `votes` map couldn't actually
 * deliver that). Two writes:
 *
 * 1. Transactionally claim ballotVotes/{code}/{commissionId}/{ballotId}/
 *    {speakerUid} -- write-once, same "first write wins" pattern as
 *    every other single-seat claim in this app. This is the sole
 *    authoritative "have I voted" record; the RTDB rule also enforces
 *    write-once server-side.
 * 2. Only if that commits, bump the matching yesCount/noCount on the
 *    ballot itself (also a transaction, so two concurrent votes can't
 *    clobber each other's +1). If this second step fails -- a dropped
 *    connection between the two writes -- the claim is rolled back so
 *    the Speaker isn't left permanently locked out with no vote counted;
 *    same rollback-on-partial-failure pattern as claimAndApplyLedgerDelta
 *    in ledgerService.ts.
 *
 * This still trusts each Speaker's own client to increment the counter
 * honestly exactly once -- there's no Cloud Function available to
 * recompute it from a trusted source (Spark plan, confirmed in Phase 7).
 * That's the same tier of trust this app already extends to every other
 * role for their own actions (the Administrator applying cards, the
 * Facilitator triggering Challenges); what this fix actually closes is
 * the privacy leak -- nobody, including the Administrator and
 * Facilitator, can read who voted which way anymore -- and accidental
 * double-submission, not a determined cheater with raw API access.
 */
export async function castBallotVote(
  code: string,
  commissionId: string,
  ballotId: string,
  speakerUid: string,
  vote: BallotVote,
): Promise<ActionResult> {
  const base = `sessions/${code}/commissions/${commissionId}`;
  const voteRef = ref(rtdb, `ballotVotes/${code}/${commissionId}/${ballotId}/${speakerUid}`);

  const claim = await runTransaction(voteRef, (current: BallotVote | null) => {
    if (current !== null) return undefined;
    return vote;
  });
  if (!claim.committed) {
    return { ok: false, reason: "You've already voted on this measure." };
  }

  try {
    const countField = vote === "yes" ? "yesCount" : "noCount";
    await runTransaction(
      ref(rtdb, `${base}/ballotMeasures/${ballotId}/${countField}`),
      (current: number | null) => (current ?? 0) + 1,
    );
  } catch (err) {
    await runTransaction(voteRef, (current: BallotVote | null) => (current === vote ? null : current));
    throw err;
  }

  return { ok: true };
}

/** The voter's own previously-cast vote, if any -- read directly from the voter-only-readable ballotVotes path, never from the (now-aggregate-only) ballot itself. */
export async function getMyBallotVote(
  code: string,
  commissionId: string,
  ballotId: string,
  speakerUid: string,
): Promise<BallotVote | null> {
  const snapshot = await get(ref(rtdb, `ballotVotes/${code}/${commissionId}/${ballotId}/${speakerUid}`));
  return snapshot.exists() ? (snapshot.val() as BallotVote) : null;
}
