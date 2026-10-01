import { useEffect, useState } from "react";
import { getCatalog } from "../services/catalogService";
import { setChairHighlightedCard } from "../services/chairService";
import {
  applyCard,
  applyChairFreeCard,
  isCardAvailable,
  isSelectedPriorityCard,
  reconsiderCard,
  type CardType,
} from "../services/ledgerService";
import { clearMotion } from "../services/motionService";
import { formatDuration, useCountdown } from "../hooks/useCountdown";
import DecisionsList from "./DecisionsList";
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

  /** Applies the card currently under debate via the exact same applyCard used by the catalog table's own per-card buttons -- not a reimplementation. */
  function handleMotionPasses() {
    const cardId = commission.chairHighlightedCardId;
    if (!cardId || !highlightedCardType) return;
    void runAction(cardId, () => applyCard(code, commissionId, catalog!, highlightedCardType, cardId));
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
    if (!cardId) return;
    await runAction(cardId, async () => {
      await setChairHighlightedCard(code, commissionId, null);
      if (commission.activeMotion?.cardId === cardId) {
        await clearMotion(code, commissionId);
      }
      return { ok: true };
    });
  }

  const highlightedCard = commission.chairHighlightedCardId
    ? (catalog.revenueCards.find((c) => c.id === commission.chairHighlightedCardId) ??
      catalog.expenditureCards.find((c) => c.id === commission.chairHighlightedCardId))
    : null;

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

      <LedgerStatusBar ledger={commission.ledger} />
      <PublicTrustGauge publicTrustTally={commission.publicTrustTally} speakerCount={speakerCount} />
      {session.phase === "mainGame" && (
        <PriorityTile priority={commission.priority} priorityCards={catalog.priorityCards} catalog={catalog} />
      )}

      {error && <p className="error">{error}</p>}

      {session.phase === "mainGame" && motion && (
        <div className="lobby-commission">
          <h3>Pending Motion</h3>
          <p>
            {motionCard?.title ?? motion.cardId} — moved by {moverName}
          </p>
          <p>{seconderName ? `Seconded by ${seconderName}` : "— awaiting second —"}</p>
        </div>
      )}

      {commission.chairHighlightedCardId && (
        <div className="lobby-commission chair-highlight">
          <h3>Card Under Debate</h3>
          <p>{highlightedCard?.title ?? commission.chairHighlightedCardId}</p>
          {debateMs !== null && <p>Debate timer: {formatDuration(debateMs)}</p>}
          <div className="chair-timer-controls">
            <button onClick={handleMotionPasses} disabled={busyCardId === commission.chairHighlightedCardId}>
              Motion Passes
            </button>
            <button onClick={() => void handleMotionFails()} disabled={busyCardId === commission.chairHighlightedCardId}>
              Motion Fails
            </button>
          </div>
        </div>
      )}

      {commission.activeChallenge && (
        <div className="lobby-commission">
          <h3>Active Challenge</h3>
          <p>{commission.activeChallenge.printedText}</p>
          <p>Applied to the ledger automatically when triggered -- Challenges can't be debated or declined.</p>
        </div>
      )}

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

      <DecisionsList
        commission={commission}
        catalog={catalog}
        onReconsider={(cardId) => void runAction(cardId, () => reconsiderCard(code, commissionId, catalog, cardId))}
        reconsideringCardId={busyCardId}
      />

      {/*
        No per-card Apply button here anymore (spec change): the only way
        to apply a normal card is Motion Passes on Card Under Debate, once
        a motion has been moved and seconded. These tables are now
        read-only reference -- find the card, see its status, see the
        Priority badge -- same as every other role already sees them.
      */}
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
            const played = commission.cardsInPlay?.[card.id];
            const lockedOut = commission.cardsLockedOut?.[card.id];
            const isPriority = isSelectedPriorityCard(catalog, commission, "revenue", card.id);
            return (
              <tr key={card.id} className={isPriority ? "priority-card-row" : undefined}>
                <td data-label="ID">{card.id}</td>
                <td data-label="Title">
                  {card.title}
                  {isPriority && <span className="priority-badge">Priority</span>}
                </td>
                <td data-label="Impact Bullets">{card.impactBullets.join("; ")}</td>
                <td data-label="Amount">
                  ${card.amount} ({card.direction})
                </td>
                <td data-label="Status">{played ? "Played" : lockedOut ? "Locked out" : "Available"}</td>
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
            const played = commission.cardsInPlay?.[card.id];
            const isPriority = isSelectedPriorityCard(catalog, commission, "expenditure", card.id);
            return (
              <tr key={card.id} className={isPriority ? "priority-card-row" : undefined}>
                <td data-label="ID">{card.id}</td>
                <td data-label="Title">
                  {card.title}
                  {isPriority && <span className="priority-badge">Priority</span>}
                </td>
                <td data-label="Impact Bullets">{card.impactBullets.join("; ")}</td>
                <td data-label="Amount">
                  ${card.amount} ({card.direction})
                </td>
                <td data-label="Status">{played ? "Played" : "Available"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default ManagerConsole;
