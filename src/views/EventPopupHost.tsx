import { useEffect, useRef, useState } from "react";
import { getCatalog } from "../services/catalogService";
import { selectChallengesToQueue, type ChallengeQueueItem } from "../services/challengePopupLogic";
import { shouldQueueFreeCardPopup } from "../services/freeCardPopupLogic";
import { getMotionPopupView, motionId, selectPopupToShow } from "../services/motionPopupLogic";
import { signalSecond } from "../services/motionService";
import type { CardCatalog } from "../types/catalog";
import type { Commission, Participant, SessionPhase } from "../types/session";
import ChallengePopup from "./ChallengePopup";
import FreeCardAppliedPopup from "./FreeCardAppliedPopup";
import MotionPopup from "./MotionPopup";
import "./EventPopup.css";

interface Props {
  code: string;
  commissionId: string;
  commission: Commission;
  catalogVersion: string;
  phase: SessionPhase;
  myUid: string;
  participants: Record<string, Participant>;
  /** True for Commissioners (including the Chair); false for the Manager/Administrator and Public Hearing Speakers -- see motionPopupLogic.getMotionPopupView. */
  canSecond: boolean;
}

/**
 * Phase 9b follow-up: one shared pop-up host, mounted once per
 * non-Facilitator role at a table (same mounting pattern ChallengePopup
 * used alone before this file existed -- see Lobby.tsx). Owns the catalog
 * fetch, the Challenge queue (unchanged logic from challengePopupLogic.ts),
 * the Chair's free card pop-up (same first-run/replay-window reasoning,
 * single value instead of a queue -- see freeCardPopupLogic.ts), the
 * Motion pop-up's per-motion dismissal, and the one decision that makes
 * rule 3b possible: which of the three pop-up "types" gets to be on
 * screen at any instant (selectPopupToShow -- Challenge, then Motion,
 * then the Chair's free card). ChallengePopup.tsx, MotionPopup.tsx, and
 * FreeCardAppliedPopup.tsx are all purely presentational children of this.
 */
const REPLAY_WINDOW_MS = 2 * 60 * 1000;

function challengeDismissKey(code: string, commissionId: string, item: ChallengeQueueItem): string {
  return `challenge-popup-seen:${code}:${commissionId}:${item.cardId}:${item.triggeredAt}`;
}

function isChallengeDismissed(code: string, commissionId: string, item: ChallengeQueueItem): boolean {
  try {
    return localStorage.getItem(challengeDismissKey(code, commissionId, item)) === "1";
  } catch {
    return false;
  }
}

function markChallengeDismissed(code: string, commissionId: string, item: ChallengeQueueItem): void {
  try {
    localStorage.setItem(challengeDismissKey(code, commissionId, item), "1");
  } catch {
    // Private-browsing/quota failures just mean this device might see the
    // same popup again after a reload -- not worth surfacing as an error.
  }
}

/**
 * Rule 3a's dismissal tracking, deliberately sessionStorage (not
 * localStorage, unlike the Challenge pop-up): "closing with X doesn't
 * bring back a pop-up for a DIFFERENT motion," but a motion still waiting
 * for a second after the tab is closed and reopened fresh (a new browser
 * session) should show again rather than staying silently dismissed
 * forever.
 */
/**
 * Same localStorage + replay-window semantics as the Challenge pop-up
 * (not Motion's sessionStorage-only approach): chairFreeCardUsed is
 * one-shot per Commission, so this persists across refreshes and a late
 * joiner outside the replay window simply never sees it, exactly like a
 * Challenge that happened a while ago.
 */
function freeCardDismissKey(code: string, commissionId: string, appliedAt: number): string {
  return `free-card-popup-seen:${code}:${commissionId}:${appliedAt}`;
}

function isFreeCardDismissed(code: string, commissionId: string, appliedAt: number): boolean {
  try {
    return localStorage.getItem(freeCardDismissKey(code, commissionId, appliedAt)) === "1";
  } catch {
    return false;
  }
}

function markFreeCardDismissed(code: string, commissionId: string, appliedAt: number): void {
  try {
    localStorage.setItem(freeCardDismissKey(code, commissionId, appliedAt), "1");
  } catch {
    // Same best-effort reasoning as the Challenge dismissal above.
  }
}

