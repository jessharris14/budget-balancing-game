import { getChallengeLedgerEffect } from "../services/challengeLedgerEffect";
import { getReserveTier } from "../services/ledgerService";
import { computeFinalScore } from "../services/scoringService";
import BalanceStatusDisplay from "./BalanceStatusDisplay";
import BudgetEffectLabel from "./BudgetEffectLabel";
import DecisionsList from "./DecisionsList";
import { RESERVE_TIER_LABELS } from "./LedgerStatusBar";
import PriorityTile from "./PriorityTile";
import PublicTrustGauge from "./PublicTrustGauge";
import type { CardCatalog } from "../types/catalog";
import type { Commission, Session, Speaker } from "../types/session";
import "./ManagerConsole.css";
import "./FacilitatorConsole.css";

interface Props {
  commissionId: string;
  commission: Commission;
  session: Session;
  catalog: CardCatalog | null;
  speakers: Speaker[];
  selectedChallengeId: string | null;
  pushing: boolean;
  pushNotice: string | null;
  onPushChallenge: (commissionId: string) => void;
  rerollingUid: string | null;
  onReroll: (speakerUid: string, currentRerollCount: number) => void;
}

/**
 * Phase 9a: one compact table card for the Facilitator Console's "Tables"
 * dashboard -- deliberately only the figures a Facilitator needs at a
 * glance while running the game (balance, reserves, live points, the
 * challenges already applied here, and seat occupancy), with everything
 * else folded into a closed-by-default <details> so nothing from the old
 * single-column layout is lost, just no longer always on screen. "Points
 * if the game ended now" calls computeFinalScore (scoringService.ts)
 * directly on this Commission's LIVE ledger/priority/publicTrustTally --
 * the exact same function the Debrief scorecard uses, not a second copy
 * of the scoring rules -- so it's simply what the real final score would
 * already be if nothing else happened; it naturally becomes the actual
 * final score once the game is really over, since nothing can change
 * those three inputs after that point anyway.
 */
function FacilitatorTableCard({
  commissionId,
  commission,
  session,
  catalog,
  speakers,
  selectedChallengeId,
  pushing,
  pushNotice,
  onPushChallenge,
  rerollingUid,
  onReroll,
}: Props) {
  const members = commission.members ?? { managerAdminId: null, chairId: null, commissionerIds: {} };
  const commissionerCount = Object.keys(members.commissionerIds ?? {}).length;
  const reserveTier = getReserveTier(commission.ledger.reserves);
  const liveScore = computeFinalScore(commission.ledger, commission.priority, commission.publicTrustTally);

  const challengeEntries = Object.entries(commission.challengesApplied ?? {})
    .map(([cardId, triggeredAt]) => ({ card: catalog?.challengeCards.find((c) => c.id === cardId), triggeredAt }))
    .filter((e): e is { card: NonNullable<typeof e.card>; triggeredAt: number } => !!e.card)
    .sort((a, b) => a.triggeredAt - b.triggeredAt);

  const decisionsCount = Object.keys(commission.decisionsLog ?? {}).length;

  const tableUids = [
    ...(members.managerAdminId ? [members.managerAdminId] : []),
    ...(members.chairId ? [members.chairId] : []),
    ...Object.keys(members.commissionerIds ?? {}),
    ...speakers.map((s) => s.id),
  ];
  const disconnectedNames = tableUids
    .filter((uid) => !session.presence?.[uid])
    .map((uid) => session.participants[uid]?.name ?? uid);

  return (
    <div className="facilitator-table-card">
      <div className="facilitator-table-card__header">
        <h3>{commission.name ?? `Table ${commissionId} (unnamed)`}</h3>
        <BalanceStatusDisplay deficitOrSurplus={commission.ledger.deficitOrSurplus} size="large" />
      </div>

      <div className="facilitator-table-card__stats">
        <div className={`facilitator-table-card__stat reserve-tier-${reserveTier}`}>
          <span className="facilitator-table-card__stat-label">Reserves</span>
          <span className="facilitator-table-card__stat-value">${commission.ledger.reserves.toLocaleString()}</span>
          <span className="facilitator-table-card__stat-note">{RESERVE_TIER_LABELS[reserveTier]}</span>
        </div>
        <div className="facilitator-table-card__stat">
          <span className="facilitator-table-card__stat-label">Points if the game ended now</span>
          <span className="facilitator-table-card__stat-value">{liveScore.total}</span>
        </div>
      </div>

      {disconnectedNames.length > 0 && (
        <p className="error">⚠️ Currently disconnected: {disconnectedNames.join(", ")}</p>
      )}

      <div className="facilitator-table-card__challenges">
        <strong>Challenges applied:</strong>
        {challengeEntries.length === 0 ? (
          <span> None yet.</span>
        ) : (
          <ul>
            {challengeEntries.map((e) => (
              <li key={e.card.id}>
                {e.card.title} — <BudgetEffectLabel label={getChallengeLedgerEffect(e.card).label} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="facilitator-table-card__seats">
        Seats: Administrator {members.managerAdminId ? "✅" : "— open —"} · Chair {members.chairId ? "✅" : "— open —"} ·{" "}
        {commissionerCount} Commissioner{commissionerCount === 1 ? "" : "s"} · {speakers.length} Speaker
        {speakers.length === 1 ? "" : "s"}
      </p>

      {session.phase === "mainGame" && (
        <div className="facilitator-table-card__push">
          <button onClick={() => onPushChallenge(commissionId)} disabled={!selectedChallengeId || pushing}>
            {pushing ? "Pushing…" : "Push selected challenge to this table"}
          </button>
          {pushNotice && <span className="facilitator-table-card__push-notice">✅ {pushNotice}</span>}
        </div>
      )}

      <details className="facilitator-table-card__details">
        <summary>Details</summary>
        <PublicTrustGauge publicTrustTally={commission.publicTrustTally} speakerCount={speakers.length} />
        {catalog && session.phase === "mainGame" && (
          <PriorityTile priority={commission.priority} priorityCards={catalog.priorityCards} catalog={catalog} />
        )}
        {session.phase === "rankPriorities" && catalog && (
          <p>
            Priority selected:{" "}
            {commission.priority?.selectedCardId
              ? (catalog.priorityCards.find((c) => c.id === commission.priority?.selectedCardId)?.title ??
                commission.priority.selectedCardId)
              : "not yet recorded by the Chair"}
          </p>
        )}
        <p>Decisions made: {decisionsCount}</p>
        {catalog && <DecisionsList commission={commission} catalog={catalog} />}

        <h4>Public Hearing Speakers</h4>
        {speakers.length === 0 && <p>None yet.</p>}
        <ul>
          {speakers.map((speaker) => (
            <li key={speaker.id}>
              {speaker.name}
              {catalog && (
                <>
                  {" "}
                  — prompt{speaker.assignedPrompts.length > 1 ? "s" : ""}:{" "}
                  {speaker.assignedPrompts.map((id) => catalog.promptBank.find((p) => p.id === id)?.text ?? id).join(" / ")}
                </>
              )}
              {speaker.rerollCount > 0 && ` (rerolled ${speaker.rerollCount}×)`}{" "}
              <button onClick={() => onReroll(speaker.id, speaker.rerollCount)} disabled={!catalog || rerollingUid === speaker.id}>
                {rerollingUid === speaker.id ? "Rerolling…" : "Reroll prompt"}
              </button>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

export default FacilitatorTableCard;
