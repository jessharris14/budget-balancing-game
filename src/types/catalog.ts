/** Whether a card's dollar amount widens or narrows the deficit (or, for Challenge cards, reserves). */
export type EffectDirection = "increase" | "decrease";

export interface RevenueCard {
  id: string;
  title: string;
  impactBullets: string[];
  amount: number;
  direction: EffectDirection;
  /** Present only for cards that are mutually exclusive with others (e.g. the R2/R3/R4 millage-rate group). */
  exclusivityGroup?: string;
  notes?: string;
}

export interface ExpenditureCard {
  id: string;
  title: string;
  impactBullets: string[];
  amount: number;
  direction: EffectDirection;
}

export interface ChallengeCard {
  id: string;
  title: string;
  /** Text pushed to participant screens when the Facilitator triggers this card. */
  printedText: string;
  /** Facilitator-only context explaining the scenario behind the card; never shown to players. */
  facilitatorNarrative: string;
  amount: number;
  target: "deficit" | "reserves";
  direction: EffectDirection;
}

export interface PriorityCard {
  id: string;
  title: string;
  description: string;
  amount: number;
}

export interface BudgetPicture {
  currentBudget: number;
  projectedRevenue: number;
  projectedExpenditure: number;
  shortfall: number;
  narrative: string;
}

export interface ReservePolicy {
  max: number;
  minimum: number;
}

export type PromptBankTheme =
  | "fiscal-conservative"
  | "public-safety"
  | "social-services"
  | "business-econ-dev"
  | "environmental"
  | "general-devils-advocate";

export interface PromptBankEntry {
  id: string;
  theme: PromptBankTheme;
  text: string;
}

export interface CardCatalog {
  /** Versioned catalog identifier, e.g. "leonCounty_v1" — matches the Firestore document path under `catalogs/`. */
  catalogVersion: string;
  revenueCards: RevenueCard[];
  expenditureCards: ExpenditureCard[];
  challengeCards: ChallengeCard[];
  priorityCards: PriorityCard[];
  budgetPicture: BudgetPicture;
  reservePolicy: ReservePolicy;
  promptBank: PromptBankEntry[];
}
