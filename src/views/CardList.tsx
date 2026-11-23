import type { ReactNode } from "react";
import type { CardDisplayItem } from "../services/cardDisplay";
import BudgetEffectLabel from "./BudgetEffectLabel";
import CardIcon from "./CardIcon";
import StatusChip, { PriorityChip } from "./StatusChip";
import { useIsDesktop } from "../hooks/useIsDesktop";
import "./lb-components.css";

interface Props {
  items: CardDisplayItem[];
  renderAction?: (item: CardDisplayItem) => ReactNode;
  /** Desktop-only: the one row to highlight with a left River Blue bar (the Administrator's card under debate). Unused on phone. */
  highlightCardId?: string;
}

/**
 * Design step 1's compact List view on phone: icon, title, Budget effect
 * chip, status chip(s), and the role's own action when it applies.
 *
 * Desktop (screen 12): the same rows become a wide table -- icon, Card,
 * Budget effect, full Impact text, Status, and an Actions column, but
 * only when this role actually has actions at all (renderAction was
 * passed); a role with none (Public Hearing Speaker) gets one fewer
 * column rather than an empty one on every row.
 */
function CardList({ items, renderAction, highlightCardId }: Props) {
  const isDesktop = useIsDesktop();
  if (items.length === 0) return null;

  if (isDesktop) {
    const hasActions = typeof renderAction === "function";
    return (
      <div className={`dtable${hasActions ? "" : " noact"}`}>
        <div className="dtr h">
          <span />
          <span>Card</span>
          <span>Budget effect</span>
          <span>Impact</span>
          <span>Status</span>
          {hasActions && <span style={{ textAlign: "right" }}>Actions</span>}
        </div>
        {items.map((item) => (
          <div className={`dtr${item.cardId === highlightCardId ? " sel" : ""}`} key={item.cardId}>
            <CardIcon cardId={item.cardId} cardType={item.cardType} className="ic" />
            <b>{item.title}</b>
            <BudgetEffectLabel label={item.effectLabel} />
            <div className="im">{item.impactBullets.join(" ")}</div>
            <div className="chips" style={{ justifySelf: "start" }}>
              <StatusChip status={item.status} label={item.statusLabel} />
              {item.isPriority && <PriorityChip />}
            </div>
            {hasActions && <div className="acts">{renderAction?.(item)}</div>}
          </div>
        ))}
      </div>
    );
  }

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
