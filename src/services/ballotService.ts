import { push, ref, runTransaction, update } from "firebase/database";
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
  const ballot: BallotMeasure = { id: ballotId, cardId, cardType, openedAt: null, closedAt: null, outcome: null, votes: {} };
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
  const votes = Object.values(ballot.votes ?? {});
  const yes = votes.filter((v) => v === "yes").length;
  const no = votes.filter((v) => v === "no").length;
  const outcome: "passed" | "failed" = yes > no ? "passed" : "failed";

  if (ballot.closedAt == null) {
    await update(ref(rtdb), { [`${base}/ballotMeasures/${ballot.id}/closedAt`]: Date.now() });
  }

  if (outcome === "passed") {
    const result = await applyCard(code, commissionId, catalog, ballot.cardType, ballot.cardId);
    if (!result.ok) {
      return { ok: false, reason: result.reason, outcome, yes, no };
    }
  } else {
    await update(ref(rtdb), { [`${base}/chairHighlightedCardId`]: null });
  }

  await update(ref(rtdb), {
    [`${base}/ballotMeasures/${ballot.id}/outcome`]: outcome,
    [`${base}/activeBallotId`]: null,
  });

  return { ok: true, outcome, yes, no };
}

/** One vote per Speaker per ballot, cast once, no changing it afterward -- enforced at the RTDB rules level (write-only-if-absent), not just by this client-side write. */
export async function castBallotVote(
  code: string,
  commissionId: string,
  ballotId: string,
  speakerUid: string,
  vote: BallotVote,
): Promise<void> {
  await runTransaction(
    ref(rtdb, `sessions/${code}/commissions/${commissionId}/ballotMeasures/${ballotId}/votes/${speakerUid}`),
    (current: BallotVote | null) => {
      if (current !== null) return undefined;
      return vote;
    },
  );
}
