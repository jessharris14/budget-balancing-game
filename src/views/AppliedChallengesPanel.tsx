import { useState } from "react";
import { computeChallengeDeltas } from "../services/ledgerService";
import type { CardCatalog } from "../types/catalog";
import type { Commission } from "../types/session";
import "./ManagerConsole.css";

interface Props {
  commission: Commission;
  catalog: CardCatalog;
}

function formatDelta(delta: number): string {
  if (delta === 0) return "—";
  return delta > 0 ? `+$${delta}` : `-$${Math.abs(delta)}`;
}

/**
 * Change 2: read-only "Applied Challenges" panel shown to every
 * non-Facilitator role (Commissioner, Chair, Manager/Administrator,
 * Speaker, and the Debrief Scorecard) wherever the old single-challenge
 * "Active Challenge" panel used to appear. Challenges auto-apply
 * instantly and can never be changed or undone once triggered, so
 * "active" was misleading -- there's nothing active about a Challenge
 * once it's landed, only a permanent record of it. The Facilitator's own
 * console does NOT use this component: it still triggers Challenges, so
 * it keeps its own "Challenges Triggered" wording and controls.
 *
 * Sourced entirely from commission.challengesApplied (card id -> the
 * server timestamp it was triggered at) joined against the catalog's own
 * challengeCards for title/amount/direction/target -- and
 * computeChallengeDeltas (ledgerService.ts), the exact same pure function
 * applyChallengeToLedger itself uses, for the dollar math. Nothing here
 * recomputes an effect independently.
 */
function AppliedChallengesPanel({ commission, catalog }: Props) {
  const [expanded, setExpanded] = useState(false);

  const entries = Object.entries(commission.challengesApplied ?? {})
    .map(([cardId, triggeredAt]) => ({ card: catalog.challengeCards.find((c) => c.id === cardId), triggeredAt }))
    .filter((e): e is { card: NonNullable<typeof e.card>; triggeredAt: number } => !!e.card)
    .sort((a, b) => a.triggeredAt - b.triggeredAt);

  if (entries.length === 0) return null;

  const mostRecent = entries[entries.length - 1];

  const totals = entries.reduce(
    (acc, e) => {
      const { reservesDelta, deficitDelta } = computeChallengeDeltas(e.card);
      return { reserves: acc.reserves + reservesDelta, deficit: acc.deficit + deficitDelta };
    },
    { reserves: 0, deficit: 0 },
  );

  return (
    <div className="lobby-commission">
      <h3>Applied Challenges</h3>
      <p>{mostRecent.card.printedText}</p>
      <p>Applied to the ledger automatically when triggered -- Challenges can't be debated or declined.</p>
      {entries.length > 1 && (
        <button onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Hide" : `Show all ${entries.length} challenges`}
        </button>
      )}
      {expanded && (
        <table className="applied-challenges-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Amount</th>
              <th>Hit</th>
              <th>Effect</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const { reservesDelta, deficitDelta } = computeChallengeDeltas(e.card);
              return (
                <tr key={e.card.id}>
                  <td data-label="Title">{e.card.title}</td>
                  <td data-label="Amount">
                    ${e.card.amount} ({e.card.direction})
                  </td>
                  <td data-label="Hit">{e.card.target === "reserves" ? "Reserves" : "Deficit"}</td>
                  <td data-label="Effect">
                    {e.card.target === "reserves" ? formatDelta(reservesDelta) : formatDelta(deficitDelta)}
                  </td>
                </tr>
              );
            })}
            <tr className="scorecard-total-row">
              <td data-label="Title">Running total</td>
              <td data-label="Amount" colSpan={2}>
                Deficit/Surplus {formatDelta(totals.deficit)}
              </td>
              <td data-label="Effect">Reserves {formatDelta(totals.reserves)}</td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

export default AppliedChallengesPanel;
