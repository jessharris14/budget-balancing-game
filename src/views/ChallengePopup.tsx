import { getChallengeNarrative } from "../services/challengePopupLogic";
import { getChallengeLedgerEffect, type LedgerLine } from "../services/challengeLedgerEffect";
import { uiIconUrl } from "../services/icons";
import BudgetEffectLabel from "./BudgetEffectLabel";
import CardIcon from "./CardIcon";
import EventPopup from "./EventPopup";
import type { ChallengeCard } from "../types/catalog";
import type { Commission } from "../types/session";

const LEDGER_LINE_LABELS: Record<LedgerLine, string> = {
  revenue: "Revenue",
  expenditures: "Expenditures",
  reserves: "Reserves",
};

function formatSigned(delta: number): string {
  if (delta === 0) return "$0";
  return delta > 0 ? `+$${delta.toLocaleString()}` : `-$${Math.abs(delta).toLocaleString()}`;
}

interface Props {
  commission: Commission;
  card: ChallengeCard;
  onDismiss: () => void;
}

/**
 * Purely presentational: renders ONE given Challenge queue item via the
 * shared EventPopup shell. Which item (if any) is current, the queueing,
 * and the per-item dismissal tracking all moved to EventPopupHost.tsx,
 * which mounts this -- that's what lets EventPopupHost arbitrate a
 * Challenge against a Motion pop-up arriving close together (3b: Challenge
 * always shows first) without this component needing to know a Motion
 * pop-up exists at all.
 */
function ChallengePopup({ commission, card, onDismiss }: Props) {
  const effect = getChallengeLedgerEffect(card);
  const narrative = getChallengeNarrative(card);
  // commission.ledger already reflects this challenge's effect -- Challenges
  // apply atomically the instant they're triggered, before this pop-up ever
  // appears -- so "now" is simply the live, current figure, the same one
  // every other view (status bar, scorecard, dashboard) reads.
  const deficitOrSurplus = commission.ledger.deficitOrSurplus;

  return (
    <EventPopup
      tone="challenge"
      iconSrc={uiIconUrl("challenge")}
      eyebrow={`Applied to ${commission.name ?? "this table"}`}
      heading="Challenge"
      headingId="challenge-popup-heading"
      vibrate
      actions={[{ label: "Got it", onClick: onDismiss, autoFocus: true }]}
    >
      <div className="cardrow">
        <CardIcon cardId={card.id} cardType="challenge" />
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <h3>{card.title}</h3>
          <BudgetEffectLabel label={effect.label} />
        </div>
      </div>
      <p style={{ fontSize: "15px", lineHeight: 1.5, margin: 0 }}>{card.printedText}</p>
      {narrative && (
        <p style={{ fontStyle: "italic", color: "var(--lb-muted)", borderLeft: "3px solid var(--lb-sun)", paddingLeft: "0.6rem", margin: 0 }}>
          <strong>What's happening:</strong> {narrative}
        </p>
      )}
      <p className="modal-note">
        {LEDGER_LINE_LABELS[effect.line]} {formatSigned(effect.amount)} —{" "}
        {effect.line === "reserves"
          ? `Reserves is now $${commission.ledger.reserves.toLocaleString()}`
          : `${deficitOrSurplus >= 0 ? "Surplus" : "Deficit"} is now $${Math.abs(deficitOrSurplus).toLocaleString()}`}
        <br />
        Applied to the ledger automatically -- Challenges can't be debated or declined.
      </p>
    </EventPopup>
  );
}

export default ChallengePopup;
