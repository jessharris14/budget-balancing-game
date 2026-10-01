import { useEffect, useState } from "react";
import { getCatalog } from "../services/catalogService";
import {
  recordCommissionPriority,
  setChairHighlightedCard,
  startDebateTimer,
  stopDebateTimer,
} from "../services/chairService";
import { isCardAvailable, isSelectedPriorityCard, type CardType } from "../services/ledgerService";
import { clearMotion, signalMotion, signalSecond } from "../services/motionService";
import { formatDuration, useCountdown } from "../hooks/useCountdown";
import BallotMeasuresList from "./BallotMeasuresList";
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
  isMyChair: boolean;
  myUid: string;
}

/**
 * Commissioner (and, if elected, Chair) view. Per spec Section 8a #2/#3:
 * Commissioners get the full Revenue/Expenditure catalog to browse
 * read-only (no apply/reconsider -- that stays exclusive to the
 * Manager/Administrator) plus the universal status bar and decisions log.
 * The Chair additionally gets two live controls -- highlighting a card as
 * "currently under debate" and running the debate timer -- but records no
 * vote outcome of any kind and doesn't gate the Manager/Administrator's own
 * apply/reconsider actions. During Main Game, any Commissioner can also
 * signal a motion/second (Phase 6 #1) -- a lightweight, non-gating signal,
 * same trust model as everything else here.
 */
