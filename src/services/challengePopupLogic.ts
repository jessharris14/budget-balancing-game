export interface ChallengeQueueItem {
  cardId: string;
  triggeredAt: number;
}

/**
 * Pulls the player-facing "why is this happening" text out of a Challenge
 * card, for the pop-up and the Applied Challenges table. Pure and
 * DOM-free, same as selectChallengesToQueue, so the three cases the
 * Facilitator asked to be handled gracefully -- a real narrative, a card
 * with no narrative, and the catalog not having loaded yet (card is
 * undefined) -- are all directly testable: all three return null rather
 * than rendering "undefined" or an empty box.
 */
export function getChallengeNarrative(card: { facilitatorNarrative?: string } | undefined): string | null {
  const text = card?.facilitatorNarrative?.trim();
  return text ? text : null;
}

/**
 * Pure selection logic behind ChallengePopup.tsx's "which challenges should
 * pop up right now" decision, pulled out so it's testable without a DOM
 * (localStorage access is injected via isDismissed rather than called
 * directly) -- see ChallengePopup.tsx for how this is wired to real state.
 *
 * `prevApplied` is the commission's challengesApplied map as of the last
 * time this was checked, or `null` on this component's very first check
 * for a given commissionId (i.e. the moment it mounted -- a late join, a
 * refresh, or a reconnect). That distinction is the whole rule 2 behavior:
 * - prevApplied === null (first check): an entry already present only
 *   gets queued if it's within replayWindowMs of `now` -- otherwise it's
 *   old news, already covered by the Applied Challenges panel.
 * - prevApplied !== null (every check after the first): any entry whose
 *   triggeredAt wasn't there before is a genuinely new live trigger, and
 *   always gets queued, regardless of age.
 * Either way, an entry isDismissed() already is never re-queued, and
 * entries unchanged since the last check are skipped entirely.
 */
export function selectChallengesToQueue(
  applied: Record<string, number>,
  prevApplied: Record<string, number> | null,
  isDismissed: (item: ChallengeQueueItem) => boolean,
  now: number,
  replayWindowMs: number,
): ChallengeQueueItem[] {
  const isFirstRun = prevApplied === null;
  const newItems: ChallengeQueueItem[] = [];

  for (const [cardId, triggeredAt] of Object.entries(applied)) {
    if (prevApplied && prevApplied[cardId] === triggeredAt) continue;
    const item: ChallengeQueueItem = { cardId, triggeredAt };
    if (isDismissed(item)) continue;

    if (isFirstRun) {
      if (now - triggeredAt <= replayWindowMs) newItems.push(item);
    } else {
      newItems.push(item);
    }
  }

  return newItems.sort((a, b) => a.triggeredAt - b.triggeredAt);
}
