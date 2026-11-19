import { useEffect, useState } from "react";
import { buildCommissionActivity } from "../services/activityFeed";
import { castBallotVote, getMyBallotVote } from "../services/ballotService";
import { getCatalog } from "../services/catalogService";
import { getCardLedgerLabel } from "../services/challengeLedgerEffect";
import { castEndorsement } from "../services/speakerService";
import { formatDuration, useCountdown } from "../hooks/useCountdown";
import AppliedChallengesPanel from "./AppliedChallengesPanel";
import BallotMeasuresList from "./BallotMeasuresList";
import CardUnderDebateBar from "./CardUnderDebateBar";
import CompactCardStatusList from "./CompactCardStatusList";
import DebriefScorecard from "./DebriefScorecard";
import LedgerStatusBar from "./LedgerStatusBar";
import PriorityTile from "./PriorityTile";
import PublicTrustGauge from "./PublicTrustGauge";
import RoleHeaderBar from "./RoleHeaderBar";
import type { CardCatalog } from "../types/catalog";
import { SESSION_PHASE_LABELS, type Session, type Speaker } from "../types/session";
import "./lb-components.css";

interface Props {
  code: string;
  session: Session;
  speaker: Speaker;
}

const MAX_ENDORSEMENTS = 3;

/**
 * Public Hearing Speaker view. Per spec Section 8a #7: shows the Speaker's
 * assigned prompt(s) and their 3 lifetime Endorse/Oppose actions (permanent
 * once cast, usable any time during Main Game, not tied to a specific
 * card). Each Speaker picks one Commission/table to watch at join, same as
 * a Commissioner, so this shows just that one Commission's status bar and
 * decisions log -- endorsements only ever affect that table's Public Trust.
 *
 * Design step 1: restyled to the approved look. The full Revenue/
 * Expenditure Cards section (Swipe/List) is deliberately NOT added here --
 * see the delivery notes for why: it would show a Speaker cards they
 * can't currently see at all (Available/Locked out), which is more than a
 * reskin. CompactCardStatusList keeps its exact existing scope (only
 * cards with something to report), just restyled with the same chips.
 */
