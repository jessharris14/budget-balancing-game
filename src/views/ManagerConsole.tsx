import { useEffect, useState } from "react";
import { getCatalog } from "../services/catalogService";
import {
  applyCard,
  applyChairFreeCard,
  applyChallengeToLedger,
  getReserveTier,
  isCardAvailable,
  reconsiderCard,
  type CardType,
} from "../services/ledgerService";
import type { CardCatalog } from "../types/catalog";
import type { Commission, Session } from "../types/session";
import "./session.css";
import "./ManagerConsole.css";

interface Props {
  code: string;
  session: Session;
  commissionId: string;
  commission: Commission;
}

const RESERVE_TIER_LABELS: Record<string, string> = {
  safe: "≥ $15 — on policy (+1)",
  neutral: "= $14 — neutral (0)",
  warning: "$10–$13 — below minimum (−1)",
  critical: "≤ $9 — critical (−2)",
};

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

  const { ledger } = commission;
  const reserveTier = getReserveTier(ledger.reserves);

  const activeChallengeCard = commission.activeChallenge
    ? catalog.challengeCards.find((c) => c.id === commission.activeChallenge?.cardId)
    : undefined;
  const challengeAlreadyApplied =
    !!commission.activeChallenge && commission.challengeLedgerAppliedAt === commission.activeChallenge.triggeredAt;

  const canUseFreeCard = session.phase === "mainGame" && !commission.chairFreeCardUsed;
  const dollarCards = [
    ...catalog.revenueCards
      .filter((c) => c.amount === 1 && isCardAvailable(commission, c.id))
      .map((c) => ({ type: "revenue" as CardType, id: c.id, title: c.title })),
    ...catalog.expenditureCards
      .filter((c) => c.amount === 1 && isCardAvailable(commission, c.id))
      .map((c) => ({ type: "expenditure" as CardType, id: c.id, title: c.title })),
  ];

  // Symmetric range around zero, generous enough that the marker never pins to an edge.
  const range = Math.max(20, Math.abs(ledger.deficitOrSurplus) + 5);
  const markerPercent = Math.min(100, Math.max(0, 50 + (ledger.deficitOrSurplus / range) * 50));

  return (
    <div className="session-view manager-console">
      <h1>Manager/Administrator Console — {code}</h1>
      <p>{commission.name ?? `Table ${commissionId} (unnamed)`}</p>

      <div className="ledger-summary">
        <div className="ledger-figure">
          <span className="ledger-figure__label">Revenue</span>
          <span className="ledger-figure__value">${ledger.revenue}</span>
        </div>
        <div className="ledger-figure">
          <span className="ledger-figure__label">Expenditures</span>
          <span className="ledger-figure__value">${ledger.expenditures}</span>
        </div>
        <div className="ledger-figure">
          <span className="ledger-figure__label">{ledger.deficitOrSurplus >= 0 ? "Surplus" : "Deficit"}</span>
          <span className={`ledger-figure__value ${ledger.deficitOrSurplus >= 0 ? "positive" : "negative"}`}>
            ${Math.abs(ledger.deficitOrSurplus)}
          </span>
        </div>
        <div className="ledger-figure">
          <span className="ledger-figure__label">Reserves</span>
          <span className={`ledger-figure__value reserve-tier-${reserveTier}`}>${ledger.reserves}</span>
        </div>
      </div>

      <div className="ledger-numberline">
        <div className="ledger-numberline__track">
          <div className="ledger-numberline__zero" />
          <div className="ledger-numberline__marker" style={{ left: `${markerPercent}%` }} />
        </div>
        <div className="ledger-numberline__caption">
          {ledger.deficitOrSurplus >= 0 ? "Surplus" : "Deficit"}: ${Math.abs(ledger.deficitOrSurplus)}
        </div>
      </div>

      <p className={`reserve-tier-note reserve-tier-${reserveTier}`}>
        Reserve tier: {RESERVE_TIER_LABELS[reserveTier]}
      </p>

      {error && <p className="error">{error}</p>}

      {commission.activeChallenge && activeChallengeCard && (
        <div className="lobby-commission">
          <h3>Active Challenge</h3>
          <p>{commission.activeChallenge.printedText}</p>
          <p>
            ${activeChallengeCard.amount} {activeChallengeCard.target} ({activeChallengeCard.direction})
          </p>
          {challengeAlreadyApplied ? (
            <p>Already applied to the ledger.</p>
          ) : (
            <button
              onClick={() =>
                runAction(activeChallengeCard.id, () =>
                  applyChallengeToLedger(code, commissionId, commission, activeChallengeCard),
                )
              }
              disabled={busyCardId === activeChallengeCard.id}
            >
              Apply to Ledger
            </button>
          )}
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
