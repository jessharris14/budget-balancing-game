import { useState } from "react";
import { getChallengeNarrative } from "../services/challengePopupLogic";
import { challengeLedgerDelta, getChallengeLedgerEffect, type LedgerLine } from "../services/challengeLedgerEffect";
import BudgetEffectLabel from "./BudgetEffectLabel";
import CardIcon from "./CardIcon";
import type { CardCatalog } from "../types/catalog";
import type { Commission } from "../types/session";
import "./lb-components.css";

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
 * Speaker, and the Debrief Scorecard). Challenges auto-apply instantly
 * and can never be changed or undone once triggered, so "active" was
 * misleading -- there's nothing active about a Challenge once it's
 * landed, only a permanent record of it.
 *
 * Sourced entirely from commission.challengesApplied joined against the
 * catalog's own challengeCards, same as before this round -- design step
 * 1 only restyled the look.
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
    <div className="panel">
      <h3>Applied Challenges</h3>
      <p>{mostRecent.card.printedText}</p>
      <p style={{ fontSize: "13px", color: "var(--lb-muted)" }}>Applied to the ledger automatically when triggered -- Challenges can't be debated or declined.</p>
      {entries.length > 1 && (
        <button type="button" className="btn ghost sm" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Hide" : `Show all ${entries.length} challenges`}
        </button>
      )}
      {expanded && (
        <div className="rows">
          {entries.map((e) => {
            const effect = getChallengeLedgerEffect(e.card);
            const narrative = getChallengeNarrative(e.card);
            return (
              <div className="rowi" key={e.card.id}>
                <CardIcon cardId={e.card.id} cardType="challenge" />
                <div className="tt">
                  <b>{e.card.title}</b>
                  {narrative && <span style={{ fontStyle: "italic", fontSize: "12px", color: "var(--lb-muted)" }}>{narrative}</span>}
                  <BudgetEffectLabel label={effect.label} />
                </div>
                <span style={{ fontSize: "13px", color: "var(--lb-muted)" }}>
                  {LEDGER_LINE_LABELS[effect.line]} {formatSigned(effect.amount)}
                </span>
              </div>
            );
          })}
          <p style={{ fontWeight: 700, fontSize: "13px", marginTop: "0.5rem" }}>
            Running total: Expenditures {formatSigned(totals.expenditures)} · Revenue {formatSigned(totals.revenue)} · Reserves {formatSigned(totals.reserves)}
          </p>
        </div>
      )}
    </div>
  );
}

export default AppliedChallengesPanel;
