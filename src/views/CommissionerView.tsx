import { useEffect, useState } from "react";
import { getCatalog } from "../services/catalogService";
import {
  recordCommissionPriority,
  setChairHighlightedCard,
  startDebateTimer,
  stopDebateTimer,
} from "../services/chairService";
import { isCardAvailable, isSelectedPriorityCard, type CardType } from "../services/ledgerService";
import { clearMotion, isMotionLocked, signalMotion, signalSecond } from "../services/motionService";
import { formatDuration, useCountdown } from "../hooks/useCountdown";
import BallotMeasuresList from "./BallotMeasuresList";
import DebriefScorecard from "./DebriefScorecard";
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
  // Chair. Unlike the original version of this effect, the motion itself
  // is NOT cleared here anymore: keeping it around (with movedBy/
  // secondedBy intact) through the whole debate is what lets the Card
  // Under Debate panel fold "Moved by X, seconded by Y" into its own
  // display instead of needing a second, separate Pending Motion panel to
  // stay visible alongside it (Change 1's duplicate-panel fix). The
  // motion is cleared later, at actual resolution -- Motion Passes
  // (applyCard), Motion Fails, or a Ballot Measure resolving either way --
  // not at promotion time. Only ever runs on the Chair's own client,
  // since chairHighlightedCardId is writable by the Chair (or the
  // Manager/Administrator) per RTDB rules, and only writes when the
  // highlight doesn't already match, so it can't fight a manual dropdown
  // change. A table that skips motion/second and highlights verbally
  // instead never produces a seconded motion, so this never interferes
  // with that fallback.
  useEffect(() => {
    if (!isMyChair) return;
    const activeMotion = commission.activeMotion;
    if (!activeMotion?.secondedBy) return;
    if (commission.chairHighlightedCardId === activeMotion.cardId) return;
    void setChairHighlightedCard(code, commissionId, activeMotion.cardId);
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
  const locked = isMotionLocked(commission);
  // The "Moved by X, seconded by Y" line folded into Card Under Debate
  // (Change 1): only once the motion that produced this specific
  // highlighted card has actually been seconded -- an unseconded motion
  // still gets its own Pending Motion panel below, and a table that
  // skips motion/second and highlights verbally has no motion to show at
  // all, so this line simply doesn't render for them.
  const showMotionProvenance = !!motion?.secondedBy && motion.cardId === commission.chairHighlightedCardId;

  async function handleHighlight(cardId: string) {
    setBusy(true);
    setError(null);
    try {
      await setChairHighlightedCard(code, commissionId, cardId || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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
    setError(null);
    try {
      const result = await signalMotion(code, commissionId, cardId, cardType);
      if (!result.ok) setError(result.reason ?? "Could not move to adopt that card.");
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

  /**
   * Phase 7 A3: resets a motion that moved but never got a second --
   * Chair-only, and only while unseconded (enforced both by the button's
   * own render condition below and, more importantly, by the activeMotion
   * RTDB rule itself). Replaces the old generic "Clear" button, which used
   * to be available to the mover too and at any seconded state; once
   * seconded, resolution is exclusively the Administrator's Motion
   * Passes/Fails now, so a manual clear option there would just be a
   * second, overlapping control.
   */
  async function handleResetUnsecondedMotion() {
    setBusy(true);
    try {
      if (isMyChair && motion && commission.chairHighlightedCardId === motion.cardId) {
        await setChairHighlightedCard(code, commissionId, null);
      }
      await clearMotion(code, commissionId);
    } finally {
      setBusy(false);
    }
  }

  /**
   * Shared Motion/Second cell for both catalog tables -- Main Game only,
   * and only for cards not already played or locked out. Change 1: "I
   * move to adopt" disappears from every OTHER card for every
   * Commissioner and the Chair for as long as isMotionLocked is true --
   * not just while a motion is pending unseconded (the original, too-
   * narrow A2 scope), but for the whole debate through Card Under Debate
   * and any Ballot Measure, until Motion Passes/Fails or the ballot
   * resolves. A table can only ever be debating one card at a time.
   */
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
    if (locked) return null;
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

      {session.phase === "debrief" ? (
        <DebriefScorecard commission={commission} catalog={catalog} speakerCount={speakerCount} />
      ) : (
        <>
          {session.phase === "mainGame" && (
            <PriorityTile priority={commission.priority} priorityCards={catalog.priorityCards} catalog={catalog} />
          )}
          <LedgerStatusBar ledger={commission.ledger} />
          <PublicTrustGauge publicTrustTally={commission.publicTrustTally} speakerCount={speakerCount} />
        </>
      )}

      {error && <p className="error">{error}</p>}

      {commission.activeChallenge && (
        <div className="lobby-commission">
          <h3>Active Challenge</h3>
          <p>{commission.activeChallenge.printedText}</p>
        </div>
      )}

      {/*
        Change 1: Pending Motion only shows while this motion hasn't been
        seconded yet -- once it has, Card Under Debate takes over as the
        single place showing this card, folding in who moved/seconded as
        one line, so the two panels never show the same thing twice.
      */}
      {session.phase === "mainGame" && motion && !motion.secondedBy && (
        <div className="lobby-commission">
          <h3>Pending Motion</h3>
          <p>
            {motionCard?.title ?? motion.cardId} — moved by {moverName}
          </p>
          <p>— awaiting second —</p>
          {motion.movedBy !== myUid && (
            <button onClick={handleSecond} disabled={busy}>
              Second
            </button>
          )}
          {isMyChair && (
            <>
              <p>No second? As Chair, you decide when to move on.</p>
              <button onClick={() => void handleResetUnsecondedMotion()} disabled={busy}>
                No Second — Reset Motion
              </button>
            </>
          )}
        </div>
      )}

      {session.phase !== "debrief" && (
        <div className="lobby-commission chair-highlight">
          <h3>Card Under Debate</h3>
          {isMyChair ? (
            <>
              <select
                value={selectedCardId}
                onChange={(e) => handleHighlight(e.target.value)}
                disabled={busy || locked}
              >
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
              {locked && <p>Debate in progress — resolve it (Motion Passes/Fails, or the Ballot Measure) before picking a different card.</p>}
              {showMotionProvenance && (
                <p>
                  Moved by {moverName}, seconded by {seconderName}
                </p>
              )}
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
              {showMotionProvenance && (
                <p>
                  Moved by {moverName}, seconded by {seconderName}
                </p>
              )}
              {debateMs !== null && <p>Debate timer: {formatDuration(debateMs)}</p>}
            </>
          )}
        </div>
      )}

      {session.phase !== "debrief" && (
        <>
          <DecisionsList commission={commission} catalog={catalog} />
          <BallotMeasuresList commission={commission} catalog={catalog} />
        </>
      )}

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
