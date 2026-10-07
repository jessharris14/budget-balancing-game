import { cardStatusRowClass } from "./cardStatusDisplay";
import CardStatusLegend from "./CardStatusLegend";
import { getCardStatus, isSelectedPriorityCard } from "../services/ledgerService";
import type { CardCatalog } from "../types/catalog";
import type { Commission } from "../types/session";
import "./ManagerConsole.css";

interface Props {
  commission: Commission;
  catalog: CardCatalog;
}

/**
 * Change 3: compact, read-only decision context for the Speaker view,
 * which doesn't otherwise show the Revenue/Expenditure catalog tables and
 * so would lose all visibility into what's been decided once Decisions
 * So Far is removed. Rather than reproducing the full catalog tables
 * (not actually "compact"), this lists only cards with something to
 * report -- Applied, Did not pass/Failed ballot, or the Priority card --
 * using the exact same getCardStatus/isSelectedPriorityCard logic and
 * color/label vocabulary as the full tables, just condensed to one line
 * per card. Locked-out cards are left out here: that's a game-mechanic
 * detail for whoever is choosing cards, not a decision a Speaker needs
 * to track.
 */
function CompactCardStatusList({ commission, catalog }: Props) {
  const allCards = [
    ...catalog.revenueCards.map((c) => ({ ...c, cardType: "revenue" as const })),
    ...catalog.expenditureCards.map((c) => ({ ...c, cardType: "expenditure" as const })),
  ];

  const rows = allCards
    .map((card) => {
      const { status, label } = getCardStatus(commission, card.id, card.cardType);
      const isPriority = isSelectedPriorityCard(catalog, commission, card.cardType, card.id);
      return { card, status, label, isPriority };
    })
    .filter((r) => r.isPriority || r.status === "applied" || r.status === "didNotPass");

  if (rows.length === 0) return null;

  return (
    <div className="lobby-commission">
      <h3>Card Status</h3>
      <CardStatusLegend />
      <ul className="compact-card-status-list">
        {rows.map(({ card, status, label, isPriority }) => (
          <li key={card.id} className={cardStatusRowClass(status, isPriority, false)}>
            {card.title}
            {isPriority && <span className="priority-badge">Priority</span>}
            <span className={`card-status-badge status-${status}`}>{label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default CompactCardStatusList;
