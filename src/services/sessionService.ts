import { get, onValue, ref, runTransaction, set } from "firebase/database";
import { auth, rtdb } from "../firebase/config";
import { getCatalog } from "./catalogService";
import type { BudgetPicture, PromptBankEntry, ReservePolicy } from "../types/catalog";
import type { Commission, Participant, Session, Speaker } from "../types/session";

const CODE_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const MAX_CREATE_ATTEMPTS = 20;

function randomCode(): string {
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)];
  }
  return code;
}

function requireUid(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Not signed in");
  return uid;
}

/**
 * Ledger starts from the seeded Budget Picture's projections (before any
 * Commission decisions) and the Reserve Policy maximum -- the spec gives no
 * explicit "starting reserves" figure, so starting at policy max (rather
 * than minimum) is a judgment call: it gives a Commission room to absorb a
 * reserves-targeting Challenge (only C1 hits reserves in the seeded
 * catalog) before dropping below the policy minimum, rather than starting
 * already at the edge of the worst-but-one scoring tier.
 */
function buildInitialCommission(id: string, budgetPicture: BudgetPicture, reservePolicy: ReservePolicy): Commission {
  const revenue = budgetPicture.projectedRevenue;
  const expenditures = budgetPicture.projectedExpenditure;
  return {
    id,
    name: null,
    members: { managerAdminId: null, chairId: null, commissionerIds: {} },
    chairRoll: null,
    ledger: { revenue, expenditures, reserves: reservePolicy.max, deficitOrSurplus: revenue - expenditures },
    priority: { selectedCardId: null, funded: false },
    chairFreeCardUsed: false,
    chairHighlightedCardId: null,
    debateTimerEndsAt: null,
    cardsInPlay: {},
    cardsLockedOut: {},
    decisionsLog: {},
    challengesApplied: {},
    activeChallenge: null,
    challengeLedgerAppliedAt: null,
    publicTrustTally: 0,
    finalScore: null,
  };
}

export interface CreateSessionParams {
  debateTimerMinutes: number;
  commissionCount: number;
  catalogVersion: string;
  facilitatorName: string;
}

/**
 * Generates a random 4-letter code and atomically claims it in RTDB via a
 * transaction that only succeeds if the path is still empty, retrying with a
 * fresh code on collision. There's no server-side authority here (see the
 * Phase 2 decision to defer Cloud Functions/Blaze), but the transaction
 * still makes the collision check itself race-free between two clients
 * generating the same code at the same moment.
 */
export async function createSession(params: CreateSessionParams): Promise<string> {
  const uid = requireUid();

  const catalog = await getCatalog(params.catalogVersion);
  if (!catalog) throw new Error(`Catalog "${params.catalogVersion}" not found.`);

  const commissions: Record<string, Commission> = {};
  for (let i = 1; i <= params.commissionCount; i++) {
    const id = `c${i}`;
    commissions[id] = buildInitialCommission(id, catalog.budgetPicture, catalog.reservePolicy);
  }

  for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt++) {
    const code = randomCode();
    const sessionRef = ref(rtdb, `sessions/${code}`);
    const session: Session = {
      code,
      facilitatorId: uid,
      phase: "lobby",
      settings: { debateTimerMinutes: params.debateTimerMinutes },
      clock: { phaseTimer: null, mainGameTimer: null, nextChallengeDue: null },
      catalogVersion: params.catalogVersion,
      createdAt: Date.now(),
      commissions,
      publicHearingSpeakers: {},
      participants: {
        [uid]: { uid, name: params.facilitatorName, role: "facilitator", commissionId: null },
      },
    };

    const result = await runTransaction(sessionRef, (current: Session | null) => {
      if (current !== null) return undefined;
      return session;
    });

    if (result.committed) return code;
  }

  throw new Error("Could not generate a unique session code. Please try again.");
}

export async function getSession(code: string): Promise<Session | null> {
  const snapshot = await get(ref(rtdb, `sessions/${code}`));
  return snapshot.exists() ? (snapshot.val() as Session) : null;
}

export function subscribeToSession(code: string, callback: (session: Session | null) => void): () => void {
  const sessionRef = ref(rtdb, `sessions/${code}`);
  return onValue(sessionRef, (snapshot) => {
    callback(snapshot.exists() ? (snapshot.val() as Session) : null);
  });
}

async function writeParticipant(code: string, participant: Participant): Promise<void> {
  await set(ref(rtdb, `sessions/${code}/participants/${participant.uid}`), participant);
}

/** First joiner to a still-unnamed Commission sets its jurisdiction name; later joiners just see the name that stuck. */
export async function setCommissionJurisdictionName(code: string, commissionId: string, name: string): Promise<boolean> {
  const nameRef = ref(rtdb, `sessions/${code}/commissions/${commissionId}/name`);
  const result = await runTransaction(nameRef, (current: string | null) => {
    if (current !== null) return undefined;
    return name;
  });
  return result.committed;
}

/** Manager/Administrator is single-seat per Commission (Chair is elected via Roll for Chair, not claimed here); returns false if the seat was already taken. */
export async function claimManagerAdminSeat(code: string, commissionId: string, displayName: string): Promise<boolean> {
  const uid = requireUid();
  const roleRef = ref(rtdb, `sessions/${code}/commissions/${commissionId}/members/managerAdminId`);

  const result = await runTransaction(roleRef, (current: string | null) => {
    if (current !== null) return undefined;
    return uid;
  });

  if (result.committed) {
    await writeParticipant(code, { uid, name: displayName, role: "managerAdmin", commissionId });
  }
  return result.committed;
}

/** Commissioner is multi-seat: each uid writes its own key, so there's no race to guard against. */
export async function joinAsCommissioner(code: string, commissionId: string, displayName: string): Promise<void> {
  const uid = requireUid();
  await set(ref(rtdb, `sessions/${code}/commissions/${commissionId}/members/commissionerIds/${uid}`), true);
  await writeParticipant(code, { uid, name: displayName, role: "commissioner", commissionId });
}

function drawPromptIds(promptBank: PromptBankEntry[]): string[] {
  const count = Math.random() < 0.5 ? 1 : 2;
  const shuffled = [...promptBank].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map((entry) => entry.id);
}

/** Public Hearing Speaker is session-wide (not tied to a Commission) and multi-seat, per spec Section 3/8. */
export async function joinAsPublicHearingSpeaker(
  code: string,
  displayName: string,
  promptBank: PromptBankEntry[],
): Promise<void> {
  const uid = requireUid();
  const speaker: Speaker = {
    id: uid,
    name: displayName,
    assignedPrompts: drawPromptIds(promptBank),
    rerollCount: 0,
    endorsementsUsed: {},
  };
  await set(ref(rtdb, `sessions/${code}/publicHearingSpeakers/${uid}`), speaker);
  await writeParticipant(code, { uid, name: displayName, role: "publicHearingSpeaker", commissionId: null });
}
