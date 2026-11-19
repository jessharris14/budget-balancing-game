import { budgetEffectTone } from "../services/budgetEffectTone";
import "./lb-components.css";

interface Props {
  label: string;
  /** No longer rendered (design step 1: the chip's arrow now carries the direction a subtext line used to spell out) -- kept optional so no caller needs editing just for this. */
  subtext?: string;
}

/**
 * The shared "Budget effect" chip (design step 1's BudgetEffectChip):
 * every place in the app that shows a card's or Challenge's budget effect
 * (Gain/Lose $X revenue, Spend $X, Save $X, Spend $X from reserves --
 * always from getCardLedgerLabel/getChallengeLedgerEffect/
 * labelForAppliedCardAmount in challengeLedgerEffect.ts, never invented
 * here) renders through this one component, unchanged from before this
 * round. Neutral white chip, dark text -- the arrow (green up for labels
 * that help the budget, orange down for labels that make it harder) is
 * what now carries the direction a text subtext used to spell out, so
 * meaning is never color alone: the word ("Gain"/"Save" vs "Spend"/
 * "Lose") and the arrow glyph both say it independently of color.
 */
function BudgetEffectLabel({ label }: Props) {
  const tone = budgetEffectTone(label);
  return (
    <span className={`fx ${tone}`}>
      <i aria-hidden="true">{tone === "help" ? "▲" : "▼"}</i>
      {label}
    </span>
  );
}

export default BudgetEffectLabel;
