import { useEffect, useState } from "react";
import { castBallotVote } from "../services/ballotService";
import { getCatalog } from "../services/catalogService";
import { castEndorsement } from "../services/speakerService";
import BallotMeasuresList from "./BallotMeasuresList";
import DecisionsList from "./DecisionsList";
import LedgerStatusBar from "./LedgerStatusBar";
import PriorityTile from "./PriorityTile";
import PublicTrustGauge from "./PublicTrustGauge";
import type { CardCatalog } from "../types/catalog";
import { SESSION_PHASE_LABELS, type Session, type Speaker } from "../types/session";
import "./session.css";
import "./ManagerConsole.css";

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
 */
function SpeakerView({ code, session, speaker }: Props) {
  const [catalog, setCatalog] = useState<CardCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [casting, setCasting] = useState(false);
  const [castError, setCastError] = useState<string | null>(null);
  const [voting, setVoting] = useState(false);
  const [voteError, setVoteError] = useState<string | null>(null);

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

  if (error && !catalog) return <p className="session-view error">{error}</p>;
  if (!catalog) return <p className="session-view">Loading…</p>;

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
  const ballotOpen = !!activeBallot && activeBallot.openedAt != null && activeBallot.closedAt == null;
  const myVote = activeBallot?.votes?.[speaker.id];
  const ballotCard = activeBallot
    ? (activeBallot.cardType === "revenue"
        ? catalog.revenueCards.find((c) => c.id === activeBallot.cardId)
        : catalog.expenditureCards.find((c) => c.id === activeBallot.cardId))
    : null;

  async function handleVote(vote: "yes" | "no") {
    if (!activeBallot || myVote || voting) return;
    setVoting(true);
    setVoteError(null);
    try {
      await castBallotVote(code, speaker.commissionId, activeBallot.id, speaker.id, vote);
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
    <div className="session-view manager-console">
      <h1>Public Hearing Speaker — {code}</h1>
      <p>{commission?.name ?? `Table ${speaker.commissionId} (unnamed)`}</p>
      <p>
        Chair:{" "}
        {commission?.members?.chairId
          ? (session.participants[commission.members.chairId]?.name ?? commission.members.chairId)
          : "not yet elected"}
      </p>
      <p>
        Phase: <strong>{SESSION_PHASE_LABELS[session.phase] ?? session.phase}</strong>
      </p>

      <h2>Your Prompt{prompts.length > 1 ? "s" : ""}</h2>
      {prompts.length === 0 && <p>No prompts assigned.</p>}
      <ul>
        {prompts.map((p) => (
          <li key={p.id}>{p.text}</li>
        ))}
      </ul>

      <div className="lobby-commission">
        <h3>Endorse / Oppose</h3>
        <p>
          You have <strong>{remaining}</strong> of {MAX_ENDORSEMENTS} lifetime actions remaining. Each is permanent
          once cast -- there's no undo, and it doesn't need to target a specific card.
        </p>
        {session.phase !== "mainGame" && <p>Available once Main Game begins.</p>}
        <div className="chair-timer-controls">
          <button onClick={() => handleCast("endorse")} disabled={!canCast}>
            👍 Endorse
          </button>
          <button onClick={() => handleCast("oppose")} disabled={!canCast}>
            👎 Oppose
          </button>
        </div>
        {castError && <p className="error">{castError}</p>}
      </div>

      {ballotOpen && ballotCard && (
        <div className="lobby-commission">
          <h3>Ballot Measure: {ballotCard.title}</h3>
          <ul>
            {ballotCard.impactBullets.map((bullet, idx) => (
              <li key={idx}>{bullet}</li>
            ))}
          </ul>
          {myVote ? (
            <p>You voted. Thanks for participating — results will be announced once voting closes.</p>
          ) : (
            <div className="chair-timer-controls">
              <button onClick={() => handleVote("yes")} disabled={voting}>
                Yes
              </button>
              <button onClick={() => handleVote("no")} disabled={voting}>
                No
              </button>
            </div>
          )}
          {voteError && <p className="error">{voteError}</p>}
        </div>
      )}

      {commission && (
        <>
          <LedgerStatusBar ledger={commission.ledger} />
          <PublicTrustGauge publicTrustTally={commission.publicTrustTally} speakerCount={speakerCount} />
          {session.phase === "mainGame" && (
            <PriorityTile priority={commission.priority} priorityCards={catalog.priorityCards} catalog={catalog} />
          )}
          <DecisionsList commission={commission} catalog={catalog} />
          <BallotMeasuresList commission={commission} catalog={catalog} />
        </>
      )}
    </div>
  );
}

export default SpeakerView;
