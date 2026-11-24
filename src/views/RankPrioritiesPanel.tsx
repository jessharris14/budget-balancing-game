import { formatClock } from "../hooks/useCountdown";
import RankPrioritiesGrid from "./RankPrioritiesGrid";
import type { PriorityCard } from "../types/catalog";

interface Props {
  priorityCards: PriorityCard[];
  selectedCardId: string | null | undefined;
  phaseTimerMs: number | null;
  onSelect?: (cardId: string) => void;
  disabled?: boolean;
}

/**
 * The single "Rank Priorities" panel (heading, countdown, card grid,
 * "Selected: ..." line) shared by every role -- Chair passes onSelect,
 * every other role omits it and gets the same cards read-only.
 */
function RankPrioritiesPanel({ priorityCards, selectedCardId, phaseTimerMs, onSelect, disabled }: Props) {
  const selectedTitle = selectedCardId
    ? (priorityCards.find((c) => c.id === selectedCardId)?.title ?? selectedCardId)
    : "not yet recorded by the Chair";

  return (
    <div className="panel" style={{ textAlign: "left" }}>
      <h3>Rank Priorities</h3>
      {phaseTimerMs !== null && <p>Time remaining: {formatClock(phaseTimerMs)}</p>}
      <RankPrioritiesGrid priorityCards={priorityCards} selectedCardId={selectedCardId} onSelect={onSelect} disabled={disabled} />
      <p style={{ fontWeight: 700 }}>Selected: {selectedTitle}</p>
    </div>
  );
}

export default RankPrioritiesPanel;