function CommissionerView({ code, session, commissionId, commission, isMyChair, myUid }: Props) {
  const [catalog, setCatalog] = useState<CardCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [motionBusyCardId, setMotionBusyCardId] = useState<string | null>(null);

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

  const clock = session.clock ?? { phaseTimer: null, mainGameTimer: null, nextChallengeDue: null };
  const phaseTimerMs = useCountdown(clock.phaseTimer);
  const mainGameMs = useCountdown(clock.mainGameTimer);
  const debateMs = useCountdown(commission.debateTimerEndsAt ?? null);

  useEffect(() => {
    setSelectedCardId(commission.chairHighlightedCardId ?? "");
  }, [commission.chairHighlightedCardId]);

  // The moment a motion has both a mover and a seconder, auto-highlight
  // that card as "Card Under Debate" -- no separate manual step for the
  // Chair -- and clear the motion itself, since its job (capturing who
  // moved/seconded) is done and Card Under Debate is now the single
  // source of truth for what's being discussed. Without this, Pending
  // Motion kept showing the same card as a stale duplicate alongside Card
  // Under Debate with no visible relationship between the two (matches
  // this app's existing motion/second design: a motion is only ever a
  // pointer to what the room is currently debating, not a permanent
  // record -- applyCard already clears it the same way once the card is
  // actually applied; this just moves that same "resolved" moment earlier,
  // to promotion time). Only ever runs on the Chair's own client, since
  // both chairHighlightedCardId and activeMotion are writable by the
  // Chair (activeMotion by any Commissioner, chairHighlightedCardId by the
  // Chair alone per RTDB rules), and only writes when the highlight
  // doesn't already match, so it can't fight a manual dropdown change. A
  // table that skips motion/second and highlights verbally instead never
  // produces a seconded motion, so this never interferes with that
  // fallback.
  useEffect(() => {
    if (!isMyChair) return;
    const activeMotion = commission.activeMotion;
    if (!activeMotion?.secondedBy) return;
    if (commission.chairHighlightedCardId === activeMotion.cardId) return;
    void setChairHighlightedCard(code, commissionId, activeMotion.cardId);
    void clearMotion(code, commissionId);
  }, [
    isMyChair,
    commission.activeMotion?.cardId,
    commission.activeMotion?.secondedBy,
    commission.chairHighlightedCardId,
    code,
    commissionId,
  ]);

  // The debate is over once the highlighted card is actually applied --
  // clear Card Under Debate automatically rather than leaving it to show
  // an already-decided card until the Chair notices and clicks Clear.
  // Only ever runs on the Chair's own client (same write-access reason as
  // above); applyCard already clears a matching activeMotion on its own
  // (it has legitimate write access there), so this only needs to handle
  // the highlight side.
  useEffect(() => {
    if (!isMyChair) return;
    const highlighted = commission.chairHighlightedCardId;
    if (!highlighted) return;
    if (!commission.cardsInPlay?.[highlighted]) return;
    void setChairHighlightedCard(code, commissionId, null);
  }, [isMyChair, commission.chairHighlightedCardId, commission.cardsInPlay, code, commissionId]);

  if (error && !catalog) return <p className="session-view error">{error}</p>;
  if (!catalog) return <p className="session-view">Loading catalog…</p>;

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

  async function handleHighlight(cardId: string) {
    setBusy(true);
    try {
      await setChairHighlightedCard(code, commissionId, cardId || null);
    } finally {
      setBusy(false);
    }
  }

  async function handleStartTimer() {
    setBusy(true);
    try {
      await startDebateTimer(code, commissionId, session.settings.debateTimerMinutes);
    } finally {
      setBusy(false);
    }
  }

  async function handleStopTimer() {
    setBusy(true);
    try {
      await stopDebateTimer(code, commissionId);
    } finally {
      setBusy(false);
    }
  }

  async function handleSelectPriority(cardId: string) {
    setBusy(true);
    try {
      await recordCommissionPriority(code, commissionId, cardId);
    } finally {
      setBusy(false);
    }
  }

  async function handleMotion(cardId: string, cardType: CardType) {
    setMotionBusyCardId(cardId);
    try {
      await signalMotion(code, commissionId, cardId, cardType);
    } finally {
      setMotionBusyCardId(null);
    }
  }

  async function handleSecond() {
    setBusy(true);
    try {
      await signalSecond(code, commissionId);
    } finally {
      setBusy(false);
    }
  }

  async function handleClearMotion() {
    setBusy(true);
    try {
      // Clearing a resolved motion shouldn't leave its auto-highlighted
      // card lingering as "Card Under Debate" until the next motion starts.
      // Only the Chair's client can write chairHighlightedCardId, and only
      // when it still matches the motion being cleared (an unrelated
      // manual highlight is left alone).
      if (isMyChair && motion && commission.chairHighlightedCardId === motion.cardId) {
        await setChairHighlightedCard(code, commissionId, null);
      }
      await clearMotion(code, commissionId);
    } finally {
      setBusy(false);
    }
  }

  /** Shared Motion/Second cell for both catalog tables -- Main Game only, and only for cards not already played or locked out. */
  function renderMotionCell(cardId: string, cardType: CardType) {
    if (session.phase !== "mainGame") return null;
    if (!isCardAvailable(commission, cardId)) return <span>—</span>;
    if (motion?.cardId === cardId) {
      if (!motion.secondedBy && motion.movedBy !== myUid) {
        return (
          <button onClick={handleSecond} disabled={busy}>
            Second
          </button>
        );
      }
      return <span>Motioned</span>;
    }
    return (
      <button onClick={() => handleMotion(cardId, cardType)} disabled={motionBusyCardId === cardId}>
        {motionBusyCardId === cardId ? "Motioning…" : "I move to adopt"}
      </button>
    );
  }

  return (
    <div className="session-view manager-console">
      <h1>{isMyChair ? "Board Chair" : "Commissioner"} View — {code}</h1>
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
      <p>
        Chair: {chairName ?? "not yet elected"}
        {isMyChair && " (you)"}
      </p>

      {session.phase === "rankPriorities" && (
        <div className="lobby-commission">
          <h3>Rank Priorities</h3>
          {isMyChair ? (
            <div className="role-options">
              {catalog.priorityCards.map((card) => {
                const selected = commission.priority?.selectedCardId === card.id;
                return (
                  <label key={card.id} className={selected ? "priority-option-selected" : undefined}>
                    <input
                      type="radio"
                      name="priority"
                      checked={selected}
                      disabled={busy}
                      onChange={() => handleSelectPriority(card.id)}
                    />
                    {card.title} — {card.description}
                    {selected && <span className="priority-selected-check"> ✓ Selected</span>}
                  </label>
                );
              })}
            </div>
          ) : (
            <ul>
              {catalog.priorityCards.map((card) => {
                const selected = commission.priority?.selectedCardId === card.id;
                return (
                  <li key={card.id} className={selected ? "priority-option-selected" : undefined}>
                    {card.title} — {card.description}
                    {selected && <span className="priority-selected-check"> ✓ Selected</span>}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="priority-selected-line">
            Selected:{" "}
            {commission.priority?.selectedCardId
              ? (catalog.priorityCards.find((c) => c.id === commission.priority?.selectedCardId)?.title ??
                commission.priority.selectedCardId)
              : "not yet recorded by the Chair"}
          </p>
        </div>
      )}

      {session.phase === "mainGame" && (
        <PriorityTile priority={commission.priority} priorityCards={catalog.priorityCards} catalog={catalog} />
      )}

      <LedgerStatusBar ledger={commission.ledger} />
      <PublicTrustGauge publicTrustTally={commission.publicTrustTally} speakerCount={speakerCount} />

      {error && <p className="error">{error}</p>}

      {commission.activeChallenge && (
        <div className="lobby-commission">
          <h3>Active Challenge</h3>
          <p>{commission.activeChallenge.printedText}</p>
        </div>
      )}

      {session.phase === "mainGame" && motion && (
        <div className="lobby-commission">
          <h3>Pending Motion</h3>
          <p>
            {motionCard?.title ?? motion.cardId} — moved by {moverName}
          </p>
          <p>{seconderName ? `Seconded by ${seconderName}` : "— awaiting second —"}</p>
          {!motion.secondedBy && motion.movedBy !== myUid && (
            <button onClick={handleSecond} disabled={busy}>
              Second
            </button>
          )}
          {(motion.movedBy === myUid || isMyChair) && (
            <button onClick={handleClearMotion} disabled={busy}>
              Clear
            </button>
          )}
        </div>
      )}

      <div className="lobby-commission chair-highlight">
        <h3>Card Under Debate</h3>
        {isMyChair ? (
          <>
            <select value={selectedCardId} onChange={(e) => handleHighlight(e.target.value)} disabled={busy}>
              <option value="">— none highlighted —</option>
              <optgroup label="Revenue">
                {catalog.revenueCards.map((card) => (
                  <option key={card.id} value={card.id}>
                    {card.title}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Expenditure">
                {catalog.expenditureCards.map((card) => (
                  <option key={card.id} value={card.id}>
                    {card.title}
                  </option>
                ))}
              </optgroup>
            </select>
            <div className="chair-timer-controls">
              <button onClick={handleStartTimer} disabled={busy}>
                {commission.debateTimerEndsAt !== null ? "Restart Timer" : "Start Timer"}
              </button>
              <button onClick={handleStopTimer} disabled={busy || commission.debateTimerEndsAt === null}>
                Stop Timer
              </button>
              {debateMs !== null && <span className="debate-timer-remaining">{formatDuration(debateMs)}</span>}
            </div>
          </>
        ) : (
          <>
            <p>{highlightedCard ? highlightedCard.title : "No card currently highlighted by the Chair."}</p>
            {debateMs !== null && <p>Debate timer: {formatDuration(debateMs)}</p>}
          </>
        )}
      </div>

      <DecisionsList commission={commission} catalog={catalog} />
      <BallotMeasuresList commission={commission} catalog={catalog} />

      <h2>Revenue Cards</h2>
      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Impact Bullets</th>
            <th>Amount</th>
            {session.phase === "mainGame" && <th></th>}
          </tr>
        </thead>
        <tbody>
          {catalog.revenueCards.map((card) => {
            const isPriority = isSelectedPriorityCard(catalog, commission, "revenue", card.id);
            return (
              <tr key={card.id} className={isPriority ? "priority-card-row" : undefined}>
                <td data-label="Title">
                  {card.title}
                  {isPriority && <span className="priority-badge">Priority</span>}
                </td>
                <td data-label="Impact Bullets">{card.impactBullets.join("; ")}</td>
                <td data-label="Amount">
                  ${card.amount} ({card.direction})
                </td>
                {session.phase === "mainGame" && <td>{renderMotionCell(card.id, "revenue")}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>

      <h2>Expenditure Cards</h2>
      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Impact Bullets</th>
            <th>Amount</th>
            {session.phase === "mainGame" && <th></th>}
          </tr>
        </thead>
        <tbody>
          {catalog.expenditureCards.map((card) => {
            const isPriority = isSelectedPriorityCard(catalog, commission, "expenditure", card.id);
            return (
              <tr key={card.id} className={isPriority ? "priority-card-row" : undefined}>
                <td data-label="Title">
                  {card.title}
                  {isPriority && <span className="priority-badge">Priority</span>}
                </td>
                <td data-label="Impact Bullets">{card.impactBullets.join("; ")}</td>
                <td data-label="Amount">
                  ${card.amount} ({card.direction})
                </td>
                {session.phase === "mainGame" && <td>{renderMotionCell(card.id, "expenditure")}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default CommissionerView;
