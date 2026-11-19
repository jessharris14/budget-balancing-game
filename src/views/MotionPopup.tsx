import { getCardLedgerLabel } from "../services/challengeLedgerEffect";
import type { MotionPopupView } from "../services/motionPopupLogic";
import EventPopup from "./EventPopup";
import type { CardCatalog } from "../types/catalog";
import type { ActiveMotion, Participant } from "../types/session";

interface Props {
  motion: ActiveMotion;
  catalog: CardCatalog;
  participants: Record<string, Participant>;
  /** Never "none" -- EventPopupHost only mounts this once getMotionPopupView says there's something to show. */
  view: Exclude<MotionPopupView, "none">;
  onSecond: () => void;
  onDismiss: () => void;
  seconding: boolean;
  /** "Already seconded by X" (or a generic failure) from a just-lost race -- shown in place of an error, never left to surface as a crash. */
  secondError: string | null;
}

/**
 * The motion pop-up (spec 3a), shown to everyone else at the table while a
 * motion waits for a second. Purely presentational, same EventPopup shell
 * as the Challenge pop-up but with a visibly different tone -- see
 * EventPopupHost.tsx for who sees it, when, and how it queues against a
 * Challenge pop-up.
 */
function MotionPopup({ motion, catalog, participants, view, onSecond, onDismiss, seconding, secondError }: Props) {
  const card =
    motion.cardType === "revenue"
      ? catalog.revenueCards.find((c) => c.id === motion.cardId)
      : catalog.expenditureCards.find((c) => c.id === motion.cardId);
  const title = card?.title ?? motion.cardId;
  const effect = card ? getCardLedgerLabel(motion.cardType, card.amount, card.direction) : null;
  const moverName = participants[motion.movedBy]?.name ?? motion.movedBy;

  const actions =
    view === "second"
      ? [{ label: seconding ? "Seconding…" : "Second this motion", onClick: onSecond, disabled: seconding, autoFocus: true }]
      : [{ label: "Got it", onClick: onDismiss, autoFocus: true }];

  return (
    <EventPopup
      tone="motion"
      icon="📋"
      heading="Motion on the floor"
      headingId="motion-popup-heading"
      onRequestClose={onDismiss}
      vibrate
      actions={actions}
    >
      <p className="event-popup-title">{title}</p>
      {card && <p className="event-popup-text">{card.impactBullets.join("; ")}</p>}
      <p className="event-popup-mover">Moved by {moverName}</p>
      {effect && (
        <p className="event-popup-effect">
          <strong>{effect.label}</strong>
          <br />
          {effect.subtext}
        </p>
      )}
      {secondError ? (
        <p className="event-popup-already-seconded">{secondError}</p>
      ) : (
        <p className="event-popup-note">
          {view === "second" ? "Second it to bring it up for debate." : "Awaiting a second from a Commissioner."}
        </p>
      )}
    </EventPopup>
  );
}

export default MotionPopup;
