import { getCardLedgerLabel } from "./challengeLedgerEffect";
import { budgetEffectTone, type BudgetEffectTone } from "./budgetEffectTone";
import { getCardStatus, isSelectedPriorityCard, type CardStatus, type CardType } from "./ledgerService";
import type { CardCatalog, ExpenditureCard, RevenueCard } from "../types/catalog";
import type { Commission } from "../types/session";

export interface CardDisplayItem {
  cardId: string;
  cardType: CardType;
  title: string;
  impactBullets: string[];
  effectLabel: string;
  effectTone: BudgetEffectTone;
  status: CardStatus;
  statusLabel: string;
  isPriority: boolean;
}

function buildItem(
  commission: Commission,
  catalog: CardCatalog,
  cardType: CardType,
  card: RevenueCard | ExpenditureCard,
): CardDisplayItem {
  const { status, label: statusLabel } = getCardStatus(commission, card.id, cardType);
  const isPriority = isSelectedPriorityCard(catalog, commission, cardType, card.id);
  const effect = getCardLedgerLabel(cardType, card.amount, card.direction);
  return {
    cardId: card.id,
    cardType,
    title: card.title,
    impactBullets: card.impactBullets,
    effectLabel: effect.label,
    effectTone: budgetEffectTone(effect.label),
    status,
    statusLabel,
    isPriority,
  };
}

/**
 * Design step 1: the shared per-card display info CardCarousel and
 * CardList both render from -- a thin, pure packaging of the exact same
 * getCardStatus/isSelectedPriorityCard/getCardLedgerLabel calls
 * CommissionerView and ManagerConsole already made inline in their table
 * rows, not a new rule. Role-specific actions (I move to adopt/Second,
 * Reconsider) stay with each caller, passed in as a render callback --
 * this only decides what to SHOW, never what a role can DO.
 */
export function buildCardDisplayItems(commission: Commission, catalog: CardCatalog, cardType: CardType): CardDisplayItem[] {
  const cards = cardType === "revenue" ? catalog.revenueCards : catalog.expenditureCards;
  return cards.map((card) => buildItem(commission, catalog, cardType, card));
}
