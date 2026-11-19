import type { ReactNode } from "react";
import type { CardDisplayItem } from "../services/cardDisplay";
import BudgetEffectLabel from "./BudgetEffectLabel";
import CardIcon from "./CardIcon";
import StatusChip, { PriorityChip } from "./StatusChip";
import "./lb-components.css";

interface Props {
  items: CardDisplayItem[];
  renderAction?: (item: CardDisplayItem) => ReactNode;
}

/** Design step 1's compact List view: icon, title, Budget effect chip, status chip(s), and the role's own action when it applies. */
function CardList({ items, renderAction }: Props) {
  if (items.length === 0) return null;
  return (
    <div className="rows">
      {items.map((item) => (
        <div className="rowi" key={item.cardId}>
          <CardIcon cardId={item.cardId} cardType={item.cardType} />
          <div className="tt">
            <b>{item.title}</b>
            <BudgetEffectLabel label={item.effectLabel} />
          </div>
          <div className="rt">
            <div className="chips">
              <StatusChip status={item.status} label={item.statusLabel} />
              {item.isPriority && <PriorityChip />}
            </div>
            {renderAction?.(item)}
          </div>
        </div>
      ))}
    </div>
  );
}

export default CardList;
