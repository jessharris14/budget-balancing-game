import "./ManagerConsole.css";

interface Props {
  label: string;
  /** Plain-language deficit direction (e.g. "Deficit goes up ↑"); omitted for contexts (Decisions So Far, Card Under Debate) that only need the short label. */
  subtext?: string;
}

/**
 * One shared rendering of a card's (or Challenge's) budget-effect label --
 * "Spend $1", "Gain $2 revenue", etc., from getCardLedgerLabel/
 * getChallengeLedgerEffect/labelForAppliedCardAmount in
 * challengeLedgerEffect.ts -- so every place that shows one looks and
 * reads the same way. Deliberately neutral/dark text, never blue, yellow,
 * or green: those colors already mean Applied, Did not pass, and
 * Priority on the surrounding row.
 */
function BudgetEffectLabel({ label, subtext }: Props) {
  return (
    <span className="budget-effect">
      <span className="budget-effect-label">{label}</span>
      {subtext && <span className="budget-effect-subtext">{subtext}</span>}
    </span>
  );
}

export default BudgetEffectLabel;
