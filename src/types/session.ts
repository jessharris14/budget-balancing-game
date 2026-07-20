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

export type ParticipantRole = "facilitator" | "managerAdmin" | "clerk" | "commissioner" | "publicHearingSpeaker";

/**
 * Session-wide roster keyed by uid. Not part of the spec's Section 4 model as
 * written -- added because that model tracks role assignments only by ID
 * (managerAdminId, commissionerIds, etc.) with nowhere to hang a display
 * name for anyone except Speaker. This is the single place the Lobby view
 * looks up "who is this uid and what did they join as."
 */
export interface Participant {
  uid: string;
  name: string;
  role: ParticipantRole;
  /** Null for the Facilitator and Public Hearing Speakers, who aren't tied to one Commission. */
  commissionId: string | null;
}

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
  /**
   * Keyed by uid rather than an array: RTDB has no safe way to append to an
   * array from multiple concurrent writers, but each participant writing
   * their own `{uid: true}` entry is race-free by construction.
   */
  commissionerIds: Record<string, true>;
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
  /** Jurisdiction name (free text), set by the first participant to join this table. Null until then. */
  name: string | null;
  members: CommissionMembers;
  ledger: CommissionLedger;
  priority: CommissionPriority;
  /** One-time privilege: the Chair may apply one $1 card directly at the start of Main Game. */
  chairFreeCardUsed: boolean;
  /** Keyed by a client-generated id; empty until Phase 4. */
  cardsInPlay: Record<string, CardInPlay>;
  /** IDs of cards locked out by mutual-exclusivity rules (e.g. the R2/R3/R4 group), keyed by cardId. */
  cardsLockedOut: Record<string, true>;
  /** Keyed by challengeCardId. */
  challengesApplied: Record<string, true>;
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
  createdAt: number;
  commissions: Record<string, Commission>;
  /** Keyed by uid: each speaker writes only their own entry. */
  publicHearingSpeakers: Record<string, Speaker>;
  /** Keyed by uid: each participant writes only their own entry. See Participant above. */
  participants: Record<string, Participant>;
}
