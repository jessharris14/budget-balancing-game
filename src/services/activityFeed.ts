import { getCardLedgerLabel, getChallengeLedgerEffect, labelForAppliedCardAmount } from "./challengeLedgerEffect";
import type { CardCatalog } from "../types/catalog";
import type { Commission, Participant } from "../types/session";

export interface ActivityEntry {
  /** Stable, unique within one Commission's feed (prefixed with the commissionId for the Facilitator's merged feed). */
  id: string;
  timestamp: number;
  text: string;
  /** Only set on the Facilitator's merged feed (buildFacilitatorActivity), where every entry needs to say which table it's from. */
  tableName?: string;
}

function nameFor(participants: Record<string, Participant>, uid: string): string {
  return participants[uid]?.name ?? uid;
}

function findCard(catalog: CardCatalog, cardType: "revenue" | "expenditure", cardId: string) {
  return cardType === "revenue"
    ? catalog.revenueCards.find((c) => c.id === cardId)
    : catalog.expenditureCards.find((c) => c.id === cardId);
}

/**
 * Builds the Activity feed for one Commission/table, from data the app
 * already stores -- no new database writes or rules needed. Newest first.
 *
 * One gap, flagged rather than papered over: "Chair elected" is NOT
 * included here. Commission.chairRoll/members.chairId record WHO won and
 * WHAT they rolled, but neither carries a timestamp of WHEN the Chair was
 * elected, so there's no "time" to show for it (every other entry here
 * reads a real stored timestamp). The smallest addition that would enable
 * it: a `chairElectedAt: number | null` field on Commission, written once
 * alongside chairId in rollForChair (facilitatorService.ts), plus a
 * matching RTDB rule -- not added here without asking first, per this
 * phase's "don't change database rules without checking" constraint.
 *
 * Motion-made/seconded entries are necessarily transient: activeMotion is
 * a single live node, not a log, so once a motion resolves (or a new one
 * replaces an unseconded one) its made/seconded moments are gone from the
 * database and so from this feed -- the permanent record from that point
 * on is the Motion Passes ("Applied: ...")/Motion Fails entry below.
 */
