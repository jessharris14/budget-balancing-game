import type { CardCatalog } from "../types/catalog";
import type { Commission } from "../types/session";
import "./ManagerConsole.css";

interface Props {
  commission: Commission;
  catalog: CardCatalog;
}

/**
 * Live "Decisions So Far" list, visible to every role (spec Section 8a #5):
 * every Revenue/Expenditure card ever applied, in the order applied, for the
 * lifetime of the session -- not just what's currently in effect. A
 * reconsidered decision stays in the list with a "reversed" marker instead
 * of disappearing, since decisionsLog is a permanent history distinct from
 * cardsInPlay (which only tracks current state).
 */
function DecisionsList({ commission, catalog }: Props) {
  const entries = Object.values(commission.decisionsLog ?? {}).sort((a, b) => a.appliedAt - b.appliedAt);

  return (
    <div className="decisions-list">
      <h2>Decisions So Far</h2>
      {entries.length === 0 && <p>None yet.</p>}
      {entries.length > 0 && (
        <ol>
          {entries.map((entry, idx) => {
            const card =
              entry.cardType === "revenue"
                ? catalog.revenueCards.find((c) => c.id === entry.cardId)
                : catalog.expenditureCards.find((c) => c.id === entry.cardId);
            const reversed = entry.reconsideredAt !== null;
            return (
              <li key={`${entry.cardId}-${entry.appliedAt}-${idx}`} className={reversed ? "decision-reversed" : undefined}>
                {card?.title ?? entry.cardId} ({entry.cardType}) —{" "}
                <span className={`decision-amount ${entry.appliedAmount >= 0 ? "positive" : "negative"}`}>
                  {entry.appliedAmount >= 0 ? "+" : ""}
                  {entry.appliedAmount}
                </span>
                {reversed && <span className="decision-reversed"> (reversed)</span>}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

export default DecisionsList;
