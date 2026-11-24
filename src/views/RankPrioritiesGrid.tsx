import CardIcon from "./CardIcon";
import type { PriorityCard } from "../types/catalog";
import "./lb-components.css";

interface Props {
  priorityCards: PriorityCard[];
  selectedCardId: string | null | undefined;
  /** Chair only: present -> interactive (real radio inputs, native keyboard support). Omitted for every other role -> read-only display, not tappable, with the Chair's pick highlighted once recorded. */
  onSelect?: (cardId: string) => void;
  disabled?: boolean;
}

/**
 * The six Priority cards as a row of selectable cards (replacing the old
 * radio-button/plain bullet list) -- same six catalog.priorityCards, same
 * recordCommissionPriority write on selection (the caller still owns
 * that), same CardIcon lookup PriorityTile already uses. Real native
 * <input type="radio"> elements (visually hidden, not display:none) for
 * the Chair give keyboard arrow-key cycling and a focus ring for free,
 * rather than reimplementing radiogroup keyboard handling by hand.
 */
function RankPrioritiesGrid({ priorityCards, selectedCardId, onSelect, disabled }: Props) {
  const interactive = typeof onSelect === "function";

  return (
    <div className="prio-grid" role="radiogroup" aria-label="Rank Priorities" aria-readonly={interactive ? undefined : true}>
      {priorityCards.map((card) => {
        const selected = selectedCardId === card.id;
        const className = `prio-card${selected ? " sel" : ""}${interactive ? "" : " readonly"}`;
        const body = (
          <span className="prio-card__body">
            <CardIcon cardId={card.id} cardType="priority" />
            <b>{card.title}</b>
            <span className="prio-card__desc">{card.description}</span>
          </span>
        );

        if (interactive) {
          return (
            <label key={card.id} className={className}>
              <input
                type="radio"
                name="priority"
                className="prio-card__input"
                checked={selected}
                disabled={disabled}
                onChange={() => onSelect(card.id)}
              />
              {body}
              {selected && (
                <span className="prio-card__check" aria-hidden="true">
                  ✓
                </span>
              )}
            </label>
          );
        }

        return (
          <div key={card.id} className={className} role="radio" aria-checked={selected} tabIndex={-1}>
            {body}
            {selected && (
              <span className="prio-card__check" aria-hidden="true">
                ✓
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default RankPrioritiesGrid;
