import { get, push, ref, runTransaction, update } from "firebase/database";
import { rtdb } from "../firebase/config";
import type { CardCatalog, ChallengeCard, EffectDirection, ExpenditureCard, RevenueCard } from "../types/catalog";
import type { CardInPlay, Commission, CommissionLedger, DecisionLogEntry, SessionPhase } from "../types/session";

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

export type CardStatus = "applied" | "didNotPass" | "lockedOut" | "available";

export interface CardStatusInfo {
  status: CardStatus;
  label: string;
}

/**
 * Change 3: a card's current status for the catalog tables' Status
 * column/row color, replacing the removed "Decisions So Far" list.
 * Currently played always wins (blue, "Applied"). Otherwise, a card that
 * once failed (Motion Fails, or a failed Ballot Measure) shows yellow,
 * "Did not pass" / "Failed ballot" -- EXCEPT a card reset by the Chair
 * for lack of a second never reaches this function as a failure at all
 * (no failedMotionsLog entry is ever written for that case), so it's
 * simply never yellow for that reason.
 *
 * "If a card is reconsidered after being applied, it returns to a
 * normal unhighlighted row" even when an OLDER failure exists for the
 * same card (fail, then later moved again and passed, then later
 * reconsidered) -- handled by comparing timestamps: the most recent of
 * (every reconsideredAt recorded for this card) vs (every failedAt
 * recorded for this card, motion or ballot) wins. A reconsideration more
 * recent than any failure means "available again, not yellow"; a
 * failure more recent than any reconsideration (or than ever having been
 * applied at all) means "yellow."
 */
export function getCardStatus(commission: Commission, cardId: string, cardType: CardType): CardStatusInfo {
  if (commission.cardsInPlay?.[cardId]) {
    return { status: "applied", label: "Applied" };
  }
  if (commission.cardsLockedOut?.[cardId]) {
    return { status: "lockedOut", label: "Locked out" };
  }

  let lastReconsideredAt = -Infinity;
  for (const entry of Object.values(commission.decisionsLog ?? {})) {
    if (entry.cardId === cardId && entry.cardType === cardType && entry.reconsideredAt != null) {
      lastReconsideredAt = Math.max(lastReconsideredAt, entry.reconsideredAt);
    }
  }

  let lastMotionFailedAt = -Infinity;
  for (const entry of Object.values(commission.failedMotionsLog ?? {})) {
    if (entry.cardId === cardId && entry.cardType === cardType) {
      lastMotionFailedAt = Math.max(lastMotionFailedAt, entry.failedAt);
    }
  }
  let lastBallotFailedAt = -Infinity;
  for (const ballot of Object.values(commission.ballotMeasures ?? {})) {
    if (ballot.cardId === cardId && ballot.cardType === cardType && ballot.outcome === "failed" && ballot.closedAt != null) {
      lastBallotFailedAt = Math.max(lastBallotFailedAt, ballot.closedAt);
    }
  }

  const lastFailedAt = Math.max(lastMotionFailedAt, lastBallotFailedAt);
  if (lastFailedAt > lastReconsideredAt && lastFailedAt > -Infinity) {
    return lastBallotFailedAt >= lastMotionFailedAt
      ? { status: "didNotPass", label: "Failed ballot" }
      : { status: "didNotPass", label: "Did not pass" };
  }

  return { status: "available", label: "Available" };
}

/** True if this card is the one PriorityCard.linkedCardId the Commission's currently-selected Priority refers to -- used to badge it in the catalog tables so every role can find it. */
export function isSelectedPriorityCard(
  catalog: CardCatalog,
  commission: Commission,
  cardType: CardType,
  cardId: string,
): boolean {
  const selectedCardId = commission.priority?.selectedCardId;
  if (!selectedCardId) return false;
  const priorityCard = catalog.priorityCards.find((p) => p.id === selectedCardId);
  return !!priorityCard && priorityCard.linkedCardId === cardId && priorityCard.linkedCardType === cardType;
}

/**
 * Computes the priority/funded update fragment (if any) for applying or
 * reconsidering this specific card -- a pure read, no write of its own,
 * so the caller can fold it into the SAME update() call as the
 * decisionsLog mutation it belongs with. That's what makes the two
 * atomic: RTDB rejects a multi-location update() as a whole if any one of
 * its paths fails security-rule validation, so a Priority's matching card
 * can no longer end up "applied" in Decisions So Far while its funded
 * flip silently failed (the exact partial-state bug this was built to
 * close). There's no separate "mark as funded" action; funding is always
 * a direct consequence of applying the one real card the Priority refers
 * to (PriorityCard.linkedCardId/linkedCardType -- a stable catalog ID,
 * never matched by title text), same as every other ledger effect here.
 */