function SpeakerView({ code, session, speaker }: Props) {
  const [catalog, setCatalog] = useState<CardCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [casting, setCasting] = useState(false);
  const [castError, setCastError] = useState<string | null>(null);
  const [voting, setVoting] = useState(false);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [myVote, setMyVote] = useState<"yes" | "no" | null>(null);

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

  // Phase 8.1: my own vote now lives in the voter-only-readable
  // ballotVotes tree, not in the (now aggregate-only) ballot itself, so
  // it's fetched directly rather than read off session state. Re-fetches
  // whenever a different ballot becomes active for this Commission.
  const activeBallotId = session.commissions[speaker.commissionId]?.activeBallotId ?? null;
  useEffect(() => {
    setMyVote(null);
    if (!activeBallotId) return;
    void getMyBallotVote(code, speaker.commissionId, activeBallotId, speaker.id).then(setMyVote);
  }, [code, speaker.commissionId, speaker.id, activeBallotId]);

  const clock = session.clock ?? { phaseTimer: null, mainGameTimer: null, nextChallengeDue: null };
  const mainGameMs = useCountdown(clock.mainGameTimer);

  if (error && !catalog) return <p className="lb-screen lb-pad error">{error}</p>;
  if (!catalog) return <p className="lb-screen lb-pad">Loading…</p>;

  const prompts = speaker.assignedPrompts
    .map((id) => catalog.promptBank.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => !!p);

  const usedCount = Object.keys(speaker.endorsementsUsed ?? {}).length;
  const remaining = MAX_ENDORSEMENTS - usedCount;
  const canCast = session.phase === "mainGame" && remaining > 0 && !casting;
  const commission = session.commissions[speaker.commissionId];
  const speakerCount = Object.values(session.publicHearingSpeakers ?? {}).filter(
    (s) => s.commissionId === speaker.commissionId,
  ).length;

  const activeBallot = commission?.activeBallotId ? commission.ballotMeasures?.[commission.activeBallotId] : null;
  const ballotOpen = session.phase === "mainGame" && !!activeBallot && activeBallot.openedAt != null && activeBallot.closedAt == null;
  const ballotCard = activeBallot
    ? (activeBallot.cardType === "revenue"
        ? catalog.revenueCards.find((c) => c.id === activeBallot.cardId)
        : catalog.expenditureCards.find((c) => c.id === activeBallot.cardId))
    : null;

  const tableName = commission?.name ?? `Table ${speaker.commissionId}`;
  const activityEntries = commission ? buildCommissionActivity(commission, catalog, session.participants) : [];

  const debateCardId = commission?.chairHighlightedCardId ?? null;
  const debateCard = debateCardId
    ? (catalog.revenueCards.find((c) => c.id === debateCardId) ?? catalog.expenditureCards.find((c) => c.id === debateCardId))
    : null;
  const debateCardType: "revenue" | "expenditure" | null = debateCardId
    ? (catalog.revenueCards.some((c) => c.id === debateCardId) ? "revenue" : "expenditure")
    : null;
  const debateEffect =
    debateCard && debateCardType ? getCardLedgerLabel(debateCardType, debateCard.amount, debateCard.direction) : null;

  const chairName = commission?.members?.chairId
    ? (session.participants[commission.members.chairId]?.name ?? commission.members.chairId)
    : null;

  async function handleVote(vote: "yes" | "no") {
    if (!activeBallot || myVote || voting) return;
    setVoting(true);
    setVoteError(null);
    try {
      const result = await castBallotVote(code, speaker.commissionId, activeBallot.id, speaker.id, vote);
      if (result.ok) {
        setMyVote(vote);
      } else {
        setVoteError(result.reason ?? "Could not cast that vote.");
      }
    } catch (err) {
      setVoteError(err instanceof Error ? err.message : String(err));
    } finally {
      setVoting(false);
    }
  }

  async function handleCast(type: "endorse" | "oppose") {
    if (!canCast) return;
    setCasting(true);
    setCastError(null);
    try {
      const result = await castEndorsement(code, speaker.id, type, speaker.commissionId);
      if (!result.ok) setCastError(result.reason ?? "Could not cast that action.");
    } catch (err) {
      setCastError(err instanceof Error ? err.message : String(err));
    } finally {
      setCasting(false);
    }
  }

  return (
    <div className="lb-screen">
      <RoleHeaderBar
        viewLabel="Public Hearing Speaker View"
        shortRoleLabel="Speaker"
        tableName={tableName}
        code={code}
        phaseLabel={SESSION_PHASE_LABELS[session.phase] ?? session.phase}
        activityEntries={activityEntries}
        activityStorageKey={`activity-feed-last-seen:${code}:${speaker.commissionId}:${speaker.id}`}
      />
      {session.phase !== "debrief" && debateCardId && debateCard && debateEffect && (
        <CardUnderDebateBar cardTitle={debateCard.title} budgetEffectLabel={debateEffect.label} debateTimerEndsAt={commission?.debateTimerEndsAt ?? null} />
      )}
      <h1 className="lb-visually-hidden">
        Public Hearing Speaker View — {tableName} — {code}
      </h1>

      <div className="lb-pad">
        {error && <p style={{ color: "var(--lb-red)" }}>{error}</p>}

        <div className="panel">
          <h3>Your Prompt{prompts.length > 1 ? "s" : ""}</h3>
          {prompts.length === 0 && <p>No prompts assigned.</p>}
          <ul style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {prompts.map((p) => (
              <li key={p.id}>{p.text}</li>
            ))}
          </ul>
        </div>

        {session.phase === "debrief" ? (
          commission && <DebriefScorecard commission={commission} catalog={catalog} speakerCount={speakerCount} />
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              {session.phase === "mainGame" && mainGameMs !== null && (
                <div className="panel" style={{ padding: "10px 14px", gap: "4px" }}>
                  <span className="eyebrow">Main Game time remaining</span>
                  <b style={{ font: "800 22px/1 var(--lb-f-head)", fontVariantNumeric: "tabular-nums" }}>{formatDuration(mainGameMs)}</b>
                </div>
              )}
              <div className="panel" style={{ padding: "10px 14px", gap: "4px" }}>
                <span className="eyebrow">Chair</span>
                <b style={{ font: "800 22px/1 var(--lb-f-head)" }}>{chairName ?? "Not yet elected"}</b>
              </div>
            </div>

            <div className="panel">
              <h3>Endorse / Oppose</h3>
              <p>
                You have <strong>{remaining}</strong> of {MAX_ENDORSEMENTS} lifetime actions remaining. Each is permanent
                once cast -- there's no undo, and it doesn't need to target a specific card.
              </p>
              {session.phase !== "mainGame" && <p style={{ color: "var(--lb-muted)" }}>Available once Main Game begins.</p>}
              <div style={{ display: "flex", gap: "0.75rem" }}>
                <button type="button" className="btn primary sm" onClick={() => handleCast("endorse")} disabled={!canCast}>
                  👍 Endorse
                </button>
                <button type="button" className="btn ghost sm" onClick={() => handleCast("oppose")} disabled={!canCast}>
                  👎 Oppose
                </button>
              </div>
              {castError && <p style={{ color: "var(--lb-red)" }}>{castError}</p>}
            </div>

            {ballotOpen && ballotCard && (
              <div className="panel">
                <h3>Ballot Measure: {ballotCard.title}</h3>
                <ul style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  {ballotCard.impactBullets.map((bullet, idx) => (
                    <li key={idx}>{bullet}</li>
                  ))}
                </ul>
                {myVote ? (
                  <p>You voted. Thanks for participating — results will be announced once voting closes.</p>
                ) : (
                  <div style={{ display: "flex", gap: "0.75rem" }}>
                    <button type="button" className="btn primary sm" onClick={() => handleVote("yes")} disabled={voting}>
                      Yes
                    </button>
                    <button type="button" className="btn ghost sm" onClick={() => handleVote("no")} disabled={voting}>
                      No
                    </button>
                  </div>
                )}
                {voteError && <p style={{ color: "var(--lb-red)" }}>{voteError}</p>}
              </div>
            )}

            {commission && (
              <>
                <LedgerStatusBar ledger={commission.ledger} />
                <PublicTrustGauge publicTrustTally={commission.publicTrustTally} speakerCount={speakerCount} />
                {session.phase === "mainGame" && (
                  <PriorityTile priority={commission.priority} priorityCards={catalog.priorityCards} catalog={catalog} />
                )}
                <AppliedChallengesPanel commission={commission} catalog={catalog} />
                <CompactCardStatusList commission={commission} catalog={catalog} />
                <BallotMeasuresList commission={commission} catalog={catalog} />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default SpeakerView;
