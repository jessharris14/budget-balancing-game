import { useEffect, useState } from "react";
import { getCatalog } from "../services/catalogService";
import { createBallotMeasure, isMillageCard } from "../services/ballotService";
import { setChairHighlightedCard, stopDebateTimer } from "../services/chairService";
import {
  applyCard,
  applyChairFreeCard,
  getCardStatus,
  isCardAvailable,
  isSelectedPriorityCard,
  recordFailedMotion,
  reconsiderCard,
  type CardType,
} from "../services/ledgerService";
import { clearMotion, isMotionLocked } from "../services/motionService";
import { formatDuration, useCountdown } from "../hooks/useCountdown";
import AppliedChallengesPanel from "./AppliedChallengesPanel";
import BallotMeasureModal from "./BallotMeasureModal";
import BallotMeasuresList from "./BallotMeasuresList";
import { cardStatusRowClass } from "./cardStatusDisplay";
import CardStatusLegend from "./CardStatusLegend";
import DebriefScorecard from "./DebriefScorecard";
import LedgerStatusBar from "./LedgerStatusBar";
import PriorityTile from "./PriorityTile";
import PublicTrustGauge from "./PublicTrustGauge";
import type { CardCatalog } from "../types/catalog";
import { SESSION_PHASE_LABELS, type Commission, type Session } from "../types/session";
import "./session.css";
import "./ManagerConsole.css";

interface Props {
  code: string;
  session: Session;
  commissionId: string;
  commission: Commission;
}