export function buildCommissionActivity(
  commission: Commission,
  catalog: CardCatalog,
  participants: Record<string, Participant>,
): ActivityEntry[] {
  const entries: ActivityEntry[] = [];

  const motion = commission.activeMotion;
  if (motion) {
    const card = findCard(catalog, motion.cardType, motion.cardId);
    const title = card?.title ?? motion.cardId;
    entries.push({
      id: `motion-made:${motion.cardId}:${motion.movedAt}`,
      timestamp: motion.movedAt,
      text: `${nameFor(participants, motion.movedBy)} moved to adopt ${title}`,
    });
    if (motion.secondedBy && motion.secondedAt != null) {
      entries.push({
        id: `motion-seconded:${motion.cardId}:${motion.secondedAt}`,
        timestamp: motion.secondedAt,
        text: `${nameFor(participants, motion.secondedBy)} seconded ${title}`,
      });
    }
  }

  // The Priority's one linked Revenue/Expenditure card, if a Priority has
  // been selected -- used below to notice when a decisionsLog entry is the
  // specific play that funded it (same stable-ID match applyCard itself
  // uses, not a title match).
  const selectedPriorityCard = commission.priority?.selectedCardId
    ? catalog.priorityCards.find((p) => p.id === commission.priority?.selectedCardId)
    : undefined;

  for (const entry of Object.values(commission.decisionsLog ?? {})) {
    const card = findCard(catalog, entry.cardType, entry.cardId);
    const title = card?.title ?? entry.cardId;
    const effectLabel = labelForAppliedCardAmount(entry.cardType, entry.appliedAmount);
    entries.push({
      id: `applied:${entry.cardId}:${entry.appliedAt}`,
      timestamp: entry.appliedAt,
      text: `Applied: ${effectLabel} — ${title}`,
    });

    if (entry.reconsideredAt != null) {
      entries.push({
        id: `reconsidered:${entry.cardId}:${entry.reconsideredAt}`,
        timestamp: entry.reconsideredAt,
        text: `Reconsidered: ${title}`,
      });
    }

    // Funded is a live flag, not its own log -- this is a derived "funding
    // happened" event, timestamped at the exact decisionsLog entry whose
    // atomic write flipped it (priorityFundedUpdateFragment folds the two
    // into the same update() in ledgerService.ts, so appliedAt is the true
    // moment funding landed, not an approximation).
    if (
      commission.priority?.funded &&
      entry.reconsideredAt == null &&
      selectedPriorityCard &&
      selectedPriorityCard.linkedCardId === entry.cardId &&
      selectedPriorityCard.linkedCardType === entry.cardType
    ) {
      entries.push({
        id: `priority-funded:${entry.cardId}:${entry.appliedAt}`,
        timestamp: entry.appliedAt,
        text: `Priority funded: ${title}`,
      });
    }
  }

  for (const entry of Object.values(commission.failedMotionsLog ?? {})) {
    const card = findCard(catalog, entry.cardType, entry.cardId);
    const title = card?.title ?? entry.cardId;
    const effectLabel = card ? getCardLedgerLabel(entry.cardType, card.amount, card.direction).label : null;
    entries.push({
      id: `failed:${entry.cardId}:${entry.failedAt}`,
      timestamp: entry.failedAt,
      text: effectLabel ? `Motion failed: ${title} (${effectLabel})` : `Motion failed: ${title}`,
    });
  }

  for (const [cardId, triggeredAt] of Object.entries(commission.challengesApplied ?? {})) {
    const card = catalog.challengeCards.find((c) => c.id === cardId);
    if (!card) continue;
    const effect = getChallengeLedgerEffect(card);
    entries.push({
      id: `challenge:${cardId}:${triggeredAt}`,
      timestamp: triggeredAt,
      text: `Challenge applied: ${card.title} — ${effect.label}`,
    });
  }

  // Resolved only (outcome/closedAt set) -- an open, still-voting ballot
  // isn't a past event yet. Totals only, never an individual vote: this
  // reads commission.ballotMeasures (yesCount/noCount), never the
  // voter-only-readable ballotVotes tree.
  for (const ballot of Object.values(commission.ballotMeasures ?? {})) {
    if (ballot.outcome == null || ballot.closedAt == null) continue;
    const card = findCard(catalog, ballot.cardType, ballot.cardId);
    const title = card?.title ?? ballot.cardId;
    const outcomeLabel = ballot.outcome === "passed" ? "Passed" : "Failed";
    entries.push({
      id: `ballot:${ballot.id}`,
      timestamp: ballot.closedAt,
      text: `Ballot Measure: ${title} — ${outcomeLabel} (Yes ${ballot.yesCount ?? 0}, No ${ballot.noCount ?? 0})`,
    });
  }

  return entries.sort((a, b) => b.timestamp - a.timestamp);
}

/** The Facilitator's feed: every table's entries merged, newest first, each tagged with its table name. */
export function buildFacilitatorActivity(
  commissions: Record<string, Commission>,
  catalog: CardCatalog,
  participants: Record<string, Participant>,
): ActivityEntry[] {
  const all: ActivityEntry[] = [];
  for (const [commissionId, commission] of Object.entries(commissions)) {
    const tableName = commission.name ?? `Table ${commissionId}`;
    for (const entry of buildCommissionActivity(commission, catalog, participants)) {
      all.push({ ...entry, id: `${commissionId}:${entry.id}`, tableName });
    }
  }
  return all.sort((a, b) => b.timestamp - a.timestamp);
}

/** How many entries are newer than the last time this viewer opened the panel -- the Activity button's dot/count. */
export function countNewSince(entries: ActivityEntry[], lastSeen: number): number {
  return entries.filter((e) => e.timestamp > lastSeen).length;
}

/** The timestamp to remember as "seen" the moment the panel is opened -- the newest entry currently in the feed. */
export function latestTimestamp(entries: ActivityEntry[]): number {
  return entries.length === 0 ? 0 : Math.max(...entries.map((e) => e.timestamp));
}
