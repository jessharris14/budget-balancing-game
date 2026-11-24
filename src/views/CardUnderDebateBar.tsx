import { useCountdown, formatClock } from "../hooks/useCountdown";
import "./RoleHeaderBar.css";

const URGENT_THRESHOLD_MS = 10 * 1000;

interface Props {
  cardTitle: string;
  budgetEffectLabel: string;
  /** RTDB prunes this to "key absent" (reading back as undefined) once a card is under debate but the Chair hasn't started the timer yet -- see useCountdown's own comment. */
  debateTimerEndsAt: number | null | undefined;
}

/**
 * Bar 2 (spec Part 1): a second frozen bar directly under bar 1, shown
 * ONLY while a Card Under Debate exists at this table. The caller decides
 * whether to render this at all (its own chairHighlightedCardId/
 * resolvingCardId condition -- "exactly the same condition that clears
 * the Card Under Debate panel today," which differs slightly between
 * ManagerConsole's resolution-pinned debateCardId and the plain live field
 * CommissionerView/SpeakerView read), so this component only has to
 * render the timer and the card info once told there's something to show.
 *
 * This is now the ONLY place the debate timer is displayed -- the
 * Card Under Debate panel in each view lost its own duplicate readout
 * when this was added, keeping only the card's details and (for the
 * Chair) the Start/Restart/Stop controls.
 */
function CardUnderDebateBar({ cardTitle, budgetEffectLabel, debateTimerEndsAt }: Props) {
  const debateMs = useCountdown(debateTimerEndsAt);
  const urgent = debateMs !== null && debateMs > 0 && debateMs <= URGENT_THRESHOLD_MS;
  const timeUp = debateMs === 0 && debateTimerEndsAt != null;
  // A card can be under debate (seconded, highlighted) before the Chair
  // has ever started the timer -- debateTimerEndsAt is then genuinely
  // unset (reads back as undefined, see the prop comment), not a timer
  // mid-countdown, so this is its own neutral state rather than just
  // hiding the pill outright.
  const waitingForChair = debateMs === null;

  return (
    <div className="debate-bar">
      <span className="debate-bar__label">Card Under Debate:</span>
      <span className="debate-bar__title">{cardTitle}</span>
      <span className="debate-bar__effect">{budgetEffectLabel}</span>
      {waitingForChair ? (
        <span className="debate-bar__timer debate-bar__timer--waiting">Waiting for Chair</span>
      ) : (
        <span className={`debate-bar__timer${urgent ? " debate-bar__timer--urgent" : ""}`}>
          {timeUp ? "⏰ Time is up" : `⏱ ${formatClock(debateMs)}`}
        </span>
      )}
    </div>
  );
}

export default CardUnderDebateBar;
