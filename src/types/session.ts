export type SessionPhase =
  | "lobby"
  | "overview"
  | "gameOverview"
  | "publicHearing"
  | "rollForChair"
  | "rankPriorities"
  | "mainGame"
  | "debrief";

export type VoteResult = "pass" | "fail";

export interface Speaker {
  id: string;
  name: string;
  /** 1-2 prompt IDs, randomly drawn from the catalog's promptBank. */
  assignedPrompts: string[];
  rerollCount: number;
}

export interface CommissionMembers {
  managerAdminId: string | null;
  clerkId: string | null;
  chairId: string | null;
  commissionerIds: string[];
}

export interface CommissionLedger {
  revenue: number;
  expenditures: number;
  reserves: number;
  deficitOrSurplus: number;
}

export interface CommissionPriority {
  selectedCardId: string | null;
  funded: boolean;
}

export interface CardInPlay {
  cardId: string;
  cardType: "revenue" | "expenditure";
  appliedAmount: number;
}

export interface ActiveMotion {
  cardId: string;
  proposedBy: string;
  seconded: boolean;
  debateEndsAt: number | null;
  voteResult: VoteResult | null;
}

export interface FinalScore {
  balanced: boolean;
  priorityFunded: boolean;
  reserveTier: number;
  total: number;
}

export interface Commission {
  id: string;
  name: string;
  members: CommissionMembers;
  ledger: CommissionLedger;
  priority: CommissionPriority;
  /** One-time privilege: the Chair may apply one $1 card directly at the start of Main Game. */
  chairFreeCardUsed: boolean;
  cardsInPlay: CardInPlay[];
  /** IDs of cards locked out by mutual-exclusivity rules (e.g. the R2/R3/R4 group). */
  cardsLockedOut: string[];
  challengesApplied: string[];
  activeMotion: ActiveMotion | null;
  finalScore: FinalScore | null;
}

export interface SessionClock {
  phaseTimer: number | null;
  mainGameTimer: number | null;
  nextChallengeDue: number | null;
}

export interface SessionSettings {
  debateTimerMinutes: number;
}

export interface Session {
  code: string;
  facilitatorId: string;
  phase: SessionPhase;
  settings: SessionSettings;
  clock: SessionClock;
  /** Which catalog version this session was created against (see CardCatalog.catalogVersion). */
  catalogVersion: string;
  commissions: Commission[];
  publicHearingSpeakers: Speaker[];
}
