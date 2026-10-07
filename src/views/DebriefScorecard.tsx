import AppliedChallengesPanel from "./AppliedChallengesPanel";
import BallotMeasuresList from "./BallotMeasuresList";
import DecisionsList from "./DecisionsList";
import LedgerStatusBar from "./LedgerStatusBar";
import PublicTrustGauge from "./PublicTrustGauge";
import type { CardCatalog } from "../types/catalog";
import type { Commission } from "../types/session";
import "./ManagerConsole.css";

interface Props {
  commission: Commission;
  catalog: CardCatalog;
  /** For the Public Trust gauge's scale, same as everywhere else it's used. */
  speakerCount: number;
}

function pointsLabel(points: number): string {
  return points >= 0 ? `+${points}` : `${points}`;
}

/**
 * Final per-Commission Scorecard (spec Section 6 / Phase 7 B3), replacing
 * the paper Tally Sheet. Visible to every role at that Commission's
 * table once the session reaches Debrief and finalScore has been
 * computed (see computeAndStoreFinalScores). Reuses LedgerStatusBar,
 * PublicTrustGauge, DecisionsList and BallotMeasuresList rather than
 * re-displaying any of those figures from scratch -- the story of the
 * game (every decision, reversed or not, and every Ballot Measure's
 * outcome) is already exactly what those components show; Ballot votes
 * stay anonymous here the same way BallotMeasuresList already presents
 * them everywhere else -- only the final yes/no counts, never who voted
 * how.
 */
function DebriefScorecard({ commission, catalog, speakerCount }: Props) {
  const score = commission.finalScore;
  if (!score) {
    return (
      <div className="lobby-commission">
        <h2>Final Scorecard{commission.name ? `: ${commission.name}` : ""}</h2>
        <p>Scoring not yet computed.</p>
      </div>
    );
  }

  const priorityCard = commission.priority?.selectedCardId
    ? catalog.priorityCards.find((p) => p.id === commission.priority.selectedCardId)
    : null;

  return (
    <div className="lobby-commission debrief-scorecard">
      <h2>Final Scorecard{commission.name ? `: ${commission.name}` : ""}</h2>

      <table className="scorecard-table">
        <thead>
          <tr>
            <th>Dimension</th>
            <th>Points</th>
            <th>Why</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td data-label="Dimension">Balanced Budget</td>
            <td data-label="Points">{pointsLabel(score.balanced.points)}</td>
            <td data-label="Why">{score.balanced.reason}</td>
          </tr>
          <tr>
            <td data-label="Dimension">Priority Funded</td>
            <td data-label="Points">{pointsLabel(score.priorityFunded.points)}</td>
            <td data-label="Why">{score.priorityFunded.reason}</td>
          </tr>
          <tr>
            <td data-label="Dimension">Reserves</td>
            <td data-label="Points">{pointsLabel(score.reserves.points)}</td>
            <td data-label="Why">{score.reserves.reason}</td>
          </tr>
          <tr>
            <td data-label="Dimension">Public Trust</td>
            <td data-label="Points">{pointsLabel(score.publicTrust.points)}</td>
            <td data-label="Why">{score.publicTrust.reason}</td>
          </tr>
          <tr className="scorecard-total-row">
            <td data-label="Dimension">Total</td>
            <td data-label="Points" colSpan={2}>
              {score.total} (max 4)
            </td>
          </tr>
        </tbody>
      </table>

      <LedgerStatusBar ledger={commission.ledger} />
      <PublicTrustGauge publicTrustTally={commission.publicTrustTally} speakerCount={speakerCount} />

      <p>
        Priority: <strong>{priorityCard?.title ?? commission.priority?.selectedCardId ?? "none selected"}</strong> —{" "}
        {commission.priority?.funded ? "Funded" : "Not funded"}
      </p>

      <AppliedChallengesPanel commission={commission} catalog={catalog} />

      <DecisionsList commission={commission} catalog={catalog} />
      <BallotMeasuresList commission={commission} catalog={catalog} />
    </div>
  );
}

export default DebriefScorecard;
