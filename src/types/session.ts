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
  /** Null only for the Facilitator, who isn't tied to one Commission. Public Hearing Speakers now pick a Commission at join, same as Commissioners. */
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
  /**
   * The Commission/table this Speaker is assigned to watch -- chosen at
   * join, same as a Commissioner's table. Corrects an original data-model
   * gap (Speaker was left session-wide from Phase 1, before multi-
   * Commission specifics were worked out): endorsements now only affect
   * this one Commission's publicTrustTally, not every Commission's.
   */
  commissionId: string;
  /** 1-2 prompt IDs, randomly drawn from the catalog's promptBank. */
  assignedPrompts: string[];
  rerollCount: number;
  /**
   * Keyed "0"/"1"/"2" (not push-ids): each cast claims its own slot via a
   * transaction scoped to that single key (write-only-if-absent), so
   * concurrent casts can't collide. Max 3, lifetime, permanent -- no undo,
   * no reconsideration.
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

/**
 * Change 3: a permanent record of every card whose motion reached Motion
 * Fails -- NOT one reset by the Chair for lack of a second, which never
 * reached a vote and leaves no record at all, by design. A failed Ballot
 * Measure needs no equivalent entry here: it's already fully recorded in
 * Commission.ballotMeasures (outcome: "failed", closedAt as its
 * timestamp), so getCardStatus (ledgerService.ts) reads that directly
 * instead of duplicating it here. Keyed by a generated entry id, same
 * reasoning as decisionsLog: the same card can fail more than once
 * across a session.
 */
export interface FailedMotionEntry {
  cardId: string;
  cardType: "revenue" | "expenditure";
  failedAt: number;
}

/** One scoring dimension's point value plus the plain-language reason for it (Section 6), e.g. {points: -1, reason: "Reserves $12 -> -1"}. */
export interface ScoreDimension {
  points: number;
  reason: string;
}

/**
 * Authoritative end-of-game score (Phase 7 / spec Section 6), computed
 * once by computeFinalScore (scoringService.ts) and written here so every
 * role sees the same frozen result rather than each client recomputing
 * live numbers that could drift once the ledger stops changing.
 */
export interface FinalScore {
  balanced: ScoreDimension;
  priorityFunded: ScoreDimension;
  reserves: ScoreDimension;
  publicTrust: ScoreDimension;
  total: number;
  computedAt: number;
}

/** Currently broadcast Challenge card for this Commission -- what makes the trigger a live push, not just a log entry. */
export interface ActiveChallenge {
  cardId: string;
  printedText: string;
  triggeredAt: number;
}

/**
 * A lightweight motion/second signal (Phase 6 #1) -- purely informational,
 * so the room can see "who's moving what" at a glance. Not a gate: it
 * never blocks or enables the Chair's highlight action or the Manager/
 * Administrator's apply action, matching the app's existing trust model
 * (the room's real verbal process is what matters; the app just helps
 * surface it). Any Commissioner (including the Chair, who is one) can
 * move or second; a new motion simply replaces whatever was pending.
 */
export interface ActiveMotion {
  cardId: string;
  cardType: "revenue" | "expenditure";
  movedBy: string;
  movedAt: number;
  secondedBy: string | null;
  secondedAt: number | null;
}

export type BallotVote = "yes" | "no";

/**
 * Ballot Measure flow for millage-rate cards (identified by the catalog's
 * existing "millage-rate" exclusivityGroup -- the one existing, reusable,
 * non-hardcoded signal for this; there's no separate "millage" catalog
 * field): a Board vote (Motion Passes) on one of these doesn't apply the
 * card directly, it instead opens this record for the room to actually
 * vote on. openedAt stays null while the Administrator's "Run the
 * Election" modal is up but voting hasn't started yet (so a Speaker can't
 * vote on a ballot that's merely been created); closedAt locks voting;
 * outcome stays null until the tally is computed and (if passed) applied.
 * Kept permanently in Commission.ballotMeasures once resolved, as the
 * only record of a FAILED measure -- unlike a passed one, it never gets a
 * decisionsLog entry, since nothing was actually applied.
 */
export interface BallotMeasure {
  id: string;
  cardId: string;
  cardType: "revenue" | "expenditure";
  openedAt: number | null;
  closedAt: number | null;
  outcome: "passed" | "failed" | null;
  /**
   * Phase 8.1 fix: individual votes no longer live here. They used to
   * (keyed by voter uid), but this whole Commission tree is read via one
   * blanket `sessions/{code}` listener (subscribeToSession) that every
   * signed-in participant uses -- RTDB's read-rule cascading means a
   * deeper per-field `.read: false` is never even consulted once an
   * ancestor's `.read` has already granted the request, so there was no
   * way to keep a per-voter value genuinely hidden while it lived inside
   * this tree. The raw vote is now written to a separate top-level
   * `ballotVotes/{code}/{commissionId}/{ballotId}/{speakerUid}` node
   * (see ballotService.ts castBallotVote) that only the voter themself
   * can ever read, and is never touched by the session listener at all.
   * yesCount/noCount below are the only trace of the outcome anyone else
   * -- including the Administrator and Facilitator -- can see.
   */
  yesCount: number;
  noCount: number;
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
  /** Keyed by a generated entry id -- see FailedMotionEntry (Change 3). */
  failedMotionsLog: Record<string, FailedMotionEntry>;
  /**
   * Keyed by challengeCardId -- audit trail of every challenge ever
   * triggered for this Commission. Value is the server timestamp it was
   * triggered at (not just `true`, as it was before Change 2), which is
   * what lets the Applied Challenges table show them in the order
   * triggered and compute a running total -- the smallest change that
   * makes "in order" and "running total" correct, rather than a parallel
   * log. If the same challenge card is ever triggered twice, this still
   * only keeps the one most recent timestamp (same single-entry-per-card
   * shape as before); nothing in this app currently re-triggers a card.
   */
  challengesApplied: Record<string, number>;
  activeChallenge: ActiveChallenge | null;
  /** Pending motion/second signal, if any -- see ActiveMotion. */
  activeMotion: ActiveMotion | null;
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
   * Running sum of endorse(+1)/oppose(-1) actions from Speakers assigned to
   * this Commission (Speaker.commissionId) -- not session-wide; each
   * Speaker watches one table, same as a Commissioner. See castEndorsement
   * in speakerService.ts.
   */
  publicTrustTally: number;
  finalScore: FinalScore | null;
  /** Which ballotMeasures entry (if any) is currently open/in-progress for this Commission -- null once resolved (passed or failed) or cancelled before voting opened. */
  activeBallotId: string | null;
  /** Permanent history of every Ballot Measure ever opened for this Commission, keyed by a generated id -- including failed ones, which never get a decisionsLog entry. */
  ballotMeasures: Record<string, BallotMeasure>;
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
  /**
   * Phase 8.2: keyed by uid -> the timestamp this uid's device last
   * (re)connected, present only while that uid currently has a live RTDB
   * connection (see presenceService.ts). Purely a connectivity signal --
   * never read by any write-gating rule or role-claim logic, so losing
   * it can never release a seat, drop a Speaker's endorsements, or
   * invalidate a Ballot vote. Absent entirely until the first client
   * connects (RTDB prunes the whole session-wide `presence` node back to
   * nothing once every uid disconnects).
   */
  presence?: Record<string, number>;
}
