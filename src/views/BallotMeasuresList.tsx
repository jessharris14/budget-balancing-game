import type { CardCatalog } from "../types/catalog";
import type { Commission } from "../types/session";
import "./ManagerConsole.css";

interface Props {
  commission: Commission;
  catalog: CardCatalog;
}

/**
 * Lightweight permanent record of every resolved Ballot Measure, visible
 * to every role (same universal-visibility pattern as Decisions So Far).
 * Exists mainly for FAILED measures -- a passed one also gets a normal
 * decisionsLog entry via the same applyCard path every other card uses,
 * but a failed one never does, so without this it would be as if the
 * vote never happened at all.
 */
function BallotMeasuresList({ commission, catalog }: Props) {
  const resolved = Object.values(commission.ballotMeasures ?? {})
    .filter((b) => b.outcome != null)
    .sort((a, b) => (a.closedAt ?? 0) - (b.closedAt ?? 0));

  if (resolved.length === 0) return null;

  return (
    <div className="decisions-list">
      <h2>Ballot Measures</h2>
      <ol>
        {resolved.map((ballot) => {
          const card =
            ballot.cardType === "revenue"
              ? catalog.revenueCards.find((c) => c.id === ballot.cardId)
              : catalog.expenditureCards.find((c) => c.id === ballot.cardId);
          const votes = Object.values(ballot.votes ?? {});
          const yes = votes.filter((v) => v === "yes").length;
          const no = votes.filter((v) => v === "no").length;
          const passed = ballot.outcome === "passed";
          return (
            <li key={ballot.id}>
              {card?.title ?? ballot.cardId} — Yes {yes}, No {no} —{" "}
              <span className={`decision-amount ${passed ? "positive" : "negative"}`}>
                {passed ? "Passed" : "Failed"}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default BallotMeasuresList;
