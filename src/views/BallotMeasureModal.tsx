import { useState } from "react";
import { cancelBallotMeasure, closeBallotMeasure, openBallotMeasure } from "../services/ballotService";
import type { CardCatalog, ExpenditureCard, RevenueCard } from "../types/catalog";
import type { BallotMeasure } from "../types/session";
import "./ManagerConsole.css";

interface Props {
  code: string;
  commissionId: string;
  catalog: CardCatalog;
  card: RevenueCard | ExpenditureCard | undefined;
  ballot: BallotMeasure;
  onDismiss: () => void;
}

/**
 * The Administrator's "Run the Election" modal (spec: Ballot Measure flow
 * for millage-rate cards). Every branch is driven entirely by the ballot
 * record itself, not local-only state, so it's resilient to a refresh or
 * reconnect mid-ballot:
 * - openedAt/closedAt both null: pending -- explain the measure, then
 *   either open voting or cancel (nothing happened yet, so cancel just
 *   deletes it).
 * - openedAt set, closedAt null: open -- Speakers can vote; only the
 *   total number who've voted is shown here, not the yes/no split, to
 *   keep the room's in-progress vote private the way a real ballot would
 *   be. Close tallies and resolves it.
 * - closedAt set, outcome null: resolution hit an error applying a passed
 *   measure (see closeBallotMeasure) -- offer a retry rather than
 *   silently losing the failure.
 * - outcome set: final result.
 */
function BallotMeasureModal({ code, commissionId, catalog, card, ballot, onDismiss }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pending = ballot.openedAt == null && ballot.closedAt == null;
  const open = ballot.openedAt != null && ballot.closedAt == null;
  const needsRetry = ballot.closedAt != null && ballot.outcome == null;
  const resolved = ballot.outcome != null;
  const voteCount = Object.keys(ballot.votes ?? {}).length;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleClose() {
    setBusy(true);
    setError(null);
    try {
      const result = await closeBallotMeasure(code, commissionId, catalog, ballot);
      if (!result.ok) setError(result.reason ?? "Could not apply the passed measure.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ballot-modal-backdrop">
      <div className="ballot-modal">
        <h2>Run the Election{card ? `: ${card.title}` : ""}</h2>
        {card && (
          <>
            <ul>
              {card.impactBullets.map((bullet, idx) => (
                <li key={idx}>{bullet}</li>
              ))}
            </ul>
            <p>
              ${card.amount} ({card.direction})
            </p>
          </>
        )}

        {resolved && (
          <div className={`ballot-result ballot-result-${ballot.outcome}`}>
            <p className="ballot-result-tally">
              Yes: {Object.values(ballot.votes ?? {}).filter((v) => v === "yes").length} — No:{" "}
              {Object.values(ballot.votes ?? {}).filter((v) => v === "no").length}
            </p>
            <p className="ballot-result-outcome">
              {ballot.outcome === "passed" ? "✅ Measure Passed" : "❌ Measure Failed"}
            </p>
            <button onClick={onDismiss}>Done</button>
          </div>
        )}

        {!resolved && needsRetry && (
          <>
            <p className="error">Voting closed, but applying the passed measure failed. You can safely retry.</p>
            <button onClick={handleClose} disabled={busy}>
              Retry
            </button>
          </>
        )}

        {!resolved && !needsRetry && pending && (
          <>
            <p>Explain the ballot measure to the room, then open voting to Public Hearing Speakers.</p>
            <div className="chair-timer-controls">
              <button onClick={() => run(() => openBallotMeasure(code, commissionId, ballot.id))} disabled={busy}>
                Open Voting to Speakers
              </button>
              <button onClick={() => run(() => cancelBallotMeasure(code, commissionId, ballot.id))} disabled={busy}>
                Cancel
              </button>
            </div>
          </>
        )}

        {!resolved && !needsRetry && open && (
          <>
            <p>
              Voting is open. {voteCount} Speaker{voteCount === 1 ? "" : "s"} {voteCount === 1 ? "has" : "have"} voted so
              far.
            </p>
            <button onClick={handleClose} disabled={busy}>
              Close Ballot &amp; Tally Votes
            </button>
          </>
        )}

        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}

export default BallotMeasureModal;
