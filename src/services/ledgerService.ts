import { get, ref, runTransaction, update } from "firebase/database";
import { rtdb } from "../firebase/config";
import type { CardCatalog, ChallengeCard, EffectDirection, ExpenditureCard, RevenueCard } from "../types/catalog";
import type { CardInPlay, Commission, CommissionLedger, SessionPhase } from "../types/session";

export type CardType = "revenue" | "expenditure";

export interface ActionResult {
  ok: boolean;
  reason?: string;
}

function computeDeltas(
  cardType: CardType,
  amount: number,
  direction: EffectDirection,
): { revenueDelta: number; expenditureDelta: number; deficitDelta: number } {
  if (cardType === "revenue") {
    // "Decrease deficit" on a Revenue card means more revenue comes in.
    const revenueDelta = direction === "decrease" ? amount : -amount;
    return { revenueDelta, expenditureDelta: 0, deficitDelta: revenueDelta };
  }
  // "Decrease deficit" on an Expenditure card means less gets spent.
  const expenditureDelta = direction === "decrease" ? -amount : amount;
  return { revenueDelta: 0, expenditureDelta, deficitDelta: -expenditureDelta };
}

interface ResolvedCard {
  card: RevenueCard | ExpenditureCard;
  revenueDelta: number;
  expenditureDelta: number;
  deficitDelta: number;
}

function resolveCard(catalog: CardCatalog, cardType: CardType, cardId: string): ResolvedCard | null {
  const card =
    cardType === "revenue"
      ? catalog.revenueCards.find((c) => c.id === cardId)
      : catalog.expenditureCards.find((c) => c.id === cardId);
  if (!card) return null;
  const { revenueDelta, expenditureDelta, deficitDelta } = computeDeltas(cardType, card.amount, card.direction);
  return { card, revenueDelta, expenditureDelta, deficitDelta };
}

/**
 * Exclusivity groups are read entirely from the catalog's `exclusivityGroup`
 * field -- nothing here names R2/R3/R4 specifically, so a future catalog
 * defining a different group just works. Only RevenueCard carries this
 * field today (matching the current catalog's needs), so this only ever
 * searches revenueCards; extending exclusivity to Expenditure cards would
 * need the type extended too, not just this function.
 */
function groupSiblingIds(catalog: CardCatalog, cardType: CardType, cardId: string): string[] {
  if (cardType !== "revenue") return [];
  const group = catalog.revenueCards.find((c) => c.id === cardId)?.exclusivityGroup;
  if (!group) return [];
  return catalog.revenueCards.filter((c) => c.exclusivityGroup === group && c.id !== cardId).map((c) => c.id);
}

/** A card is available if it hasn't been played and isn't locked out by an exclusivity-group sibling being played. */
export function isCardAvailable(commission: Commission, cardId: string): boolean {
  return !commission.cardsInPlay?.[cardId] && !commission.cardsLockedOut?.[cardId];
}

/**
 * Applies a resolved card's ledger delta and marks it played.
 *
 * Uses two separate transactions rather than one plain multi-path update,
 * because the naive "read this.commission prop, compute new absolute
 * values, write them" approach has a real race: if the Manager/
 * Administrator applies two different cards in quick succession, the
 * second write can be computed from a stale pre-first-write ledger
 * snapshot and clobber the first card's effect once it lands. Each
 * transaction instead reads the current server value at write time:
 *
 * 1. Claim cardsInPlay/{cardId} transactionally (write only if absent) --
 *    same "first write wins" pattern as Phase 2's single-seat role claims.
 *    This is what makes two near-simultaneous plays of the SAME card safe.
 * 2. Only if the claim succeeds, fold the delta into `ledger` via its own
 *    transaction, reading the fresh ledger rather than a stale prop -- this
 *    is what makes rapid sequential plays of DIFFERENT cards safe.
 *
 * cardsLockedOut writes are a plain (non-transactional) update: they're
 * idempotent absolute sets, not read-modify-write, so there's nothing to
 * race on for a single card's own lockout -- the one narrow gap is if the
 * same actor plays two different siblings of the same exclusivity group
 * within the same instant from two open tabs, which could transiently lock
 * out fewer cards than it should. Accepted as a known limitation given a
 * single trusted Manager/Administrator seat, not defended against further.
 */
