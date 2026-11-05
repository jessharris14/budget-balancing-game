import { useState } from "react";
import { getChallengeNarrative } from "../services/challengePopupLogic";
import { challengeLedgerDelta, getChallengeLedgerEffect, type LedgerLine } from "../services/challengeLedgerEffect";
import type { CardCatalog } from "../types/catalog";
import type { Commission } from "../types/session";
import "./ManagerConsole.css";

interface Props {
  commission: Commission;
  catalog: CardCatalog;
}

const LEDGER_LINE_LABELS: Record<LedgerLine, string> = {
  revenue: "Revenue",
  expenditures: "Expenditures",
  reserves: "Reserves",
};

function formatSigned(delta: number): string {
  if (delta === 0) return "$0";
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
 * challengeCards for title/amount -- and getChallengeLedgerEffect
 * (challengeLedgerEffect.ts), the exact same mapping applyChallengeToLedger
 * itself applies, for which line each challenge hit and by how much.
 * Nothing here recomputes an effect independently.
 */
function AppliedChallengesPanel({ commission, catalog }: Props) {
  const [expanded, setExpanded] = useState(false);

  const entries = Object.entries(commission.challengesApplied ?? {})
    .map(([cardId, triggeredAt]) => ({ card: catalog.challengeCards.find((c) => c.id === cardId), triggeredAt }))
    .filter((e): e is { card: NonNullable<typeof e.card>; triggeredAt: number } => !!e.card)
    .sort((a, b) => a.triggeredAt - b.triggeredAt);

  if (entries.length === 0) return null;

  const mostRecent = entries[entries.length - 1];

  // Reconciling running total: how much this table's Revenue, Expenditures,
  // and Reserves have moved from Challenges alone, each kept on its own
  // line rather than folded into one number -- so it stays checkable
  // against the status bar rather than being its own, separate figure.
  const totals = entries.reduce(
    (acc, e) => {
      const delta = challengeLedgerDelta(getChallengeLedgerEffect(e.card));
      return {
        revenue: acc.revenue + delta.revenueDelta,
        expenditures: acc.expenditures + delta.expenditureDelta,
        reserves: acc.reserves + delta.reservesDelta,
      };
    },
    { revenue: 0, expenditures: 0, reserves: 0 },
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
              <th>Action</th>
              <th>Line</th>
              <th>Effect</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const effect = getChallengeLedgerEffect(e.card);
              const narrative = getChallengeNarrative(e.card);
              return (
                <tr key={e.card.id}>
                  <td data-label="Title">
                    {e.card.title}
                    {narrative && (
                      <>
                        <br />
                        <span className="applied-challenges-narrative">{narrative}</span>
                      </>
                    )}
                  </td>
                  <td data-label="Action">{effect.label}</td>
                  <td data-label="Line">{LEDGER_LINE_LABELS[effect.line]}</td>
                  <td data-label="Effect">{formatSigned(effect.amount)}</td>
                </tr>
              );
            })}
            <tr className="scorecard-total-row">
              <td data-label="Title">Running total</td>
              <td data-label="Action" colSpan={3}>
                Expenditures {formatSigned(totals.expenditures)} · Revenue {formatSigned(totals.revenue)} · Reserves{" "}
                {formatSigned(totals.reserves)}
              </td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

export default AppliedChallengesPanel;
