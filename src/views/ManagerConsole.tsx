import { useEffect, useState } from "react";
import { getCatalog } from "../services/catalogService";
import { applyCard, applyChairFreeCard, isCardAvailable, reconsiderCard, type CardType } from "../services/ledgerService";
import { formatDuration, useCountdown } from "../hooks/useCountdown";
import DecisionsList from "./DecisionsList";
import LedgerStatusBar from "./LedgerStatusBar";
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

  const highlightedCard = commission.chairHighlightedCardId
    ? (catalog.revenueCards.find((c) => c.id === commission.chairHighlightedCardId) ??
      catalog.expenditureCards.find((c) => c.id === commission.chairHighlightedCardId))
    : null;

  const speakerCount = Object.values(session.publicHearingSpeakers ?? {}).filter(
    (s) => s.commissionId === commissionId,
  ).length;

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

      <LedgerStatusBar ledger={commission.ledger} />
      <PublicTrustGauge publicTrustTally={commission.publicTrustTally} speakerCount={speakerCount} />

      {error && <p className="error">{error}</p>}

      {commission.chairHighlightedCardId && (
        <div className="lobby-commission chair-highlight">
          <h3>Chair has highlighted: {highlightedCard?.title ?? commission.chairHighlightedCardId}</h3>
          {debateMs !== null && <p>Debate timer: {formatDuration(debateMs)}</p>}
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

      <DecisionsList commission={commission} catalog={catalog} />

      <h2>Revenue Cards</h2>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Title</th>
            <th>Impact Bullets</th>
            <th>Amount</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {catalog.revenueCards.map((card) => {
            const played = commission.cardsInPlay?.[card.id];
            const lockedOut = commission.cardsLockedOut?.[card.id];
            return (
              <tr key={card.id}>
                <td>{card.id}</td>
                <td>{card.title}</td>
                <td>{card.impactBullets.join("; ")}</td>
                <td>
                  ${card.amount} ({card.direction})
                </td>
                <td>{played ? "Played" : lockedOut ? "Locked out" : "Available"}</td>
                <td>
                  {played ? (
                    <button
                      onClick={() => runAction(card.id, () => reconsiderCard(code, commissionId, catalog, card.id))}
                      disabled={busyCardId === card.id}
                    >
                      Reconsider
                    </button>
                  ) : (
                    <button
                      onClick={() => runAction(card.id, () => applyCard(code, commissionId, catalog, "revenue", card.id))}
                      disabled={!!lockedOut || busyCardId === card.id}
                    >
                      Apply
                    </button>
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
            <th></th>
          </tr>
        </thead>
        <tbody>
          {catalog.expenditureCards.map((card) => {
            const played = commission.cardsInPlay?.[card.id];
            return (
              <tr key={card.id}>
                <td>{card.id}</td>
                <td>{card.title}</td>
                <td>{card.impactBullets.join("; ")}</td>
                <td>
                  ${card.amount} ({card.direction})
                </td>
                <td>{played ? "Played" : "Available"}</td>
                <td>
                  {played ? (
                    <button
                      onClick={() => runAction(card.id, () => reconsiderCard(code, commissionId, catalog, card.id))}
                      disabled={busyCardId === card.id}
                    >
                      Reconsider
                    </button>
                  ) : (
                    <button
                      onClick={() => runAction(card.id, () => applyCard(code, commissionId, catalog, "expenditure", card.id))}
                      disabled={busyCardId === card.id}
                    >
                      Apply
                    </button>
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
