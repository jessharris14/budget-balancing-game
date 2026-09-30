import type { CardCatalog, PriorityCard } from "../types/catalog";
import type { CommissionPriority } from "../types/session";
import "./ManagerConsole.css";

interface Props {
  priority: CommissionPriority | undefined;
  priorityCards: PriorityCard[];
  /** Used to look up the linked card's own title, so the tile can point people at exactly what to find in the catalog table below. */
  catalog: CardCatalog;
}

/**
 * Persistent Priority display, visible to every role during Main Game.
 * Purely a read-only reflection of commission.priority -- funded is never
 * set here or by any dedicated control; it flips automatically the
 * instant the Manager/Administrator applies the one card
 * (PriorityCard.linkedCardId) that fulfills it, via the normal
 * apply/reconsider flow (see priorityFundedUpdateFragment in ledgerService.ts).
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
    <div className={`lobby-commission priority-tile ${funded ? "priority-funded" : "priority-unfunded"}`}>
      <h3>Priority: {card?.title ?? priority.selectedCardId}</h3>
      {card && <p>{card.description}</p>}
      {linkedCard && !funded && (
        <p>
          Look for <strong>{linkedCard.title}</strong> in the catalog below (marked "Priority") to fund it.
        </p>
      )}
      <p className="priority-status">{funded ? "✅ Funded" : "⏳ Not yet funded"}</p>
    </div>
  );
}

export default PriorityTile;
