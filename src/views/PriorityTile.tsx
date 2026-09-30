import type { PriorityCard } from "../types/catalog";
import type { CommissionPriority } from "../types/session";
import "./ManagerConsole.css";

interface Props {
  priority: CommissionPriority | undefined;
  priorityCards: PriorityCard[];
  /**
   * Only passed by the Manager/Administrator console. priorityCards have no
   * reliable catalog-level mapping to the specific Revenue/Expenditure
   * card(s) that fulfill them in a given session's real deliberation, so
   * -- matching this app's existing trust model (the Chair's highlight,
   * motion/second signals are human judgment calls too) -- funding is a
   * manual toggle the Manager/Administrator flips, not something inferred
   * from any one card being applied.
   */
  onToggleFunded?: () => void;
  toggling?: boolean;
}

/**
 * Persistent Priority display, visible to every role during Main Game
 * (spec bugfix round: Rank Priorities selection previously vanished the
 * instant Main Game started, with no way for any role to see it again).
 */
function PriorityTile({ priority, priorityCards, onToggleFunded, toggling }: Props) {
  if (!priority?.selectedCardId) return null;
  const card = priorityCards.find((c) => c.id === priority.selectedCardId);
  const funded = !!priority.funded;

  return (
    <div className={`lobby-commission priority-tile ${funded ? "priority-funded" : "priority-unfunded"}`}>
      <h3>Priority: {card?.title ?? priority.selectedCardId}</h3>
      {card && <p>{card.description}</p>}
      <p className="priority-status">{funded ? "✅ Funded" : "⏳ Not yet funded"}</p>
      {onToggleFunded && (
        <button onClick={onToggleFunded} disabled={toggling}>
          {funded ? "Mark as not yet funded" : "Mark as funded"}
        </button>
      )}
    </div>
  );
}

export default PriorityTile;