function ManagerConsole({ code, session, commissionId, commission }: Props) {
  const [catalog, setCatalog] = useState<CardCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyCardId, setBusyCardId] = useState<string | null>(null);
  const [freeCardChoice, setFreeCardChoice] = useState<{ type: CardType; id: string } | null>(null);
  // Tracks the last ballot that was active, so the modal can keep showing
  // its final result after activeBallotId clears back to null on
  // resolution -- the ballot record itself (and so the result shown)
  // still comes entirely from server state, this just remembers which
  // one to keep looking up until the Administrator dismisses it.
  const [lastBallotId, setLastBallotId] = useState<string | null>(null);
  const [ballotDismissed, setBallotDismissed] = useState(false);

  useEffect(() => {
    getCatalog(session.catalogVersion)
      .then((data) => {
        if (!data) {
          setError(`Catalog "${session.catalogVersion}" not found.`);
          return;
        }
        setCatalog(data);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [session.catalogVersion]);

  // Hooks must run unconditionally, before the "still loading the catalog"
  // early return below.
  const clock = session.clock ?? { phaseTimer: null, mainGameTimer: null, nextChallengeDue: null };
  const phaseTimerMs = useCountdown(clock.phaseTimer);
  const mainGameMs = useCountdown(clock.mainGameTimer);
  const debateMs = useCountdown(commission.debateTimerEndsAt ?? null);

  useEffect(() => {
    if (commission.activeBallotId && commission.activeBallotId !== lastBallotId) {
      setLastBallotId(commission.activeBallotId);
      setBallotDismissed(false);
    }
  }, [commission.activeBallotId, lastBallotId]);

  async function runAction(cardId: string, action: () => Promise<{ ok: boolean; reason?: string }>) {
    setBusyCardId(cardId);
    setError(null);
    try {
      const result = await action();
      if (!result.ok) setError(result.reason ?? "Action failed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyCardId(null);
    }
  }

  if (error && !catalog) return <p className="session-view error">{error}</p>;
  if (!catalog) return <p className="session-view">Loading ledger…</p>;

  const highlightedCardType: CardType | null = commission.chairHighlightedCardId
    ? (catalog.revenueCards.some((c) => c.id === commission.chairHighlightedCardId) ? "revenue" : "expenditure")
    : null;

  /**
   * Applies the card currently under debate via the exact same applyCard
   * used by the catalog table's own per-card buttons -- not a
   * reimplementation. For a millage card, applying it directly would skip
   * the Board's actual decision mechanism for a millage rate: instead of
   * applying it, this opens a Ballot Measure for the room to vote on --
   * the card only actually gets applied if that ballot later passes, via
   * closeBallotMeasure calling this exact same applyCard.
   *
   * Phase 7 A1: stops the Chair's debate timer the instant the motion is
   * resolved (or, for a millage card, handed off to the Ballot Measure
   * flow -- the Board's debate is over once it has voted, not once the
   * ballot itself later closes). debateTimerEndsAt is a shared field, so
   * clearing it here updates every role watching it, not just the Chair's
   * own screen; the Chair's manual Start/Restart/Stop controls are
   * untouched.
   */
  function handleMotionPasses() {
    const cardId = commission.chairHighlightedCardId;
    if (!cardId || !highlightedCardType) return;
    if (isMillageCard(catalog!, highlightedCardType, cardId)) {
      void runAction(cardId, async () => {
        await createBallotMeasure(code, commissionId, highlightedCardType, cardId);
        await stopDebateTimer(code, commissionId);
        return { ok: true };
      });
      return;
    }
    void runAction(cardId, async () => {
      const result = await applyCard(code, commissionId, catalog!, highlightedCardType, cardId);
      if (result.ok) await stopDebateTimer(code, commissionId);
      return result;
    });
  }

  /**
   * Clears Card Under Debate without applying anything -- same clearing
   * behavior as the Chair's own resolved-motion Clear button, just
   * reachable from the Administrator's panel. Only clears the pending
   * motion too if it's actually for this same card; an unrelated motion
   * at another table/card is left alone.
   *
   * Previously had no catch block: if setChairHighlightedCard's write was
   * rejected (e.g. the chairHighlightedCardId RTDB rule widening from
   * last round not actually being deployed yet), the error propagated
   * uncaught while `finally` still cleared busyCardId -- from the
   * Administrator's side that looked exactly like "starts processing,
   * then resets itself" with no visible explanation. Routing through
   * runAction surfaces that failure the same way every other action here
   * does.
   */
  async function handleMotionFails() {
    const cardId = commission.chairHighlightedCardId;
    if (!cardId || !highlightedCardType) return;
    await runAction(cardId, async () => {
      await setChairHighlightedCard(code, commissionId, null);
      if (commission.activeMotion?.cardId === cardId) {
        await clearMotion(code, commissionId);
      }
      await stopDebateTimer(code, commissionId);
      await recordFailedMotion(code, commissionId, cardId, highlightedCardType);
      return { ok: true };
    });
  }

  const highlightedCard = commission.chairHighlightedCardId
    ? (catalog.revenueCards.find((c) => c.id === commission.chairHighlightedCardId) ??
      catalog.expenditureCards.find((c) => c.id === commission.chairHighlightedCardId))
    : null;

  // Keeps showing the ballot (including its final result) until the
  // Administrator dismisses it, even after activeBallotId clears back to
  // null on resolution -- see the lastBallotId effect above.
  const visibleBallotId = !ballotDismissed ? lastBallotId : null;
  const visibleBallot = visibleBallotId ? commission.ballotMeasures?.[visibleBallotId] : null;
  const visibleBallotCard = visibleBallot
    ? (visibleBallot.cardType === "revenue"
        ? catalog.revenueCards.find((c) => c.id === visibleBallot.cardId)
        : catalog.expenditureCards.find((c) => c.id === visibleBallot.cardId))
    : undefined;

  const chairName = commission.members?.chairId
    ? (session.participants[commission.members.chairId]?.name ?? commission.members.chairId)
    : null;

  const speakerCount = Object.values(session.publicHearingSpeakers ?? {}).filter(
    (s) => s.commissionId === commissionId,
  ).length;

  const motion = commission.activeMotion;
  const motionCard = motion
    ? (catalog.revenueCards.find((c) => c.id === motion.cardId) ??
      catalog.expenditureCards.find((c) => c.id === motion.cardId))
    : null;
  const moverName = motion ? (session.participants[motion.movedBy]?.name ?? motion.movedBy) : null;
  const seconderName = motion?.secondedBy ? (session.participants[motion.secondedBy]?.name ?? motion.secondedBy) : null;
  const showMotionProvenance = !!motion?.secondedBy && motion.cardId === commission.chairHighlightedCardId;
  /**
   * Change 4: Reconsider is disabled while isMotionLocked (Change 1) is
   * true -- a motion/debate/ballot in progress elsewhere on this
   * Commission's table means the ledger shouldn't also be changing
   * underneath it from a reconsideration at the same moment. The
   * alternative (allow it anytime) was considered and rejected: Change 1
   * exists specifically to stop the ledger-adjacent state from moving
   * mid-vote, and letting Reconsider bypass that same guard would defeat
   * its own purpose for no real benefit -- a Commission that wants to
   * reconsider something can always do it the instant the current motion
   * resolves, which is rarely more than a few minutes away.
   */
  const reconsiderLocked = isMotionLocked(commission);

  const canUseFreeCard = session.phase === "mainGame" && !commission.chairFreeCardUsed;
  const dollarCards = [
    ...catalog.revenueCards
      .filter((c) => c.amount === 1 && isCardAvailable(commission, c.id))
      .map((c) => ({ type: "revenue" as CardType, id: c.id, title: c.title })),
    ...catalog.expenditureCards
      .filter((c) => c.amount === 1 && isCardAvailable(commission, c.id))
      .map((c) => ({ type: "expenditure" as CardType, id: c.id, title: c.title })),
  ];

  return (
    <div className="session-view manager-console">
      <h1>Manager/Administrator Console — {code}</h1>
      <p>{commission.name ?? `Table ${commissionId} (unnamed)`}</p>

      <p>
        Phase: <strong>{SESSION_PHASE_LABELS[session.phase] ?? session.phase}</strong>
      </p>
      {session.phase === "rankPriorities" && phaseTimerMs !== null && (
        <p>Rank Priorities time remaining: {formatDuration(phaseTimerMs)}</p>
      )}
      {session.phase === "mainGame" && mainGameMs !== null && (
        <p>Main Game time remaining: {formatDuration(mainGameMs)}</p>
      )}
      <p>Chair: {chairName ?? "not yet elected"}</p>

      {session.phase === "debrief" ? (
        <DebriefScorecard commission={commission} catalog={catalog} speakerCount={speakerCount} />
      ) : (
        <>
          <LedgerStatusBar ledger={commission.ledger} />
          <PublicTrustGauge publicTrustTally={commission.publicTrustTally} speakerCount={speakerCount} />
          {session.phase === "mainGame" && (
            <PriorityTile priority={commission.priority} priorityCards={catalog.priorityCards} catalog={catalog} />
          )}
        </>
      )}

      {error && <p className="error">{error}</p>}

      {/* Change 1: same duplicate-panel fix as every other role -- Pending Motion only shows while unseconded; once seconded, Card Under Debate folds the mover/seconder in as one line instead. */}
      {session.phase === "mainGame" && motion && !motion.secondedBy && (
        <div className="lobby-commission">
          <h3>Pending Motion</h3>
          <p>
            {motionCard?.title ?? motion.cardId} — moved by {moverName}
          </p>
          <p>— awaiting second —</p>
        </div>
      )}

      {commission.chairHighlightedCardId && (
        <div className="lobby-commission chair-highlight">
          <h3>Card Under Debate</h3>
          <p>{highlightedCard?.title ?? commission.chairHighlightedCardId}</p>
          {showMotionProvenance && (
            <p>
              Moved by {moverName}, seconded by {seconderName}
            </p>
          )}
          {debateMs !== null && <p>Debate timer: {formatDuration(debateMs)}</p>}
          {/* Once a Ballot Measure has actually been opened for this card, its own modal takes over -- Motion Passes/Fails no longer apply until the ballot resolves. Phase 7 B2: also frozen once Debrief starts. */}
          {session.phase === "mainGame" && !commission.activeBallotId && (
            <div className="chair-timer-controls">
              <button onClick={handleMotionPasses} disabled={busyCardId === commission.chairHighlightedCardId}>
                Motion Passes
              </button>
              <button onClick={() => void handleMotionFails()} disabled={busyCardId === commission.chairHighlightedCardId}>
                Motion Fails
              </button>
            </div>
          )}
        </div>
      )}

      {visibleBallot && (
        <BallotMeasureModal
          code={code}
          commissionId={commissionId}
          catalog={catalog}
          card={visibleBallotCard}
          ballot={visibleBallot}
          onDismiss={() => setBallotDismissed(true)}
        />
      )}

      <AppliedChallengesPanel commission={commission} catalog={catalog} />

      {canUseFreeCard && (
        <div className="lobby-commission">
          <h3>Chair's Free Card (one-time, $1 only)</h3>
          <select
            value={freeCardChoice ? `${freeCardChoice.type}:${freeCardChoice.id}` : ""}
            onChange={(e) => {
              const [type, id] = e.target.value.split(":");
              setFreeCardChoice(type && id ? { type: type as CardType, id } : null);
            }}
          >
            <option value="">Select a $1 card…</option>
            {dollarCards.map((c) => (
              <option key={`${c.type}:${c.id}`} value={`${c.type}:${c.id}`}>
                {c.id} — {c.title} ({c.type})
              </option>
            ))}
          </select>
          <button
            onClick={() =>
              freeCardChoice &&
              runAction(freeCardChoice.id, () =>
                applyChairFreeCard(code, commissionId, catalog, session.phase, freeCardChoice.type, freeCardChoice.id),
              )
            }
            disabled={!freeCardChoice || busyCardId === freeCardChoice.id}
          >
            Apply Free Card
          </button>
        </div>
      )}

      {session.phase !== "debrief" && <BallotMeasuresList commission={commission} catalog={catalog} />}

      {/*
        Change 3: Decisions So Far is gone -- status now lives directly on
        each row below (Applied/Did not pass/Locked out, Priority still
        green). No per-card Apply button here either (earlier change): the
        only way to apply a normal card is Motion Passes on Card Under
        Debate, once a motion has been moved and seconded.
      */}
      <CardStatusLegend />

      <h2>Revenue Cards</h2>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Title</th>
            <th>Impact Bullets</th>
            <th>Amount</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {catalog.revenueCards.map((card) => {
            const { status, label } = getCardStatus(commission, card.id, "revenue");
            const isPriority = isSelectedPriorityCard(catalog, commission, "revenue", card.id);
            const underDebate = commission.chairHighlightedCardId === card.id;
            return (
              <tr key={card.id} className={cardStatusRowClass(status, isPriority, underDebate)}>
                <td data-label="ID">{card.id}</td>
                <td data-label="Title">
                  {card.title}
                  {isPriority && <span className="priority-badge">Priority</span>}
                </td>
                <td data-label="Impact Bullets">{card.impactBullets.join("; ")}</td>
                <td data-label="Amount">
                  ${card.amount} ({card.direction})
                </td>
                <td data-label="Status">
                  <span className={`card-status-badge status-${status}`}>{label}</span>
                  {status === "applied" && (
                    <>
                      <button
                        onClick={() => void runAction(card.id, () => reconsiderCard(code, commissionId, catalog, card.id))}
                        disabled={reconsiderLocked || busyCardId === card.id}
                      >
                        Reconsider
                      </button>
                      {reconsiderLocked && <p className="reconsider-hint">Finish the current motion first.</p>}
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h2>Expenditure Cards</h2>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Title</th>
            <th>Impact Bullets</th>
            <th>Amount</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {catalog.expenditureCards.map((card) => {
            const { status, label } = getCardStatus(commission, card.id, "expenditure");
            const isPriority = isSelectedPriorityCard(catalog, commission, "expenditure", card.id);
            const underDebate = commission.chairHighlightedCardId === card.id;
            return (
              <tr key={card.id} className={cardStatusRowClass(status, isPriority, underDebate)}>
                <td data-label="ID">{card.id}</td>
                <td data-label="Title">
                  {card.title}
                  {isPriority && <span className="priority-badge">Priority</span>}
                </td>
                <td data-label="Impact Bullets">{card.impactBullets.join("; ")}</td>
                <td data-label="Amount">
                  ${card.amount} ({card.direction})
                </td>
                <td data-label="Status">
                  <span className={`card-status-badge status-${status}`}>{label}</span>
                  {status === "applied" && (
                    <>
                      <button
                        onClick={() => void runAction(card.id, () => reconsiderCard(code, commissionId, catalog, card.id))}
                        disabled={reconsiderLocked || busyCardId === card.id}
                      >
                        Reconsider
                      </button>
                      {reconsiderLocked && <p className="reconsider-hint">Finish the current motion first.</p>}
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default ManagerConsole;
