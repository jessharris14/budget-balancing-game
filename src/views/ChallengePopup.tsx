import { useEffect, useRef, useState } from "react";
import { getCatalog } from "../services/catalogService";
import { selectChallengesToQueue, type ChallengeQueueItem } from "../services/challengePopupLogic";
import { computeChallengeDeltas } from "../services/ledgerService";
import type { CardCatalog, ChallengeCard } from "../types/catalog";
import type { Commission, SessionPhase } from "../types/session";
import "./ChallengePopup.css";

interface Props {
  code: string;
  commissionId: string;
  commission: Commission;
  catalogVersion: string;
  phase: SessionPhase;
}

type QueueItem = ChallengeQueueItem;

/**
 * Phase 8 follow-up: an un-dismissed challenge survives a reload only if it
 * was triggered within this window -- the Facilitator's own stated
 * preference ("show an un-dismissed challenge on reload if it was triggered
 * in the last couple of minutes, and rely on the Applied Challenges section
 * after that"). Anything older just shows up in Applied Challenges instead.
 */
const REPLAY_WINDOW_MS = 2 * 60 * 1000;

function dismissKey(code: string, commissionId: string, item: QueueItem): string {
  return `challenge-popup-seen:${code}:${commissionId}:${item.cardId}:${item.triggeredAt}`;
}

function isDismissed(code: string, commissionId: string, item: QueueItem): boolean {
  try {
    return localStorage.getItem(dismissKey(code, commissionId, item)) === "1";
  } catch {
    return false;
  }
}

function markDismissed(code: string, commissionId: string, item: QueueItem): void {
  try {
    localStorage.setItem(dismissKey(code, commissionId, item), "1");
  } catch {
    // Private-browsing/quota failures just mean this device might see the
    // same popup again after a reload -- not worth surfacing as an error.
  }
}

function formatDelta(delta: number): string {
  if (delta === 0) return "no change";
  return delta > 0 ? `+$${delta.toLocaleString()}` : `-$${Math.abs(delta).toLocaleString()}`;
}

/**
 * One shared component, mounted once in Lobby.tsx for every non-Facilitator
 * role at a table (Manager/Administrator, Chair, Commissioners, and Public
 * Hearing Speakers assigned to that Commission), reacting purely to
 * commission.challengesApplied -- the same data every one of those roles
 * already subscribes to via the session listener. Display-only: it never
 * writes anything, so it can't touch the debate timer, a pending motion, or
 * an open Ballot Measure.
 *
 * "New" is judged against this component's own first render for this
 * commissionId, not against any write timestamp this device made --
 * because this mounts fresh on every join/refresh/reconnect, the very
 * first batch of challengesApplied entries it ever sees are NOT
 * automatically "new" (that would replay the entire history on every
 * reload); only entries that appear in a LATER update, after this
 * component was already watching, count as a live trigger. The exception
 * is the REPLAY_WINDOW_MS carve-out above, for a challenge that landed
 * moments before this device connected.
 */
function ChallengePopup({ code, commissionId, commission, catalogVersion, phase }: Props) {
  const [catalog, setCatalog] = useState<CardCatalog | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const prevAppliedRef = useRef<Record<string, number> | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCatalog(catalogVersion).then((data) => {
      if (!cancelled) setCatalog(data);
    });
    return () => {
      cancelled = true;
    };
  }, [catalogVersion]);

  useEffect(() => {
    // Debrief freezes the game (rule 4) -- don't queue anything while frozen,
    // but keep the baseline current so re-entering (shouldn't happen, but
    // cheap to guard) doesn't treat everything that happened during Debrief
    // as suddenly new.
    const applied = commission.challengesApplied ?? {};
    if (phase === "debrief") {
      prevAppliedRef.current = applied;
      return;
    }

    const newItems = selectChallengesToQueue(
      applied,
      prevAppliedRef.current,
      (item) => isDismissed(code, commissionId, item),
      Date.now(),
      REPLAY_WINDOW_MS,
    );

    prevAppliedRef.current = applied;
    if (newItems.length > 0) {
      // Rule 3: queue rather than replace, so two close-together challenges
      // both get shown, one after another.
      setQueue((q) => [...q, ...newItems]);
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        try {
          navigator.vibrate(200);
        } catch {
          // Best-effort only -- plenty of browsers/devices don't support it.
        }
      }
    }
  }, [commission.challengesApplied, code, commissionId, phase]);

  const current = queue[0];
  const card: ChallengeCard | undefined =
    current && catalog ? catalog.challengeCards.find((c) => c.id === current.cardId) : undefined;

  if (phase === "debrief" || !current || !card) return null;

  const { reservesDelta, deficitDelta } = computeChallengeDeltas(card);
  const hitReserves = card.target === "reserves";

  function handleDismiss() {
    markDismissed(code, commissionId, current);
    setQueue((q) => q.slice(1));
  }

  return (
    // Keyed by the challenge itself so a FRESH element mounts when the
    // queue advances to the next item -- otherwise the button below would
    // be the same DOM node across items and autoFocus (which only fires on
    // mount) would never move focus to the next challenge.
    <div className="challenge-popup-backdrop" key={`${current.cardId}-${current.triggeredAt}`}>
      <div className="challenge-popup" role="alertdialog" aria-modal="true" aria-labelledby="challenge-popup-heading">
        <div className="challenge-popup-scroll">
          <h2 id="challenge-popup-heading">⚡ New Challenge!</h2>
          <p className="challenge-popup-title">{card.title}</p>
          <p className="challenge-popup-text">{card.printedText}</p>
          <p className="challenge-popup-effect">
            {hitReserves ? "Reserves" : "Deficit/Surplus"}: {formatDelta(hitReserves ? reservesDelta : deficitDelta)}
          </p>
          <p className="challenge-popup-note">Applied to the ledger automatically -- Challenges can't be debated or declined.</p>
        </div>
        <button className="challenge-popup-dismiss" onClick={handleDismiss} autoFocus>
          Got it
        </button>
      </div>
    </div>
  );
}

export default ChallengePopup;
