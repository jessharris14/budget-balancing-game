import type { Commission, Session } from "../types/session";
import "./ManagerConsole.css";

interface Props {
  session: Session;
}

function pointsLabel(points: number): string {
  return points >= 0 ? `+${points}` : `${points}`;
}

/**
 * Phase 7 B4: Facilitator-only comparison across every Commission that
 * played, sorted by total score. Ties share a rank rather than being
 * arbitrarily broken by insertion order -- two Commissions both scoring
 * 2 are both "rank 1," the next distinct (lower) total is "rank 3," not
 * "rank 2," matching how ties are conventionally shown on a leaderboard.
 */
function ScoreComparisonTable({ session }: Props) {
  const entries = Object.entries(session.commissions ?? {}).filter(
    (entry): entry is [string, Commission & { finalScore: NonNullable<Commission["finalScore"]> }] =>
      entry[1].finalScore != null,
  );

  const sorted = [...entries].sort((a, b) => b[1].finalScore.total - a[1].finalScore.total);

  let rank = 0;
  let lastTotal: number | null = null;
  const ranked = sorted.map(([id, commission], idx) => {
    if (commission.finalScore.total !== lastTotal) {
      rank = idx + 1;
      lastTotal = commission.finalScore.total;
    }
    return { id, commission, rank };
  });

  return (
    <div className="lobby-commission">
      <h2>Commission Comparison</h2>
      <table className="comparison-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Commission</th>
            <th>Balanced</th>
            <th>Priority</th>
            <th>Reserves</th>
            <th>Public Trust</th>
            <th>Total</th>
            <th>Decisions</th>
            <th>Final Deficit/Surplus</th>
            <th>Final Reserves</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map(({ id, commission, rank }) => (
            <tr key={id}>
              <td data-label="Rank">{rank}</td>
              <td data-label="Commission">{commission.name ?? `Table ${id}`}</td>
              <td data-label="Balanced">{pointsLabel(commission.finalScore.balanced.points)}</td>
              <td data-label="Priority">{pointsLabel(commission.finalScore.priorityFunded.points)}</td>
              <td data-label="Reserves">{pointsLabel(commission.finalScore.reserves.points)}</td>
              <td data-label="Public Trust">{pointsLabel(commission.finalScore.publicTrust.points)}</td>
              <td data-label="Total">
                <strong>{commission.finalScore.total}</strong>
              </td>
              <td data-label="Decisions">{Object.keys(commission.decisionsLog ?? {}).length}</td>
              <td data-label="Final Deficit/Surplus">${commission.ledger.deficitOrSurplus}</td>
              <td data-label="Final Reserves">${commission.ledger.reserves}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default ScoreComparisonTable;
