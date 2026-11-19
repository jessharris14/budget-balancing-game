import CardIcon from "./CardIcon";
import type { CardCatalog, PriorityCard } from "../types/catalog";
import type { CommissionPriority } from "../types/session";
import "./lb-components.css";

interface Props {
  priority: CommissionPriority | undefined;
  priorityCards: PriorityCard[];
  /** Used to look up the linked card's own title, so the tile can point people at exactly what to find in the catalog below. */
  catalog: CardCatalog;
}

/**
 * Design step 1's PriorityPanel: yellow-tinted panel with the P-card's own
 * icon (public/assets/cards/{id}.svg). Purely a read-only reflection of
 * commission.priority, unchanged from before this round -- funded is
 * never set here or by any dedicated control; it flips automatically the
 * instant the Manager/Administrator applies the one card
 * (PriorityCard.linkedCardId) that fulfills it.
 */
function PriorityTile({ priority, priorityCards, catalog }: Props) {
  if (!priority?.selectedCardId) return null;
  const card = priorityCards.find((c) => c.id === priority.selectedCardId);
  const funded = !!priority.funded;
  const linkedCard = card
    ? (card.linkedCardType === "revenue"
        ? catalog.revenueCards.find((c) => c.id === card.linkedCardId)
        : catalog.expenditureCards.find((c) => c.id === card.linkedCardId))
    : undefined;

  return (
    <div className="prio-panel">
      <CardIcon cardId={priority.selectedCardId} cardType="priority" />
      <div className="tx">
        <h3>Priority: {card?.title ?? priority.selectedCardId}</h3>
        {card && <p>{card.description}</p>}
        {linkedCard && !funded && (
          <p>
            Look for <strong>{linkedCard.title}</strong> in the catalog below (marked "Priority") to fund it.
          </p>
        )}
        <span className="st" style={{ alignSelf: "flex-start" }}>
          {funded ? "✅ Funded" : "⏳ Not yet funded"}
        </span>
      </div>
    </div>
  );
}

export default PriorityTile;