async function claimAndApplyLedgerDelta(
  base: string,
  cardId: string,
  cardInPlay: CardInPlay,
  deltas: { revenueDelta: number; expenditureDelta: number; deficitDelta: number },
): Promise<ActionResult> {
  const claim = await runTransaction(ref(rtdb, `${base}/cardsInPlay/${cardId}`), (current: CardInPlay | null) => {
    if (current !== null) return undefined;
    return cardInPlay;
  });
  if (!claim.committed) return { ok: false, reason: "This card has already been played." };

  await runTransaction(ref(rtdb, `${base}/ledger`), (current: CommissionLedger | null) => {
    if (current === null) return current;
    return {
      ...current,
      revenue: current.revenue + deltas.revenueDelta,
      expenditures: current.expenditures + deltas.expenditureDelta,
      deficitOrSurplus: current.deficitOrSurplus + deltas.deficitDelta,
    };
  });

  return { ok: true };
}

/**
 * Applies a Revenue or Expenditure card's dollar impact to the ledger and
 * marks it played. Assumes the verbal motion/vote already happened --
 * gating this behind the Clerk's actual motion/vote flow is Phase 5.
 */
export async function applyCard(
  code: string,
  commissionId: string,
  catalog: CardCatalog,
  cardType: CardType,
  cardId: string,
): Promise<ActionResult> {
  const lockedSnapshot = await get(ref(rtdb, `sessions/${code}/commissions/${commissionId}/cardsLockedOut/${cardId}`));
  if (lockedSnapshot.exists()) return { ok: false, reason: "This card is locked out by an exclusivity group." };

  const resolved = resolveCard(catalog, cardType, cardId);
  if (!resolved) return { ok: false, reason: "Card not found in catalog." };
  const { revenueDelta, expenditureDelta, deficitDelta } = resolved;
  const appliedAmount = cardType === "revenue" ? revenueDelta : expenditureDelta;

  const base = `sessions/${code}/commissions/${commissionId}`;
  const result = await claimAndApplyLedgerDelta(
    base,
    cardId,
    { cardId, cardType, appliedAmount, playedAt: Date.now() },
    { revenueDelta, expenditureDelta, deficitDelta },
  );
  if (!result.ok) return result;

  const siblings = groupSiblingIds(catalog, cardType, cardId);
  if (siblings.length > 0) {
    const updates: Record<string, unknown> = {};
    for (const siblingId of siblings) updates[`${base}/cardsLockedOut/${siblingId}`] = true;
    await update(ref(rtdb), updates);
  }

  return { ok: true };
}

/**
 * Reverses a previously played card. Claims the reversal transactionally
 * (only succeeds if the card is currently in cardsInPlay, and deletes it
 * atomically -- so a concurrent reconsider of the same card can't double-
 * fire), then undoes its exact stored delta (appliedAmount, not recomputed
 * from the catalog) against a fresh ledger read. If the card belonged to
 * an exclusivity group, frees the other group members, since the
 * constraint no longer applies once it's undone.
 */
export async function reconsiderCard(
  code: string,
  commissionId: string,
  catalog: CardCatalog,
  cardId: string,
): Promise<ActionResult> {
  const base = `sessions/${code}/commissions/${commissionId}`;

  let claimed: CardInPlay | undefined;
  const claim = await runTransaction(ref(rtdb, `${base}/cardsInPlay/${cardId}`), (current: CardInPlay | null) => {
    if (current === null) return undefined;
    claimed = current;
    return null; // delete
  });
  if (!claim.committed || !claimed) return { ok: false, reason: "This card is not currently played." };

  const { cardType, appliedAmount } = claimed;
  await runTransaction(ref(rtdb, `${base}/ledger`), (current: CommissionLedger | null) => {
    if (current === null) return current;
    return {
      ...current,
      revenue: cardType === "revenue" ? current.revenue - appliedAmount : current.revenue,
      expenditures: cardType === "expenditure" ? current.expenditures - appliedAmount : current.expenditures,
      deficitOrSurplus: current.deficitOrSurplus + (cardType === "revenue" ? -appliedAmount : appliedAmount),
    };
  });

  const siblings = groupSiblingIds(catalog, cardType, cardId);
  if (siblings.length > 0) {
    const updates: Record<string, unknown> = {};
    for (const siblingId of siblings) updates[`${base}/cardsLockedOut/${siblingId}`] = null;
    await update(ref(rtdb), updates);
  }

  return { ok: true };
}

