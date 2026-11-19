export type BudgetEffectTone = "help" | "hard";

/**
 * Design step 1: the BudgetEffectChip's small arrow (green up = helps the
 * budget, orange down = makes it harder) needs to know which of those two
 * buckets a given label falls into. Pure display classification, not a
 * new piece of game logic -- it reads the exact same label text the
 * existing shared helpers (getCardLedgerLabel/getChallengeLedgerEffect/
 * labelForAppliedCardAmount in challengeLedgerEffect.ts) already produce,
 * from their own fixed vocabulary: "Gain $X revenue" and "Save $X" always
 * help the budget; "Spend $X [from reserves]" and "Lose $X revenue"
 * always make it harder. Falls back to "hard" (the more common case, and
 * the one that doesn't imply something good happened) for any label
 * outside that vocabulary rather than throwing.
 */
export function budgetEffectTone(label: string): BudgetEffectTone {
  if (label.startsWith("Gain ") || label.startsWith("Save ")) return "help";
  return "hard";
}
