import type { CardType } from "./ledgerService";
import type { ChallengeCard, EffectDirection } from "../types/catalog";

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

function labelForLineAmount(line: LedgerLine, signedAmount: number): string {
  return labelFor(line, signedAmount >= 0 ? "increase" : "decrease", Math.abs(signedAmount));
}

export interface CardLedgerLabel {
  /** e.g. "Spend $1", "Gain $2 revenue". Same vocabulary as a Challenge's label. */
  label: string;
  /** Plain-language deficit direction, e.g. "Deficit goes up ↑" -- deliberately neutral text, not colored, since blue/yellow/green already mean Applied/Did-not-pass/Priority on these rows. */
  subtext: string;
}

/**
 * The same "Spend/Save/Gain revenue/Lose revenue" label vocabulary as
 * getChallengeLedgerEffect above, for an ordinary Revenue or Expenditure
 * catalog card. Unlike a Challenge's per-card direction (which describes
 * the real line's own movement), a Revenue/Expenditure card's `direction`
 * is deficit-relative -- see ledgerService.ts's computeDeltas, whose sign
 * rule this mirrors exactly: a Revenue card's "decrease" means more
 * revenue comes in (the line goes UP); an Expenditure card's "decrease"
 * means less gets spent (the line goes DOWN). That inversion for Revenue
 * cards (but not Expenditure cards) is why this can't just call
 * getChallengeLedgerEffect's labelFor with `direction` unchanged.
 *
 * Falls back to a neutral, non-crashing label for a `direction` that
 * isn't literally "increase" or "decrease" -- the type system rules this
 * out today, but a future catalog field or a malformed row shouldn't be
 * able to render "undefined" into the UI.
 */
export function getCardLedgerLabel(cardType: CardType, amount: number, direction: EffectDirection): CardLedgerLabel {
  if (direction !== "increase" && direction !== "decrease") {
    return { label: `Budget impact: $${amount}`, subtext: "Effect unclear" };
  }
  const line: LedgerLine = cardType === "revenue" ? "revenue" : "expenditures";
  const lineDirection: "increase" | "decrease" =
    cardType === "revenue" ? (direction === "decrease" ? "increase" : "decrease") : direction;
  const signedAmount = lineDirection === "increase" ? amount : -amount;
  return {
    label: labelForLineAmount(line, signedAmount),
    subtext: direction === "decrease" ? "Deficit goes down ↓" : "Deficit goes up ↑",
  };
}

/**
 * Same label vocabulary again, but for a DecisionsLog entry, which only
 * ever stores the already-signed line delta it actually applied
 * (appliedAmount -- see ledgerService.ts's applyCard/claimAndApplyLedgerDelta),
 * not the original catalog card's `direction`. Reading the sign straight
 * off what was really applied means this can never disagree with the
 * ledger, even for a card later removed from the catalog.
 */
export function labelForAppliedCardAmount(cardType: CardType, appliedAmount: number): string {
  const line: LedgerLine = cardType === "revenue" ? "revenue" : "expenditures";
  return labelForLineAmount(line, appliedAmount);
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
