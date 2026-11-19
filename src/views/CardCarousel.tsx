import { useEffect, useRef, useState, type ReactNode } from "react";
import type { CardDisplayItem } from "../services/cardDisplay";
import BudgetEffectLabel from "./BudgetEffectLabel";
import CardIcon from "./CardIcon";
import StatusChip, { PriorityChip } from "./StatusChip";
import { uiIconUrl } from "../services/icons";
import "./lb-components.css";

interface Props {
  items: CardDisplayItem[];
  /** The caller's role-specific action for one card (I move to adopt/Second/Motion in progress for Commissioners, Reconsider for the Administrator, or nothing) -- never decided in here. */
  renderAction?: (item: CardDisplayItem) => ReactNode;
}

const SLIDE_WIDTH = 322; // slide (310px) + gap (12px), matches lb-components.css's .slide flex-basis

function isTypingTarget(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (el as HTMLElement).isContentEditable;
}

/**
 * Design step 1's Swipe carousel: one card per slide (CSS scroll-snap-free
 * -- a translateX track, same technique the approved mockup uses, no
 * carousel library). Per-card-type index memory (keyed by the item's own
 * cardType) so switching Revenue/Expenditure and back restores where you
 * were, and -- the explicit requirement -- a live prop update that only
 * changes card STATUSES (not which cards exist) never resets the index,
 * since it's plain React state untouched by a re-render with new props.
 */
function CardCarousel({ items, renderAction }: Props) {
  const cardType = items[0]?.cardType ?? "revenue";
  const [idxByType, setIdxByType] = useState<Record<string, number>>({});
  const containerRef = useRef<HTMLDivElement>(null);

  const idx = Math.min(idxByType[cardType] ?? 0, Math.max(0, items.length - 1));

  function setIdx(n: number) {
    setIdxByType((prev) => ({ ...prev, [cardType]: Math.max(0, Math.min(items.length - 1, n)) }));
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(document.activeElement)) return;
      if (e.key === "ArrowLeft") setIdx(idx - 1);
      else if (e.key === "ArrowRight") setIdx(idx + 1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, cardType, items.length]);

  if (items.length === 0) return null;

  return (
    <div ref={containerRef} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div className="vp">
        <div className="trk" style={{ transform: `translateX(${-(idx * SLIDE_WIDTH)}px)` }}>
          {items.map((item) => (
            <div key={item.cardId} className={`slide${item.status === "lockedOut" ? " is-lock" : ""}`}>
              <div className="top">
                <CardIcon cardId={item.cardId} cardType={item.cardType} />
                <div className="tt">
                  <div className="chips">
                    <StatusChip status={item.status} label={item.statusLabel} />
                    {item.isPriority && <PriorityChip />}
                  </div>
                  <h3>{item.title}</h3>
                </div>
              </div>
              <span className="imp-h">Impact</span>
              <ul className="imp">
                {item.impactBullets.map((bullet, i) => (
                  <li key={i}>{bullet}</li>
                ))}
              </ul>
              <div className="foot">
                <BudgetEffectLabel label={item.effectLabel} />
                {renderAction?.(item)}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="nav">
        <button type="button" className="arrow" onClick={() => setIdx(idx - 1)} disabled={idx === 0} aria-label="Previous card">
          <img src={uiIconUrl("previous")} alt="" />
        </button>
        <span className="count">
          {idx + 1} of {items.length}
        </span>
        <button
          type="button"
          className="arrow"
          onClick={() => setIdx(idx + 1)}
          disabled={idx === items.length - 1}
          aria-label="Next card"
        >
          <img src={uiIconUrl("next")} alt="" />
        </button>
      </div>
      <div className="dots">
        {items.map((item, i) => (
          <span key={item.cardId} className={i === idx ? "on" : undefined} />
        ))}
      </div>
    </div>
  );
}

export default CardCarousel;
