import { useEffect, useState } from "react";
import { getCatalog } from "../services/catalogService";
import {
  recordCommissionPriority,
  setChairHighlightedCard,
  startDebateTimer,
  stopDebateTimer,
} from "../services/chairService";
import { formatDuration, useCountdown } from "../hooks/useCountdown";
import DecisionsList from "./DecisionsList";
import LedgerStatusBar from "./LedgerStatusBar";
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
}

/**
 * Commissioner (and, if elected, Chair) view. Per spec Section 8a #2/#3:
 * Commissioners get the full Revenue/Expenditure catalog to browse
 * read-only (no apply/reconsider -- that stays exclusive to the
 * Manager/Administrator) plus the universal status bar and decisions log.
 * The Chair additionally gets two live controls -- highlighting a card as
 * "currently under debate" and running the debate timer -- but records no
 * vote outcome of any kind and doesn't gate the Manager/Administrator's own
 * apply/reconsider actions.
 */
function CommissionerView({ code, session, commissionId, commission, isMyChair }: Props) {
  const [catalog, setCatalog] = useState<CardCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string>("");
  const [busy, setBusy] = useState(false);

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

  if (error && !catalog) return <p className="session-view error">{error}</p>;
  if (!catalog) return <p className="session-view">Loading catalog…</p>;

  const highlightedCard = commission.chairHighlightedCardId
    ? (catalog.revenueCards.find((c) => c.id === commission.chairHighlightedCardId) ??
      catalog.expenditureCards.find((c) => c.id === commission.chairHighlightedCardId))
    : null;

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

  return (
    <div className="session-view manager-console">
      <h1>{isMyChair ? "Chair" : "Commissioner"} View — {code}</h1>
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

      {session.phase === "rankPriorities" && (
        <div className="lobby-commission">
          <h3>Rank Priorities</h3>
          {isMyChair ? (
            <div className="role-options">
              {catalog.priorityCards.map((card) => (
                <label key={card.id}>
                  <input
                    type="radio"
                    name="priority"
                    checked={commission.priority?.selectedCardId === card.id}
                    disabled={busy}
                    onChange={() => handleSelectPriority(card.id)}
                  />
                  {card.title} — {card.description}
                </label>
              ))}
            </div>
          ) : (
            <>
              <ul>
                {catalog.priorityCards.map((card) => (
                  <li key={card.id}>
                    {card.title} — {card.description}
                  </li>
                ))}
              </ul>
              <p>
                Selected:{" "}
                {commission.priority?.selectedCardId
                  ? (catalog.priorityCards.find((c) => c.id === commission.priority?.selectedCardId)?.title ??
                    commission.priority.selectedCardId)
                  : "not yet recorded by the Chair"}
              </p>
            </>
          )}
        </div>
      )}

      <LedgerStatusBar ledger={commission.ledger} publicTrustTally={commission.publicTrustTally} />

      {error && <p className="error">{error}</p>}

      {commission.activeChallenge && (
        <div className="lobby-commission">
          <h3>Active Challenge</h3>
          <p>{commission.activeChallenge.printedText}</p>
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

      <h2>Revenue Cards</h2>
      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Impact Bullets</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {catalog.revenueCards.map((card) => (
            <tr key={card.id}>
              <td>{card.title}</td>
              <td>{card.impactBullets.join("; ")}</td>
              <td>
                ${card.amount} ({card.direction})
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Expenditure Cards</h2>
      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Impact Bullets</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {catalog.expenditureCards.map((card) => (
            <tr key={card.id}>
              <td>{card.title}</td>
              <td>{card.impactBullets.join("; ")}</td>
              <td>
                ${card.amount} ({card.direction})
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default CommissionerView;
