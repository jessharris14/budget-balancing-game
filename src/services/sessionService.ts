import { get, off, onValue, ref, runTransaction, set } from "firebase/database";
import { auth, rtdb } from "../firebase/config";
import type { PromptBankEntry } from "../types/catalog";
import type { Commission, Participant, ParticipantRole, Session, Speaker } from "../types/session";

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

function buildInitialCommission(id: string): Commission {
  return {
    id,
    name: null,
    members: { managerAdminId: null, clerkId: null, chairId: null, commissionerIds: {} },
    ledger: { revenue: 0, expenditures: 0, reserves: 0, deficitOrSurplus: 0 },
    priority: { selectedCardId: null, funded: false },
    chairFreeCardUsed: false,
    cardsInPlay: {},
    cardsLockedOut: {},
    challengesApplied: {},
    activeMotion: null,
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

  const commissions: Record<string, Commission> = {};
  for (let i = 1; i <= params.commissionCount; i++) {
    const id = `c${i}`;
    commissions[id] = buildInitialCommission(id);
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
  const listener = onValue(sessionRef, (snapshot) => {
    callback(snapshot.exists() ? (snapshot.val() as Session) : null);
  });
  return () => off(sessionRef, "value", listener);
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

/** Manager/Administrator and Clerk are single-seat per Commission; returns false if the seat was already taken. */
export async function claimSingleSeatRole(
  code: string,
  commissionId: string,
  role: Extract<ParticipantRole, "managerAdmin" | "clerk">,
  displayName: string,
): Promise<boolean> {
  const uid = requireUid();
  const field = role === "managerAdmin" ? "managerAdminId" : "clerkId";
  const roleRef = ref(rtdb, `sessions/${code}/commissions/${commissionId}/members/${field}`);

  const result = await runTransaction(roleRef, (current: string | null) => {
    if (current !== null) return undefined;
    return uid;
  });

  if (result.committed) {
    await writeParticipant(code, { uid, name: displayName, role, commissionId });
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
  };
  await set(ref(rtdb, `sessions/${code}/publicHearingSpeakers/${uid}`), speaker);
  await writeParticipant(code, { uid, name: displayName, role: "publicHearingSpeaker", commissionId: null });
}
