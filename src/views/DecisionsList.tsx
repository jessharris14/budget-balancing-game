import type { CardCatalog } from "../types/catalog";
import type { Commission } from "../types/session";
import "./ManagerConsole.css";

interface Props {
  commission: Commission;
  catalog: CardCatalog;
}

/**
 * Live "Decisions So Far" list, in the spirit of the physical game board's
 * Decisions row -- every currently-played Revenue/Expenditure card, in the
 * order they were applied. A reconsidered card disappears from here (it's
 * removed from cardsInPlay entirely), same as it disappears from the
 * ledger's total -- this shows what currently stands, not a full history
 * of every action ever taken.
 */
function DecisionsList({ commission, catalog }: Props) {
  const entries = Object.values(commission.cardsInPlay ?? {}).sort((a, b) => a.playedAt - b.playedAt);

  return (
    <div className="decisions-list">
      <h2>Decisions So Far</h2>
      {entries.length === 0 && <p>None yet.</p>}
      {entries.length > 0 && (
        <ol>
          {entries.map((entry) => {
            const card =
              entry.cardType === "revenue"
                ? catalog.revenueCards.find((c) => c.id === entry.cardId)
                : catalog.expenditureCards.find((c) => c.id === entry.cardId);
            return (
              <li key={entry.cardId}>
                {card?.title ?? entry.cardId} ({entry.cardType}) —{" "}
                <span className={`decision-amount ${entry.appliedAmount >= 0 ? "positive" : "negative"}`}>
                  {entry.appliedAmount >= 0 ? "+" : ""}
                  {entry.appliedAmount}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

export default DecisionsList;