async function priorityFundedUpdateFragment(
  base: string,
  catalog: CardCatalog,
  cardType: CardType,
  cardId: string,
  funded: boolean,
): Promise<Record<string, unknown>> {
  const selectedCardIdSnapshot = await get(ref(rtdb, `${base}/priority/selectedCardId`));
  const selectedCardId: string | null = selectedCardIdSnapshot.val();
  if (!selectedCardId) return {};
  const priorityCard = catalog.priorityCards.find((p) => p.id === selectedCardId);
  if (!priorityCard) return {};
  if (priorityCard.linkedCardId === cardId && priorityCard.linkedCardType === cardType) {
    return { [`${base}/priority/funded`]: funded };
  }
  return {};
}

/**
 * Applies a resolved card's ledger delta, marks it played, and appends a
 * permanent decisionsLog entry.
 *
 * Uses transactions rather than a plain multi-path update, because the
 * naive "read this.commission prop, compute new absolute values, write
 * them" approach has a real race: if the Manager/Administrator applies two
 * different cards in quick succession, the second write can be computed
 * from a stale pre-first-write ledger snapshot and clobber the first
 * card's effect once it lands. Each transaction instead reads the current
 * server value at write time:
 *
 * 1. Claim cardsInPlay/{cardId} transactionally (write only if absent) --
 *    same "first write wins" pattern as Phase 2's single-seat role claims.
 *    This is what makes two near-simultaneous plays of the SAME card safe.
 * 2. Only if the claim succeeds, write the decisionsLog entry (a freshly
 *    generated push-id, so no race possible) and fold the delta into
 *    `ledger` via its own transaction, reading the fresh ledger rather
 *    than a stale prop -- this is what makes rapid sequential plays of
 *    DIFFERENT cards safe.
 *
 * cardsLockedOut writes are a plain (non-transactional) update: they're
 * idempotent absolute sets, not read-modify-write, so there's nothing to
 * race on for a single card's own lockout -- the one narrow gap is if the
 * same actor plays two different siblings of the same exclusivity group
 * within the same instant from two open tabs, which could transiently lock
 * out fewer cards than it should. Accepted as a known limitation given a
 * single trusted Manager/Administrator seat, not defended against further.
 *
 * extraUpdates (e.g. a Priority's funded flip) is folded into the SAME
 * update() call as the decisionsLog entry, so the two either land
 * together or neither does. If that combined write is rejected, the
 * cardsInPlay claim is rolled back too -- otherwise the card would be
 * stuck "Played" with no decisionsLog entry to show for it, trading one
 * partial-state bug for another.
 */
async function claimAndApplyLedgerDelta(
  base: string,
  cardId: string,
  cardType: CardType,
  appliedAmount: number,
  deltas: { revenueDelta: number; expenditureDelta: number; deficitDelta: number },
  extraUpdates: Record<string, unknown>,
): Promise<ActionResult> {
  const logEntryId = push(ref(rtdb, `${base}/decisionsLog`)).key;
  if (!logEntryId) return { ok: false, reason: "Could not generate a decision log entry." };

  const now = Date.now();
  const cardInPlay: CardInPlay = { cardId, cardType, appliedAmount, playedAt: now, logEntryId };

  const claim = await runTransaction(ref(rtdb, `${base}/cardsInPlay/${cardId}`), (current: CardInPlay | null) => {
    if (current !== null) return undefined;
    return cardInPlay;
  });
  if (!claim.committed) return { ok: false, reason: "This card has already been played." };

  const logEntry: DecisionLogEntry = { cardId, cardType, appliedAmount, appliedAt: now, reconsideredAt: null };
  try {
    await update(ref(rtdb), { [`${base}/decisionsLog/${logEntryId}`]: logEntry, ...extraUpdates });
  } catch (err) {
    await runTransaction(ref(rtdb, `${base}/cardsInPlay/${cardId}`), (current: CardInPlay | null) => {
      if (current?.logEntryId === logEntryId) return null;
      return current;
    });
    throw err;
  }

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
 * Change 3: records a card's motion reaching Motion Fails -- never called
 * for the Chair's "No Second -- Reset Motion" (that motion never reached
 * a vote, so it leaves no record at all, by design). This is what lets
 * getCardStatus show "Did not pass" for this card until it's moved again
 * and either passes (Applied) or is superseded by a later reconsideration.
 */
export async function recordFailedMotion(
  code: string,
  commissionId: string,
  cardId: string,
  cardType: CardType,
): Promise<void> {
  const base = `sessions/${code}/commissions/${commissionId}`;
  const entryId = push(ref(rtdb, `${base}/failedMotionsLog`)).key;
  if (!entryId) return;
  await update(ref(rtdb), {
    [`${base}/failedMotionsLog/${entryId}`]: { cardId, cardType, failedAt: Date.now() },
  });
}