function motionDismissKey(code: string, commissionId: string, id: string): string {
  return `motion-popup-seen:${code}:${commissionId}:${id}`;
}

function isMotionDismissed(code: string, commissionId: string, id: string): boolean {
  try {
    return sessionStorage.getItem(motionDismissKey(code, commissionId, id)) === "1";
  } catch {
    return false;
  }
}

function markMotionDismissed(code: string, commissionId: string, id: string): void {
  try {
    sessionStorage.setItem(motionDismissKey(code, commissionId, id), "1");
  } catch {
    // Same best-effort reasoning as the Challenge dismissal above.
  }
}

function EventPopupHost({ code, commissionId, commission, catalogVersion, phase, myUid, participants, canSecond }: Props) {
  const [catalog, setCatalog] = useState<CardCatalog | null>(null);
  const [challengeQueue, setChallengeQueue] = useState<ChallengeQueueItem[]>([]);
  const prevAppliedRef = useRef<Record<string, number> | null>(null);

  const [dismissedMotionIds, setDismissedMotionIds] = useState<Set<string>>(() => new Set());
  const [seconding, setSeconding] = useState(false);
  const [secondError, setSecondError] = useState<string | null>(null);

  const [freeCardPending, setFreeCardPending] = useState(false);
  const prevFreeCardAppliedAtRef = useRef<number | null | undefined>(undefined);

  const [toast, setToast] = useState<string | null>(null);
  const prevSecondedAtRef = useRef<number | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    getCatalog(catalogVersion).then((data) => {
      if (!cancelled) setCatalog(data);
    });
    return () => {
      cancelled = true;
    };
  }, [catalogVersion]);

  // Challenge queueing -- unchanged logic, moved here verbatim from the
  // old ChallengePopup.tsx.
  useEffect(() => {
    const applied = commission.challengesApplied ?? {};
    if (phase === "debrief") {
      prevAppliedRef.current = applied;
      return;
    }

    const newItems = selectChallengesToQueue(
      applied,
      prevAppliedRef.current,
      (item) => isChallengeDismissed(code, commissionId, item),
      Date.now(),
      REPLAY_WINDOW_MS,
    );

    prevAppliedRef.current = applied;
    if (newItems.length > 0) {
      setChallengeQueue((q) => [...q, ...newItems]);
    }
  }, [commission.challengesApplied, code, commissionId, phase]);

  // The Chair's free card pop-up -- same first-run/replay-window reasoning
  // as the Challenge queue above, just for a single value instead of a map.
  useEffect(() => {
    const application = commission.chairFreeCardApplication ?? null;
    if (phase === "debrief") {
      prevFreeCardAppliedAtRef.current = application?.appliedAt ?? null;
      return;
    }

    const shouldQueue = shouldQueueFreeCardPopup(
      application,
      prevFreeCardAppliedAtRef.current,
      (appliedAt) => isFreeCardDismissed(code, commissionId, appliedAt),
      Date.now(),
      REPLAY_WINDOW_MS,
    );

    prevFreeCardAppliedAtRef.current = application?.appliedAt ?? null;
    if (shouldQueue) setFreeCardPending(true);
  }, [commission.chairFreeCardApplication, code, commissionId, phase]);

  // Reset per-motion UI state (seconding/secondError) whenever the pending
  // motion itself changes, so a stale "Already seconded" message from a
  // PREVIOUS motion never bleeds into a new one.
  const motion = commission.activeMotion;
  const currentMotionId = motion ? motionId(motion) : null;
  const prevMotionIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (currentMotionId !== prevMotionIdRef.current) {
      setSecondError(null);
      setSeconding(false);
      prevMotionIdRef.current = currentMotionId;
    }
  }, [currentMotionId]);

  // The brief, non-blocking "[Name] seconded..." confirmation (rule 3a),
  // shown to everyone at the table -- including the mover, who gets no
  // pop-up of their own -- the instant ANY motion at this table is
  // seconded. Skipped on this component's very first observation (a
  // refresh mid-debate shouldn't retroactively announce an old second).
  useEffect(() => {
    const secondedAt = motion?.secondedAt ?? null;
    const prev = prevSecondedAtRef.current;
    if (secondedAt !== null && secondedAt !== prev && prev !== undefined && motion?.secondedBy) {
      const card =
        catalog && motion
          ? (motion.cardType === "revenue"
              ? catalog.revenueCards.find((c) => c.id === motion.cardId)
              : catalog.expenditureCards.find((c) => c.id === motion.cardId))
          : undefined;
      const name = participants[motion.secondedBy]?.name ?? motion.secondedBy;
      setToast(`${name} seconded. Card Under Debate: ${card?.title ?? motion.cardId}.`);
      const timer = setTimeout(() => setToast(null), 4000);
      prevSecondedAtRef.current = secondedAt;
      return () => clearTimeout(timer);
    }
    prevSecondedAtRef.current = secondedAt;
  }, [motion?.secondedAt, motion?.secondedBy, motion?.cardId, motion?.cardType, catalog, participants]);

  if (phase === "debrief" || !catalog) return toast ? <div className="event-toast" role="status">{toast}</div> : null;

  const motionView = motion ? getMotionPopupView(motion, myUid, canSecond) : "none";
  const effectiveMotionView =
    motionView !== "none" && currentMotionId && !dismissedMotionIds.has(currentMotionId) && !isMotionDismissed(code, commissionId, currentMotionId)
      ? motionView
      : "none";

  const toShow = selectPopupToShow(challengeQueue, effectiveMotionView, freeCardPending);
  const motionPopupView: "second" | "infoOnly" | null =
    effectiveMotionView === "second" || effectiveMotionView === "infoOnly" ? effectiveMotionView : null;

  function handleDismissChallenge() {
    const item = challengeQueue[0];
    if (!item) return;
    markChallengeDismissed(code, commissionId, item);
    setChallengeQueue((q) => q.slice(1));
  }

  function handleDismissMotion() {
    if (!currentMotionId) return;
    markMotionDismissed(code, commissionId, currentMotionId);
    setDismissedMotionIds((prev) => new Set(prev).add(currentMotionId));
  }

  function handleDismissFreeCard() {
    const appliedAt = commission.chairFreeCardApplication?.appliedAt;
    if (appliedAt === undefined) return;
    markFreeCardDismissed(code, commissionId, appliedAt);
    setFreeCardPending(false);
  }

  async function handleSecond() {
    setSeconding(true);
    setSecondError(null);
    try {
      const result = await signalSecond(code, commissionId);
      if (!result.ok) {
        const name = result.alreadySecondedBy ? (participants[result.alreadySecondedBy]?.name ?? result.alreadySecondedBy) : null;
        setSecondError(name ? `Already seconded by ${name}.` : (result.reason ?? "Could not second that motion."));
      }
    } finally {
      setSeconding(false);
    }
  }

  const challengeCard =
    toShow?.type === "challenge" ? catalog.challengeCards.find((c) => c.id === toShow.item.cardId) : undefined;

  return (
    <>
      {toShow?.type === "challenge" && challengeCard && (
        <ChallengePopup
          key={`${toShow.item.cardId}-${toShow.item.triggeredAt}`}
          commission={commission}
          card={challengeCard}
          onDismiss={handleDismissChallenge}
        />
      )}
      {toShow?.type === "motion" && motion && motionPopupView && (
        <MotionPopup
          key={currentMotionId ?? undefined}
          motion={motion}
          catalog={catalog}
          participants={participants}
          view={motionPopupView}
          onSecond={handleSecond}
          onDismiss={handleDismissMotion}
          seconding={seconding}
          secondError={secondError}
        />
      )}
      {toShow?.type === "freeCard" && commission.chairFreeCardApplication && (
        <FreeCardAppliedPopup
          key={commission.chairFreeCardApplication.appliedAt}
          application={commission.chairFreeCardApplication}
          catalog={catalog}
          onDismiss={handleDismissFreeCard}
        />
      )}
      {toast && (
        <div className="event-toast" role="status">
          {toast}
        </div>
      )}
    </>
  );
}

export default EventPopupHost;