/**
 * Applies a Challenge's dollar impact -- to deficit or to reserves, per the
 * card's `target` -- the instant it's triggered, with no manual step:
 * unlike Revenue/Expenditure cards, Challenges cannot be debated or
 * declined ("there is no debate... they must be funded"), so a manual
 * "Apply" button was actually a bug -- a Commission could simply never
 * click it and take zero Challenge impact all game. Called automatically
 * by triggerChallenge() the moment the Facilitator broadcasts a Challenge.
 *
 * Guards against applying the same trigger twice (by triggeredAt, not just
 * cardId, so the same card triggered again later isn't blocked as "already
 * done") via a transactional claim on challengeLedgerAppliedAt. Challenges
 * are never reconsidered -- an external shock already happened, unlike a
 * Commission's own policy choice.
 */
export async function applyChallengeToLedger(
  code: string,
  commissionId: string,
  card: ChallengeCard,
  triggeredAt: number,
): Promise<ActionResult> {
  const base = `sessions/${code}/commissions/${commissionId}`;

  const claim = await runTransaction(ref(rtdb, `${base}/challengeLedgerAppliedAt`), (current: number | null) => {
    if (current === triggeredAt) return undefined;
    return triggeredAt;
  });
  if (!claim.committed) return { ok: false, reason: "Already applied to the ledger." };

  if (card.target === "reserves") {
    const delta = card.direction === "decrease" ? -card.amount : card.amount;
    await runTransaction(ref(rtdb, `${base}/ledger`), (current: CommissionLedger | null) => {
      if (current === null) return current;
      return { ...current, reserves: current.reserves + delta };
    });
  } else {
    const delta = card.direction === "decrease" ? card.amount : -card.amount;
    await runTransaction(ref(rtdb, `${base}/ledger`), (current: CommissionLedger | null) => {
      if (current === null) return current;
      return { ...current, deficitOrSurplus: current.deficitOrSurplus + delta };
    });
  }

  return { ok: true };
}

/**
 * The Chair's one-time $1 free card: same ledger mechanics as applyCard,
 * plus validation (must be $1, Main Game phase, not already used) and
 * marking chairFreeCardUsed. That flag is permanent even if this specific
 * card is later reconsidered -- otherwise play-then-reconsider-then-replay
 * would let the Chair get the privilege more than once.
 */
export async function applyChairFreeCard(
  code: string,
  commissionId: string,
  catalog: CardCatalog,
  phase: SessionPhase,
  cardType: CardType,
  cardId: string,
): Promise<ActionResult> {
  if (phase !== "mainGame") return { ok: false, reason: "The Chair's free card is only available during Main Game." };

  const resolved = resolveCard(catalog, cardType, cardId);
  if (!resolved) return { ok: false, reason: "Card not found in catalog." };
  if (resolved.card.amount !== 1) return { ok: false, reason: "The Chair's free card must be a $1 card." };

  const base = `sessions/${code}/commissions/${commissionId}`;

  const lockedSnapshot = await get(ref(rtdb, `${base}/cardsLockedOut/${cardId}`));
  if (lockedSnapshot.exists()) return { ok: false, reason: "This card is locked out by an exclusivity group." };

  // One-shot flip false -> true, guarded transactionally so two clicks (or
  // two tabs) can't both succeed.
  const claimFreeCard = await runTransaction(ref(rtdb, `${base}/chairFreeCardUsed`), (current: boolean | null) => {
    if (current === true) return undefined;
    return true;
  });
  if (!claimFreeCard.committed) return { ok: false, reason: "The Chair's free card has already been used." };

  const { revenueDelta, expenditureDelta, deficitDelta } = resolved;
  const appliedAmount = cardType === "revenue" ? revenueDelta : expenditureDelta;
  const result = await claimAndApplyLedgerDelta(
    base,
    cardId,
    { cardId, cardType, appliedAmount, playedAt: Date.now() },
    { revenueDelta, expenditureDelta, deficitDelta },
  );
  if (!result.ok) return result;

  const siblings = groupSiblingIds(catalog, cardType, cardId);
  if (siblings.length > 0) {
    const updates: Record<string, unknown> = {};
    for (const siblingId of siblings) updates[`${base}/cardsLockedOut/${siblingId}`] = true;
    await update(ref(rtdb), updates);
  }

  return { ok: true };
}

export type ReserveTier = "safe" | "neutral" | "warning" | "critical";

/** Section 6 scoring tiers -- live indicator only, not the authoritative final score (Phase 7). */
export function getReserveTier(reserves: number): ReserveTier {
  if (reserves >= 15) return "safe";
  if (reserves === 14) return "neutral";
  if (reserves >= 10) return "warning";
  return "critical";
}
