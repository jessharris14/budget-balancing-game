import type { CardCatalog } from "../types/catalog";
import type { Commission } from "../types/session";
import "./lb-components.css";

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
 * vote never happened at all. Design step 1: restyled only.
 */
function BallotMeasuresList({ commission, catalog }: Props) {
  const resolved = Object.values(commission.ballotMeasures ?? {})
    .filter((b) => b.outcome != null)
    .sort((a, b) => (a.closedAt ?? 0) - (b.closedAt ?? 0));

  if (resolved.length === 0) return null;

  return (
    <div className="panel">
      <h3>Ballot Measures</h3>
      <div className="rows">
        {resolved.map((ballot) => {
          const card =
            ballot.cardType === "revenue"
              ? catalog.revenueCards.find((c) => c.id === ballot.cardId)
              : catalog.expenditureCards.find((c) => c.id === ballot.cardId);
          const yes = ballot.yesCount ?? 0;
          const no = ballot.noCount ?? 0;
          const passed = ballot.outcome === "passed";
          return (
            <div className="rowi" key={ballot.id} style={{ gridTemplateColumns: "minmax(0, 1fr) auto" }}>
              <div className="tt">
                <b>{card?.title ?? ballot.cardId}</b>
                <span style={{ fontSize: "12px", color: "var(--lb-muted)" }}>
                  Yes {yes}, No {no}
                </span>
              </div>
              <span className={passed ? "st" : "st fail"} style={passed ? { background: "var(--lb-rev-tint)", borderColor: "rgba(0,150,108,.4)", color: "var(--lb-forest)" } : undefined}>
                {passed ? "✓ Passed" : "✕ Failed"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default BallotMeasuresList;