/**
 * Applies a Revenue or Expenditure card's dollar impact to the ledger and
 * marks it played. Assumes the verbal motion/vote already happened -- per
 * spec Section 8a #1, no role records vote outcomes in-app at all; the
 * real verbal vote plus the Manager/Administrator's own judgment is the
 * actual mechanism, matching a live human-facilitated meeting rather than
 * a strict rules engine.
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
  const fundedUpdate = await priorityFundedUpdateFragment(base, catalog, cardType, cardId, true);
  const result = await claimAndApplyLedgerDelta(
    base,
    cardId,
    cardType,
    appliedAmount,
    { revenueDelta, expenditureDelta, deficitDelta },
    fundedUpdate,
  );
  if (!result.ok) return result;

  const siblings = groupSiblingIds(catalog, cardType, cardId);
  if (siblings.length > 0) {
    const updates: Record<string, unknown> = {};
    for (const siblingId of siblings) updates[`${base}/cardsLockedOut/${siblingId}`] = true;
    await update(ref(rtdb), updates);
  }

  // The pending motion (if any) is resolved the instant its own card is
  // applied -- a stale "moved by X" banner for an already-decided card
  // would just be confusing, since a motion is only ever a pointer to what
  // the room is currently debating, not a record of what happened.
  const motionSnapshot = await get(ref(rtdb, `${base}/activeMotion`));
  if (motionSnapshot.exists() && motionSnapshot.val()?.cardId === cardId) {
    await update(ref(rtdb), { [`${base}/activeMotion`]: null });
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
 *
 * Marks the corresponding decisionsLog entry (via cardsInPlay's stored
 * logEntryId) with reconsideredAt rather than deleting it -- the log is a
 * permanent history distinct from cardsInPlay's "currently active" state,
 * so a reconsidered decision still shows up with a reversal marker instead
 * of disappearing.
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

  const { cardType, appliedAmount, logEntryId } = claimed;

  // Bundled into one update() so the reconsideredAt marker and the
  // Priority's funded flip either land together or neither does -- same
  // atomicity reasoning as claimAndApplyLedgerDelta's extraUpdates. If
  // this is rejected, restore the cardsInPlay entry just deleted above
  // rather than leaving the card "Available" again with no reversal
  // marker on its decisionsLog entry.
  const fundedUpdate = await priorityFundedUpdateFragment(base, catalog, cardType, cardId, false);
  try {
    await update(ref(rtdb), { [`${base}/decisionsLog/${logEntryId}/reconsideredAt`]: Date.now(), ...fundedUpdate });
  } catch (err) {
    await runTransaction(ref(rtdb, `${base}/cardsInPlay/${cardId}`), (current: CardInPlay | null) => {
      if (current !== null) return undefined;
      return claimed;
    });
    throw err;
  }

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
 * Pure dollar math for a Challenge card's effect, split out so the Applied
 * Challenges table (Change 2) can show each challenge's effect on deficit
 * and reserves -- and a running total across all of them -- using the
 * exact same computation applyChallengeToLedger uses, instead of a second
 * copy of these sign rules living in a view component.
 */
export function computeChallengeDeltas(card: ChallengeCard): { reservesDelta: number; deficitDelta: number } {
  if (card.target === "reserves") {
    const delta = card.direction === "decrease" ? -card.amount : card.amount;
    return { reservesDelta: delta, deficitDelta: 0 };
  }
  const delta = card.direction === "decrease" ? card.amount : -card.amount;
  return { reservesDelta: 0, deficitDelta: delta };
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

  const { reservesDelta, deficitDelta } = computeChallengeDeltas(card);
  await runTransaction(ref(rtdb, `${base}/ledger`), (current: CommissionLedger | null) => {
    if (current === null) return current;
    return {
      ...current,
      reserves: current.reserves + reservesDelta,
      deficitOrSurplus: current.deficitOrSurplus + deficitDelta,
    };
  });

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
  const fundedUpdate = await priorityFundedUpdateFragment(base, catalog, cardType, cardId, true);
  const result = await claimAndApplyLedgerDelta(
    base,
    cardId,
    cardType,
    appliedAmount,
    { revenueDelta, expenditureDelta, deficitDelta },
    fundedUpdate,
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

export type PublicTrustTier = "positive" | "neutral" | "negative";

/** Section 6's 4th scoring dimension -- same live-indicator caveat as getReserveTier. */
export function getPublicTrustTier(publicTrustTally: number): PublicTrustTier {
  if (publicTrustTally > 0) return "positive";
  if (publicTrustTally === 0) return "neutral";
  return "negative";
}

/** Section 6 point value for a given tier -- used by both the live indicator (Phase 4/5) and Phase 7's authoritative final score. */
export function getReserveTierPoints(tier: ReserveTier): number {
  switch (tier) {
    case "safe":
      return 1;
    case "neutral":
      return 0;
    case "warning":
      return -1;
    case "critical":
      return -2;
  }
}

/** Section 6 point value for a given Public Trust tier. */
export function getPublicTrustTierPoints(tier: PublicTrustTier): number {
  switch (tier) {
    case "positive":
      return 1;
    case "neutral":
      return 0;
    case "negative":
      return -1;
  }
}
