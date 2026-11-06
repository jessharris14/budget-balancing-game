import { getBalanceStatus } from "../services/ledgerService";
import "./BalanceStatusDisplay.css";

interface Props {
  deficitOrSurplus: number;
  /** "large" for a table card's headline figure, "compact" for a dense list/summary line. Both always pair the word with an icon, never color alone. */
  size?: "large" | "compact";
}

const ICONS: Record<string, string> = {
  surplus: "▲",
  deficit: "▼",
  balanced: "●",
};

/**
 * Phase 9a: the one rendering of getBalanceStatus (ledgerService.ts),
 * shared by the Facilitator Console's table cards and the Public View.
 * Deliberately not blue, yellow, or green -- those already mean Applied,
 * Did-not-pass, and Priority on the card-status rows elsewhere in the
 * app. Deficit gets a dark red treatment (explicitly fine per the design
 * brief); Surplus and Balanced both stay neutral dark/slate -- Surplus is
 * good news but still not green, so it can't be mistaken for a card
 * status color at a glance. Word + icon together, always -- never color
 * alone, so this reads correctly even in grayscale or for a colorblind
 * viewer.
 */
function BalanceStatusDisplay({ deficitOrSurplus, size = "large" }: Props) {
  const status = getBalanceStatus(deficitOrSurplus);
  return (
    <span className={`balance-status balance-status--${status.sign} balance-status--${size}`}>
      <span className="balance-status__icon" aria-hidden="true">
        {ICONS[status.sign]}
      </span>
      <span className="balance-status__text">
        {status.label}
        {status.amount > 0 && ` $${status.amount.toLocaleString()}`}
      </span>
    </span>
  );
}

export default BalanceStatusDisplay;
