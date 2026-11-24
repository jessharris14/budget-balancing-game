import { getCardLedgerLabel } from "../services/challengeLedgerEffect";
import { uiIconUrl } from "../services/icons";
import BudgetEffectLabel from "./BudgetEffectLabel";
import CardIcon from "./CardIcon";
import EventPopup from "./EventPopup";
import type { CardCatalog } from "../types/catalog";
import type { ChairFreeCardApplication } from "../types/session";

interface Props {
  application: ChairFreeCardApplication;
  catalog: CardCatalog;
  onDismiss: () => void;
}

/**
 * Shown to everyone at the table (Chair, Commissioners, Speakers,
 * Administrator) the moment the Administrator applies the Chair's free
 * card -- purely presentational, same EventPopup shell and Impact-bullets
 * layout as ChallengePopup/MotionPopup. Which Commission/when is decided
 * by EventPopupHost.tsx (queue order: Challenge, then Motion, then this).
 */
function FreeCardAppliedPopup({ application, catalog, onDismiss }: Props) {
  const card =
    application.cardType === "revenue"
      ? catalog.revenueCards.find((c) => c.id === application.cardId)
      : catalog.expenditureCards.find((c) => c.id === application.cardId);
  const title = card?.title ?? application.cardId;
  const effect = card ? getCardLedgerLabel(application.cardType, card.amount, card.direction) : null;

  return (
    <EventPopup
      tone="chair"
      iconSrc={uiIconUrl("approve")}
      eyebrow="Chair's privilege"
      heading="Chair's free card applied"
      headingId="chair-free-card-popup-heading"
      vibrate
      actions={[{ label: "Got it", onClick: onDismiss, autoFocus: true }]}
    >
      <div className="cardrow">
        <CardIcon cardId={application.cardId} cardType={application.cardType} />
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <h3>{title}</h3>
          {effect && <BudgetEffectLabel label={effect.label} />}
        </div>
      </div>
      {card && card.impactBullets.length > 0 && (
        <>
          <span className="imp-h">Impact</span>
          <ul className="imp" style={{ display: "flex", flexDirection: "column", gap: "7px", fontSize: "13.5px", lineHeight: 1.4 }}>
            {card.impactBullets.map((bullet, i) => (
              <li key={i} style={{ display: "flex", gap: "8px" }}>
                {bullet}
              </li>
            ))}
          </ul>
        </>
      )}
    </EventPopup>
  );
}

export default FreeCardAppliedPopup;
