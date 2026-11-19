import type { CardStatus } from "../services/ledgerService";
import "./lb-components.css";

interface Props {
  status: CardStatus;
  /** The exact label getCardStatus already computed (e.g. "Applied", "Did not pass", "Failed ballot", "Locked out", "Available") -- never invented here. */
  label: string;
}

const STATUS_CHIP_CLASS: Record<CardStatus, string> = {
  available: "st",
  applied: "st applied",
  didNotPass: "st fail",
  lockedOut: "st lock",
};

const STATUS_CHIP_ICON: Record<CardStatus, string> = {
  available: "",
  applied: "✓ ",
  didNotPass: "✕ ",
  lockedOut: "",
};

/**
 * Design step 1's StatusChip: Available (plain white, bordered), Applied
 * (light gray, check), Did not pass (light red/pink, x), Locked out (gray
 * hatched stripes) -- never blue or green, and never color alone (every
 * chip also carries its own icon + the exact status text). Priority isn't
 * one of CardStatus's values (a card can be Applied AND the selected
 * Priority at once), so it's a separate chip -- see PriorityChip below --
 * shown alongside this one, exactly as the old dual-badge approach did.
 */
function StatusChip({ status, label }: Props) {
  return (
    <span className={STATUS_CHIP_CLASS[status]}>
      {STATUS_CHIP_ICON[status]}
      {label}
    </span>
  );
}

export function PriorityChip() {
  return <span className="st prio">★ Priority</span>;
}

export default StatusChip;
