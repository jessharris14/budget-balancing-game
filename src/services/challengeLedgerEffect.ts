import type { ChallengeCard } from "../types/catalog";

export type LedgerLine = "revenue" | "expenditures" | "reserves";

export interface LedgerLineDelta {
  revenueDelta: number;
  expenditureDelta: number;
  reservesDelta: number;
}

export interface ChallengeLedgerEffect {
  line: LedgerLine;
  /** Signed amount applied to that one line -- positive means the line goes up. */
  amount: number;
  /** Short plain-language action label with the dollar amount, e.g. "Spend $1", "Lose $2 revenue". */
  label: string;
}

const ZERO_DELTA: LedgerLineDelta = { revenueDelta: 0, expenditureDelta: 0, reservesDelta: 0 };

function deltaFor(line: LedgerLine, amount: number): LedgerLineDelta {
  if (line === "revenue") return { ...ZERO_DELTA, revenueDelta: amount };
  if (line === "expenditures") return { ...ZERO_DELTA, expenditureDelta: amount };
  return { ...ZERO_DELTA, reservesDelta: amount };
}

/**
 * Which real ledger line each seeded Challenge card actually belongs to, and
 * the plain-language label to show for it -- confirmed against each card's
 * own facilitatorNarrative (see the delivery notes this was introduced
 * with): mandated payments, fire/shelter costs, healthcare premiums, road
 * repair, utility costs, an incentive package, and equipment replacement are
 * all real spending (Expenditures up); an efficiency study's savings is
 * Expenditures down; lower property values and a lower sales-tax forecast
 * are both Revenue down; a tornado's recovery cost is drawn from Reserves,
 * unchanged from before this mapping existed.
 *
 * Deliberately code-side, not a catalog field -- the Facilitator can't
 * re-seed Firestore easily from their setup this round. A future catalog
 * revision could instead add an optional field directly on ChallengeCard,
 * e.g.:
 *   ledgerEffect?: { line: "revenue" | "expenditures" | "reserves"; direction: "increase" | "decrease"; label: string }
 * at which point this table becomes the fallback for any card that doesn't
 * carry one, rather than the only source of truth.
 */
const CHALLENGE_EFFECT_SPECS: Record<string, { line: LedgerLine; direction: "increase" | "decrease" }> = {
  C1: { line: "reserves", direction: "decrease" },
  C2: { line: "expenditures", direction: "increase" },
  C3: { line: "expenditures", direction: "decrease" },
  C4: { line: "revenue", direction: "decrease" },
  C5: { line: "expenditures", direction: "increase" },
  C6: { line: "expenditures", direction: "increase" },
  C7: { line: "expenditures", direction: "increase" },
  C8: { line: "revenue", direction: "decrease" },
  C9: { line: "expenditures", direction: "increase" },
  C10: { line: "expenditures", direction: "increase" },
  C11: { line: "expenditures", direction: "increase" },
};

/**
 * Exported directly (not just used internally by getChallengeLedgerEffect)
 * so the "Gain $X revenue" branch -- not reachable through any seeded
 * challenge today, since none increases revenue -- is still testable
 * ahead of a future catalog actually using it.
 */
export function labelFor(line: LedgerLine, direction: "increase" | "decrease", amount: number): string {
  if (line === "reserves") return `Spend $${amount} from reserves`;
  if (line === "expenditures") return direction === "increase" ? `Spend $${amount}` : `Save $${amount}`;
  return direction === "increase" ? `Gain $${amount} revenue` : `Lose $${amount} revenue`;
}

/**
 * The ledger-line effect and display label for a Challenge card, used both
 * to actually apply the card (applyChallengeToLedger) and to display it
 * (the pop-up, the Applied Challenges table) -- one function, one source of
 * truth, so what's displayed can never drift from what was applied.
 *
 * Falls back, for any challenge id not in CHALLENGE_EFFECT_SPECS (a future
 * catalog addition this code hasn't been taught about yet), to the card's
 * own target/direction/amount exactly as the old deficit-only behavior
 * used them -- except routed through Expenditures rather than a direct
 * deficit edit, so the single derive-the-deficit-from-revenue-and-
 * expenditures formula still holds everywhere. The net effect on the
 * deficit is identical to the old behavior; only the label is generic
 * ("Budget impact"), since this code doesn't know which real line an
 * unmapped card belongs to.
 */
export function getChallengeLedgerEffect(card: ChallengeCard): ChallengeLedgerEffect {
  const spec = CHALLENGE_EFFECT_SPECS[card.id];
  if (spec) {
    const amount = spec.direction === "increase" ? card.amount : -card.amount;
    return { line: spec.line, amount, label: labelFor(spec.line, spec.direction, card.amount) };
  }

  if (card.target === "reserves") {
    const amount = card.direction === "decrease" ? -card.amount : card.amount;
    return { line: "reserves", amount, label: `Budget impact: reserves ${amount >= 0 ? "+" : "-"}$${Math.abs(amount)}` };
  }
  // Old deficit-only convention: "decrease" direction helped the budget
  // (deficitOrSurplus, stored as revenue - expenditures, went up), which is
  // the same net effect as expenditures going DOWN; "increase" direction
  // hurt the budget, the same net effect as expenditures going UP.
  const amount = card.direction === "decrease" ? -card.amount : card.amount;
  return { line: "expenditures", amount, label: `Budget impact: $${Math.abs(amount)}` };
}

export function challengeLedgerDelta(effect: ChallengeLedgerEffect): LedgerLineDelta {
  return deltaFor(effect.line, effect.amount);
}
