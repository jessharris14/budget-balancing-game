import { getCardLedgerLabel, type CardLedgerLabel } from "../services/challengeLedgerEffect";
import { getCardStatus, isSelectedPriorityCard } from "../services/ledgerService";
import BudgetEffectLabel from "./BudgetEffectLabel";
import CardIcon from "./CardIcon";
import CardStatusLegend from "./CardStatusLegend";
import StatusChip, { PriorityChip } from "./StatusChip";
import type { CardCatalog } from "../types/catalog";
import type { Commission } from "../types/session";
import "./lb-components.css";

interface Props {
  commission: Commission;
  catalog: CardCatalog;
}

/**
 * Change 3: compact, read-only decision context for the Speaker view,
 * which doesn't otherwise show the Revenue/Expenditure catalog and so
 * would lose all visibility into what's been decided once Decisions So
 * Far is removed. Rather than reproducing the full catalog (not actually
 * "compact," and more than a Speaker currently sees at all), this lists
 * only cards with something to report -- Applied, Did not pass/Failed
 * ballot, or the Priority card -- using the exact same getCardStatus/
 * isSelectedPriorityCard logic as the full views, just condensed to one
 * row per card. Locked-out and plain Available cards are left out here,
 * same as before this round -- design step 1 only restyled this with the
 * new StatusChip/BudgetEffectChip/icon look, the scope is unchanged.
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
      const effect: CardLedgerLabel = getCardLedgerLabel(card.cardType, card.amount, card.direction);
      return { card, status, label, isPriority, effect };
    })
    .filter((r) => r.isPriority || r.status === "applied" || r.status === "didNotPass");

  if (rows.length === 0) return null;

  return (
    <div className="panel">
      <h3>Card Status</h3>
      <CardStatusLegend />
      <div className="rows">
        {rows.map(({ card, status, label, isPriority, effect }) => (
          <div className="rowi" key={card.id}>
            <CardIcon cardId={card.id} cardType={card.cardType} />
            <div className="tt">
              <b>{card.title}</b>
              <BudgetEffectLabel label={effect.label} />
            </div>
            <div className="chips">
              <StatusChip status={status} label={label} />
              {isPriority && <PriorityChip />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default CompactCardStatusList;
