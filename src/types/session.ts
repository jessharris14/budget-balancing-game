export type SessionPhase =
  | "lobby"
  | "overview"
  | "gameOverview"
  | "publicHearing"
  | "rollForChair"
  | "rankPriorities"
  | "mainGame"
  | "debrief";

/**
 * Ordered so "Next Phase" is just SESSION_PHASE_ORDER[currentIndex + 1].
 * Phase is session-wide, not per-Commission -- Lobby through Public Hearing
 * are explicitly facilitator-narrated to the whole room in the spec, and
 * Main Game is described as a single "master" clock, so all Commissions
 * move through every phase together on one shared control rather than at
 * their own pace.
 */
export const SESSION_PHASE_ORDER: SessionPhase[] = [
  "lobby",
  "overview",
  "gameOverview",
  "publicHearing",
  "rollForChair",
  "rankPriorities",
  "mainGame",
  "debrief",
];

export const SESSION_PHASE_LABELS: Record<SessionPhase, string> = {
  lobby: "Lobby",
  overview: "Budget Process Overview",
  gameOverview: "Game Overview",
  publicHearing: "Public Hearing",
  rollForChair: "Roll for Chair",
  rankPriorities: "Rank Priorities",
  mainGame: "Main Game",
  debrief: "Debrief",
};

/**
 * Clerk removed post-Phase-4 (spec Section 8a #1): the Chair -- an elected
 * Commissioner status, not a separate login -- highlights the active card
 * and runs the debate timer instead. No role records vote outcomes; the
 * real verbal vote plus the Manager/Administrator's own judgment is the
 * actual mechanism.
 */
export type ParticipantRole = "facilitator" | "managerAdmin" | "commissioner" | "publicHearingSpeaker";

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

export type EndorsementType = "endorse" | "oppose";

export interface EndorsementAction {
  type: EndorsementType;
  timestamp: number;
}

export interface Speaker {
  id: string;
  name: string;
  /** 1-2 prompt IDs, randomly drawn from the catalog's promptBank. */
  assignedPrompts: string[];
  rerollCount: number;
  /**
   * Keyed "0"/"1"/"2" (not push-ids): each cast is part of one atomic
   * read-modify-write transaction against this whole map, so sequential
   * integer keys are simplest and can't collide. Max 3, lifetime, permanent
   * -- no undo, no reconsideration.
   */
  endorsementsUsed: Record<string, EndorsementAction>;
}

export interface CommissionMembers {
  managerAdminId: string | null;
  /** Elected via Roll for Chair, not claimed at join -- always a member of commissionerIds too. */
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
  /** When this card was played -- lets the "Decisions So Far" list show them in order. */
  playedAt: number;
  /** Which decisionsLog entry corresponds to this play, so reconsiderCard can mark the right one reconsidered. */
  logEntryId: string;
}

/**
 * Permanent, ordered history of every applied Revenue/Expenditure card --
 * distinct from cardsInPlay (current state only). A reconsidered entry
 * gets reconsideredAt set rather than being removed, so "Decisions So Far"
 * can show a reversal marker instead of silently erasing history. The same
 * card can appear more than once across a session (played, reconsidered,
 * played again), which is why this is keyed by a generated entry id, not
 * by cardId.
 */
export interface DecisionLogEntry {
  cardId: string;
  cardType: "revenue" | "expenditure";
  appliedAmount: number;
  appliedAt: number;
  reconsideredAt: number | null;
}

export interface FinalScore {
  balanced: boolean;
  priorityFunded: boolean;
  reserveTier: number;
  publicTrustTier: number;
  total: number;
}

/** Currently broadcast Challenge card for this Commission -- what makes the trigger a live push, not just a log entry. */
export interface ActiveChallenge {
  cardId: string;
  printedText: string;
  triggeredAt: number;
}

export interface Commission {
  id: string;
  /** Jurisdiction name (free text), set by the first participant to join this table. Null until then. */
  name: string | null;
  members: CommissionMembers;
  /** uid -> die roll (1-6) from the most recent Roll for Chair. Null until rolled. */
  chairRoll: Record<string, number> | null;
  ledger: CommissionLedger;
  priority: CommissionPriority;
  /** One-time privilege: the Chair may apply one $1 card directly at the start of Main Game. */
  chairFreeCardUsed: boolean;
  /** The card currently under debate, per the Chair -- visible to every other role in this Commission except the Facilitator. */
  chairHighlightedCardId: string | null;
  /** When the Chair's current debate timer ends; null if not running. */
  debateTimerEndsAt: number | null;
  /** Keyed by cardId; current state only (use decisionsLog for history). */
  cardsInPlay: Record<string, CardInPlay>;
  /** IDs of cards locked out by mutual-exclusivity rules (e.g. the R2/R3/R4 group), keyed by cardId. */
  cardsLockedOut: Record<string, true>;
  /** Keyed by a generated entry id (not cardId -- the same card can be played more than once across a session). */
  decisionsLog: Record<string, DecisionLogEntry>;
  /** Keyed by challengeCardId -- audit trail of every challenge ever triggered for this Commission. */
  challengesApplied: Record<string, true>;
  activeChallenge: ActiveChallenge | null;
  /**
   * The triggeredAt of the activeChallenge whose dollar impact was most
   * recently applied to the ledger. Compared against
   * activeChallenge.triggeredAt to tell "already applied" from "needs
   * applying" -- kept as its own field so the Facilitator (who now applies
   * Challenges automatically) and the Manager/Administrator never need
   * write access to the same node for different reasons.
   */
  challengeLedgerAppliedAt: number | null;
  /**
   * Running sum of every Speaker's endorse(+1)/oppose(-1) action. Speakers
   * are session-wide, not per-Commission (see Session.publicHearingSpeakers
   * below), so in a multi-Commission session every Commission's tally
   * receives the same increment from a given endorsement -- there's no
   * data to say which single table a Speaker is "assigned to." See
   * castEndorsement in speakerService.ts.
   */
  publicTrustTally: number;
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
