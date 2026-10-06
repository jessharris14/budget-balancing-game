import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, firestore } from "../firebase/config";
import type { BallotMeasure, Commission, DecisionLogEntry, FinalScore, Session } from "../types/session";

export interface GameResultBallotMeasure {
  cardId: string;
  cardType: "revenue" | "expenditure";
  outcome: "passed" | "failed";
  yes: number;
  no: number;
}

export interface GameResultCommission {
  name: string | null;
  finalScore: FinalScore;
  ledger: Commission["ledger"];
  priority: Commission["priority"];
  decisionsLog: Record<string, DecisionLogEntry>;
  challengesApplied: Record<string, true>;
  publicTrustTally: number;
  ballotMeasures: Record<string, GameResultBallotMeasure>;
  /** How many Speakers assigned to this Commission cast at least one endorsement -- a count, never the individual Speakers or their votes. */
  speakerParticipationCount: number;
}

export interface GameResult {
  sessionCode: string;
  facilitatorId: string;
  date: number;
  catalogVersion: string;
  commissions: Record<string, GameResultCommission>;
}

function summarizeBallot(ballot: BallotMeasure): GameResultBallotMeasure | null {
  if (!ballot.outcome) return null;
  const votes = Object.values(ballot.votes ?? {});
  return {
    cardId: ballot.cardId,
    cardType: ballot.cardType,
    outcome: ballot.outcome,
    yes: votes.filter((v) => v === "yes").length,
    no: votes.filter((v) => v === "no").length,
  };
}

/**
 * Phase 7 B5: persists a permanent results record to Firestore, separate
 * from the ephemeral RTDB session state (which gets cleaned up later --
 * this is what survives that cleanup). No personally identifying
 * information beyond what the app already holds, and no individual
 * anonymous votes: Ballot Measures are summarized to aggregate yes/no
 * counts only (never who voted which way, same as everywhere else this
 * data is shown), and Speaker participation is a per-Commission count,
 * never a list of names or their individual actions. decisionsLog and
 * challengesApplied are kept as their raw ID-keyed RTDB shape (not
 * resolved to card titles) -- catalogVersion is stored right alongside,
 * so a reader can always resolve names later by joining with that
 * catalog, same as every other view in this app already does live.
 *
 * Write-once by design: checks for an existing doc first to avoid a
 * wasted round trip, and firestore.rules independently enforces this
 * server-side (allow create, never update/delete) as the actual
 * source of truth -- this check is just a courtesy to skip a doomed
 * write attempt, not what makes it safe.
 */
export async function persistGameResults(session: Session): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Not signed in");

  const docRef = doc(firestore, "gameResults", session.code);
  const existing = await getDoc(docRef);
  if (existing.exists()) return;

  const commissions: Record<string, GameResultCommission> = {};
  for (const [commissionId, commission] of Object.entries(session.commissions ?? {})) {
    if (!commission.finalScore) continue;

    const speakerParticipationCount = Object.values(session.publicHearingSpeakers ?? {}).filter(
      (s) => s.commissionId === commissionId && Object.keys(s.endorsementsUsed ?? {}).length > 0,
    ).length;

    const ballotMeasures: Record<string, GameResultBallotMeasure> = {};
    for (const [ballotId, ballot] of Object.entries(commission.ballotMeasures ?? {})) {
      const summary = summarizeBallot(ballot);
      if (summary) ballotMeasures[ballotId] = summary;
    }

    commissions[commissionId] = {
      name: commission.name,
      finalScore: commission.finalScore,
      ledger: commission.ledger,
      priority: commission.priority,
      decisionsLog: commission.decisionsLog ?? {},
      challengesApplied: commission.challengesApplied ?? {},
      publicTrustTally: commission.publicTrustTally,
      ballotMeasures,
      speakerParticipationCount,
    };
  }

  const result: GameResult = {
    sessionCode: session.code,
    facilitatorId: uid,
    date: Date.now(),
    catalogVersion: session.catalogVersion,
    commissions,
  };

  await setDoc(docRef, result);
}

export async function getGameResult(sessionCode: string): Promise<GameResult | null> {
  const snapshot = await getDoc(doc(firestore, "gameResults", sessionCode));
  return snapshot.exists() ? (snapshot.data() as GameResult) : null;
}
