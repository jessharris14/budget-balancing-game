import { getChallengeLedgerEffect } from "../services/challengeLedgerEffect";
import { ROLE_ICON, uiIconUrl } from "../services/icons";
import { computeFinalScore } from "../services/scoringService";
import BalanceStatusDisplay from "./BalanceStatusDisplay";
import BudgetEffectLabel from "./BudgetEffectLabel";
import CardIcon from "./CardIcon";
import DecisionsList from "./DecisionsList";
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

function SeatCheck() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}

/**
 * Design step 2: one table card for the Facilitator Console's "Tables"
 * grid, restyled to the approved mockup -- a 6px top edge (green in
 * surplus/balanced, red in deficit), name + sign-aware Deficit/Surplus
 * pill, four tiles (Revenue/Expenditures/Reserves/Points if ended now),
 * a disconnect-warning row, seat chips, the Challenges-applied list, the
 * Push button, and a collapsible Details section -- same content and
 * write paths as before this round, just restyled. "Points if the game
 * ended now" calls computeFinalScore (scoringService.ts) directly on this
 * Commission's LIVE ledger/priority/publicTrustTally -- the exact same
 * function the Debrief scorecard uses, not a second copy of the scoring
 * rules.
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
  const liveScore = computeFinalScore(commission.ledger, commission.priority, commission.publicTrustTally);
  const isDeficit = commission.ledger.deficitOrSurplus < 0;

  const chairName = members.chairId ? (session.participants[members.chairId]?.name ?? members.chairId) : null;
  const adminName = members.managerAdminId ? (session.participants[members.managerAdminId]?.name ?? members.managerAdminId) : null;

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
    <div className={`tc${isDeficit ? " def" : ""}`}>
      <div className="hd">
        <h3>{commission.name ?? `Table ${commissionId} (unnamed)`}</h3>
        <BalanceStatusDisplay deficitOrSurplus={commission.ledger.deficitOrSurplus} size="pill" />
      </div>

      <div className="tiles4">
        <div className="t4" style={{ background: "var(--lb-rev-tint)" }}>
          <div className="l">
            <img src={uiIconUrl("revenue")} alt="" />
            Revenue
          </div>
          <b>${commission.ledger.revenue.toLocaleString()}</b>
        </div>
        <div className="t4" style={{ background: "var(--lb-exp-tint)" }}>
          <div className="l">
            <img src={uiIconUrl("expenditures")} alt="" />
            Expenditures
          </div>
          <b>${commission.ledger.expenditures.toLocaleString()}</b>
        </div>
        <div className="t4">
          <div className="l">
            <img src={uiIconUrl("reserves")} alt="" />
            Reserves
          </div>
          <b style={{ color: "var(--lb-forest)" }}>${commission.ledger.reserves.toLocaleString()}</b>
        </div>
        <div className="t4">
          <div className="l">Points if ended now</div>
          <b>{liveScore.total}</b>
        </div>
      </div>

      {disconnectedNames.length > 0 && (
        <div className="warn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3l10 18H2L12 3zM12 10v5M12 18h.01" />
          </svg>
          Currently disconnected: {disconnectedNames.join(", ")}
        </div>
      )}

      <div className="seats">
        <span className="seat">
          <img src={ROLE_ICON.managerAdmin} alt="" />
          {adminName ?? "Admin: open"}
          <span className={members.managerAdminId ? "ok" : "no"}>{members.managerAdminId && <SeatCheck />}</span>
        </span>
        <span className="seat">
          <img src={ROLE_ICON.commissioner} alt="" />
          {chairName ? `Chair: ${chairName}` : "Chair: open"}
          <span className={members.chairId ? "ok" : "no"}>{members.chairId && <SeatCheck />}</span>
        </span>
        <span className="seat">
          <img src={ROLE_ICON.commissioner} alt="" />
          {commissionerCount} Commissioner{commissionerCount === 1 ? "" : "s"}
        </span>
        <span className="seat">
          <img src={ROLE_ICON.publicHearingSpeaker} alt="" />
          {speakers.length} Speaker{speakers.length === 1 ? "" : "s"}
        </span>
      </div>

      <div>
        <span className="eyebrow">Challenges applied</span>
        {challengeEntries.length === 0 ? (
          <ul className="cl" style={{ marginTop: 8 }}>
            <li style={{ background: "none", color: "var(--lb-muted)", padding: "0" }}>None yet.</li>
          </ul>
        ) : (
          <ul className="cl" style={{ marginTop: 8 }}>
            {challengeEntries.map((e) => (
              <li key={e.card.id}>
                <CardIcon cardId={e.card.id} cardType="challenge" />
                <span>{e.card.title}</span>
                <span className="fx">
                  <BudgetEffectLabel label={getChallengeLedgerEffect(e.card).label} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {session.phase === "mainGame" && (
        <div className="acts">
          <button type="button" className="btn primary sm" onClick={() => onPushChallenge(commissionId)} disabled={!selectedChallengeId || pushing}>
            {pushing ? "Pushing…" : `Push selected challenge to ${commission.name ?? "this table"}`}
          </button>
          {pushNotice && <span style={{ color: "var(--lb-forest)", fontWeight: 700, fontSize: 13 }}>✅ {pushNotice}</span>}
        </div>
      )}

      <details>
        <summary className="dt">
          <span>Details: Public Trust, Priority, Decisions So Far, Speakers</span>
          <span aria-hidden="true">▾</span>
        </summary>
        <div className="details-body">
          <PublicTrustGauge publicTrustTally={commission.publicTrustTally} speakerCount={speakers.length} />
          {catalog && session.phase === "mainGame" && (
            <PriorityTile priority={commission.priority} priorityCards={catalog.priorityCards} catalog={catalog} />
          )}
          {session.phase === "rankPriorities" && catalog && (
            <p style={{ margin: 0 }}>
              Priority selected:{" "}
              {commission.priority?.selectedCardId
                ? (catalog.priorityCards.find((c) => c.id === commission.priority?.selectedCardId)?.title ??
                  commission.priority.selectedCardId)
                : "not yet recorded by the Chair"}
            </p>
          )}
          <p style={{ margin: 0, fontWeight: 700 }}>Decisions made: {decisionsCount}</p>
          {catalog && <DecisionsList commission={commission} catalog={catalog} />}

          <div>
            <h4 style={{ marginBottom: 8 }}>Public Hearing Speakers</h4>
            {speakers.length === 0 && <p style={{ margin: 0 }}>None yet.</p>}
            <ul style={{ display: "flex", flexDirection: "column", gap: 8, listStyle: "none", padding: 0, margin: 0 }}>
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
                  <button type="button" className="btn ghost sm" onClick={() => onReroll(speaker.id, speaker.rerollCount)} disabled={!catalog || rerollingUid === speaker.id}>
                    {rerollingUid === speaker.id ? "Rerolling…" : "Reroll prompt"}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </details>
    </div>
  );
}

export default FacilitatorTableCard;
