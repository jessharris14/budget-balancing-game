import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { getCatalog } from "../services/catalogService";
import {
  advancePhase,
  computeAndStoreFinalScores,
  rerollSpeakerPrompts,
  rollForChair,
  triggerChallenge,
} from "../services/facilitatorService";
import { persistGameResults } from "../services/resultsService";
import { useCountdown, formatDuration } from "../hooks/useCountdown";
import BallotMeasuresList from "./BallotMeasuresList";
import DebriefScorecard from "./DebriefScorecard";
import DecisionsList from "./DecisionsList";
import LedgerStatusBar from "./LedgerStatusBar";
import PriorityTile from "./PriorityTile";
import PublicTrustGauge from "./PublicTrustGauge";
import ScoreComparisonTable from "./ScoreComparisonTable";
import type { CardCatalog } from "../types/catalog";
import { SESSION_PHASE_LABELS, SESSION_PHASE_ORDER, type Session } from "../types/session";
import "./session.css";

interface Props {
  code: string;
  session: Session;
}

function FacilitatorConsole({ code, session }: Props) {
  const [catalog, setCatalog] = useState<CardCatalog | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [rolling, setRolling] = useState<string | null>(null);
  const [rollError, setRollError] = useState<string | null>(null);
  const [selectedChallengeId, setSelectedChallengeId] = useState<string | null>(null);
  const [triggeringCommissionId, setTriggeringCommissionId] = useState<string | null>(null);
  const [rerollingUid, setRerollingUid] = useState<string | null>(null);
  const [resultsError, setResultsError] = useState<string | null>(null);

  useEffect(() => {
    getCatalog(session.catalogVersion)
      .then((data) => {
        if (!data) {
          setCatalogError(`Catalog "${session.catalogVersion}" not found.`);
          return;
        }
        setCatalog(data);
      })
      .catch((err: unknown) => setCatalogError(err instanceof Error ? err.message : String(err)));
  }, [session.catalogVersion]);

  // Same RTDB pruning behavior as commission.members: a freshly created
  // session has phaseTimer/mainGameTimer/nextChallengeDue all null, so the
  // whole `clock` node is absent until advancePhase() first writes to it.
  const clock = session.clock ?? { phaseTimer: null, mainGameTimer: null, nextChallengeDue: null };
  const phaseTimerMs = useCountdown(clock.phaseTimer);
  const mainGameMs = useCountdown(clock.mainGameTimer);
  const nextChallengeMs = useCountdown(clock.nextChallengeDue);

  // Phase 7 B2: compute scores the instant the session reaches Debrief --
  // and every time this mounts/re-renders while already in Debrief with
  // any Commission still missing one, so a refreshed Facilitator device
  // self-heals instead of getting stuck. computeAndStoreFinalScores only
  // ever writes the commissions that are actually missing a score, so
  // re-firing this on every session update is harmless.
  useEffect(() => {
    if (session.phase !== "debrief") return;
    const needsScoring = Object.values(session.commissions ?? {}).some((c) => c.finalScore == null);
    if (needsScoring) void computeAndStoreFinalScores(code, session);
  }, [session.phase, session.commissions, code]);

  // Phase 7 B5: once every Commission has a finalScore, persist the
  // permanent Firestore results record -- separately from the above,
  // since this should only fire after scoring has actually landed, not
  // race ahead of it. persistGameResults checks for an existing doc
  // itself (and firestore.rules independently rejects a second write
  // either way), so this re-firing on every session update while already
  // persisted is a harmless no-op read, not a duplicate write.
  const [resultsPersisted, setResultsPersisted] = useState(false);
  useEffect(() => {
    if (session.phase !== "debrief" || resultsPersisted) return;
    const commissions = Object.values(session.commissions ?? {});
    const allScored = commissions.length > 0 && commissions.every((c) => c.finalScore != null);
    if (!allScored) return;
    persistGameResults(session)
      .then(() => setResultsPersisted(true))
      .catch((err: unknown) => setResultsError(err instanceof Error ? err.message : String(err)));
  }, [session, resultsPersisted]);

  const commissionEntries = Object.entries(session.commissions ?? {});
  const phaseIdx = SESSION_PHASE_ORDER.indexOf(session.phase);
  const isLastPhase = phaseIdx === SESSION_PHASE_ORDER.length - 1;

  // A Chair is required for the rest of the game (Rank Priorities recording,
  // debate highlighting, the free card) -- block leaving this phase until
  // every table has one, so it can't silently be skipped by clicking Next
  // Phase before rolling.
  const missingChairTables = commissionEntries
    .filter(([, c]) => !c.members?.chairId)
    .map(([id, c]) => c.name ?? `Table ${id}`);
  const blockedOnChair = session.phase === "rollForChair" && missingChairTables.length > 0;
  // missingChairTables is true from session creation (every table starts
  // with chairId: null) straight through Lobby/Overview/Game Overview/
  // Public Hearing -- phases that all come BEFORE Roll for Chair -- so it
  // alone can't gate the panel below. Compare phase order explicitly:
  // the panel (and its "already moved past" copy) may only appear once
  // the session has actually reached Roll for Chair.
  const reachedRollForChair = phaseIdx >= SESSION_PHASE_ORDER.indexOf("rollForChair");

  // Speakers each pick one Commission/table to watch at join, same as a
  // Commissioner, so this tracker is scoped per-Commission below rather
  // than session-wide (spec Section 8a #7/#8 correction).
  const speakers = Object.values(session.publicHearingSpeakers ?? {});

  async function handleNextPhase() {
    await advancePhase(code, session.phase);
  }

  async function handleRoll(commissionId: string) {
    const commission = session.commissions[commissionId];
    const commissionerUids = Object.keys(commission.members?.commissionerIds ?? {});
    if (commissionerUids.length === 0) return;
    setRolling(commissionId);
    setRollError(null);
    try {
      const result = await rollForChair(code, commissionId, commissionerUids);
      if (!result) {
        setRollError("Roll for Chair didn't take -- a Chair may already be set for this table, or the write was rejected.");
      }
    } catch (err) {
      setRollError(err instanceof Error ? err.message : String(err));
    } finally {
      setRolling(null);
    }
  }

  async function handleTriggerChallenge(commissionId: string) {
    if (!catalog || !selectedChallengeId || triggeringCommissionId) return;
    const card = catalog.challengeCards.find((c) => c.id === selectedChallengeId);
    if (!card) return;
    setTriggeringCommissionId(commissionId);
    try {
      await triggerChallenge(code, commissionId, card, clock.mainGameTimer);
    } finally {
      setTriggeringCommissionId(null);
    }
  }

  async function handleReroll(speakerUid: string, currentRerollCount: number) {
    if (!catalog) return;
    setRerollingUid(speakerUid);
    try {
      await rerollSpeakerPrompts(code, speakerUid, catalog.promptBank, currentRerollCount);
    } finally {
      setRerollingUid(null);
    }
  }

  const challengeReminderDue =
    session.phase === "mainGame" && clock.nextChallengeDue !== null && (nextChallengeMs ?? 0) <= 0;

  const joinUrl = `${window.location.origin}/join?code=${code}`;

  return (
    <div className="session-view facilitator-console">
      <h1>Facilitator Console — {code}</h1>

      <div className="code-display">
        <div className="code">{code}</div>
        <QRCodeSVG value={joinUrl} size={150} />
      </div>

      <div className="facilitator-phase-bar">
        <p>
          Phase: <strong>{SESSION_PHASE_LABELS[session.phase] ?? session.phase}</strong>
        </p>
        <button onClick={handleNextPhase} disabled={isLastPhase || blockedOnChair}>
          {isLastPhase ? "Session Complete" : "Next Phase →"}
        </button>
      </div>

      {reachedRollForChair && missingChairTables.length > 0 && (
        <div className="lobby-commission">
          <h2>Roll for Chair</h2>
          <p>
            {blockedOnChair
              ? "Every table needs a Chair before the game can move on to Rank Priorities."
              : "The game has already moved past Roll for Chair, but the table(s) below still don't have one -- you can still roll now."}
          </p>
          {commissionEntries
            .filter(([, c]) => !c.members?.chairId)
            .map(([id, c]) => {
              const commissionerUids = Object.keys(c.members?.commissionerIds ?? {});
              return (
                <div key={id}>
                  <h3>{c.name ?? `Table ${id} (unnamed)`}</h3>
                  <button onClick={() => handleRoll(id)} disabled={rolling === id || commissionerUids.length === 0}>
                    {rolling === id ? "Rolling…" : "Roll for Chair"}
                  </button>
                  {commissionerUids.length === 0 && (
                    <p className="error">No Commissioners have joined this table yet -- at least one is needed to roll.</p>
                  )}
                  {c.chairRoll && (
                    <ul>
                      {Object.entries(c.chairRoll).map(([uid, roll]) => (
                        <li key={uid}>
                          {session.participants[uid]?.name ?? uid}: {roll}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          {rollError && <p className="error">{rollError}</p>}
        </div>
      )}

      {session.phase === "rankPriorities" && phaseTimerMs !== null && (
        <p>Rank Priorities time remaining: {formatDuration(phaseTimerMs)}</p>
      )}

      {session.phase === "mainGame" && mainGameMs !== null && (
        <>
          {mainGameMs > 0 ? (
            <p>Main Game time remaining: {formatDuration(mainGameMs)}</p>
          ) : (
            // Phase 7 B2: the timer hitting 0:00 never auto-advances the
            // phase on its own -- just a clear prompt so the Facilitator
            // decides when the room is actually ready to move on.
            <p className="challenge-due">⏰ Main Game time is up — move to Debrief when ready.</p>
          )}
          {challengeReminderDue && <p className="challenge-due">⏰ Challenge due — trigger one when ready.</p>}
          {!challengeReminderDue && nextChallengeMs !== null && (
            <p>Next challenge reminder in: {formatDuration(nextChallengeMs)}</p>
          )}
          {!challengeReminderDue && clock.nextChallengeDue === null && (
            <p>No more challenge reminders (inside the final 10 minutes).</p>
          )}
        </>
      )}

      {catalogError && <p className="error">{catalogError}</p>}

      {session.phase === "debrief" && catalog && (
        <>
          {resultsPersisted && <p>✅ Final results saved.</p>}
          {resultsError && <p className="error">Could not save final results: {resultsError}</p>}
          {commissionEntries.length > 1 ? (
            <ScoreComparisonTable session={session} />
          ) : (
            // Phase 7 B4: a one-row comparison table is pointless with a
            // single Commission -- show its own scorecard directly instead.
            commissionEntries.length === 1 && (
              <DebriefScorecard
                commission={commissionEntries[0][1]}
                catalog={catalog}
                speakerCount={speakers.filter((s) => s.commissionId === commissionEntries[0][0]).length}
              />
            )
          )}
        </>
      )}

      <h2>Commissions</h2>
      {commissionEntries.map(([id, commission]) => {
        const members = commission.members ?? { managerAdminId: null, chairId: null, commissionerIds: {} };
        const commissionerUids = Object.keys(members.commissionerIds ?? {});
        const chairName = members.chairId ? (session.participants[members.chairId]?.name ?? members.chairId) : null;

        const commissionerNames = commissionerUids.map((uid) => session.participants[uid]?.name ?? uid);
        const decisionsCount = Object.keys(commission.decisionsLog ?? {}).length;
        const tableSpeakers = speakers.filter((s) => s.commissionId === id);
        const tableSpeakersWithEndorsement = tableSpeakers.filter((s) => Object.keys(s.endorsementsUsed ?? {}).length > 0).length;

        return (
          <div key={id} className="lobby-commission">
            <h3>{commission.name ?? `Table ${id} (unnamed)`}</h3>
            <p>Manager/Administrator: {members.managerAdminId ? (session.participants[members.managerAdminId]?.name ?? members.managerAdminId) : "— open —"}</p>
            <p>Commissioners ({commissionerNames.length}): {commissionerNames.length > 0 ? commissionerNames.join(", ") : "none yet"}</p>
            <p>Chair: {chairName ?? "not yet elected"}</p>
            <p>Decisions made: {decisionsCount}</p>
            {tableSpeakers.length > 0 && (
              <p>
                {tableSpeakersWithEndorsement} of {tableSpeakers.length} Speakers at this table have cast at least one endorsement.
              </p>
            )}
            <LedgerStatusBar ledger={commission.ledger} />
            <PublicTrustGauge publicTrustTally={commission.publicTrustTally} speakerCount={tableSpeakers.length} />

            {session.phase === "rankPriorities" && catalog && (
              <p>
                Priority selected:{" "}
                {commission.priority?.selectedCardId
                  ? (catalog.priorityCards.find((c) => c.id === commission.priority?.selectedCardId)?.title ??
                    commission.priority.selectedCardId)
                  : "not yet recorded by the Chair"}
              </p>
            )}

            {session.phase === "mainGame" && catalog && (
              <PriorityTile priority={commission.priority} priorityCards={catalog.priorityCards} catalog={catalog} />
            )}

            {session.phase === "mainGame" && (
              <div>
                <button onClick={() => handleTriggerChallenge(id)} disabled={!selectedChallengeId || !!triggeringCommissionId}>
                  {triggeringCommissionId === id ? "Pushing…" : "Push selected Challenge to this table"}
                </button>
                {commission.activeChallenge && (
                  <p>Last triggered: {commission.activeChallenge.printedText}</p>
                )}
              </div>
            )}

            {catalog && <DecisionsList commission={commission} catalog={catalog} />}
            {catalog && <BallotMeasuresList commission={commission} catalog={catalog} />}
          </div>
        );
      })}

      <h2>Public Hearing Speakers</h2>
      {speakers.length === 0 && <p>None yet.</p>}
      <ul>
        {speakers.map((speaker) => (
          <li key={speaker.id}>
            {speaker.name} — {session.commissions[speaker.commissionId]?.name ?? `Table ${speaker.commissionId}`}
            {catalog && (
              <>
                {" "}
                — prompt{speaker.assignedPrompts.length > 1 ? "s" : ""}:{" "}
                {speaker.assignedPrompts
                  .map((id) => catalog.promptBank.find((p) => p.id === id)?.text ?? id)
                  .join(" / ")}
              </>
            )}
            {speaker.rerollCount > 0 && ` (rerolled ${speaker.rerollCount}×)`}{" "}
            <button
              onClick={() => handleReroll(speaker.id, speaker.rerollCount)}
              disabled={!catalog || rerollingUid === speaker.id}
            >
              {rerollingUid === speaker.id ? "Rerolling…" : "Reroll prompt"}
            </button>
          </li>
        ))}
      </ul>

      {session.phase === "mainGame" && catalog && (
        <>
          <h2>Challenge Cards</h2>
          <p>Pushing a Challenge applies its dollar impact immediately -- Challenges can't be debated or declined.</p>
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Title</th>
                <th>Facilitator Narrative</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {catalog.challengeCards.map((card) => (
                <tr key={card.id}>
                  <td data-label="Select">
                    <input
                      type="radio"
                      name="challenge"
                      checked={selectedChallengeId === card.id}
                      onChange={() => setSelectedChallengeId(card.id)}
                    />
                  </td>
                  <td data-label="Title">{card.title}</td>
                  <td data-label="Facilitator Narrative">{card.facilitatorNarrative}</td>
                  <td data-label="Amount">
                    ${card.amount} {card.target} ({card.direction})
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

export default FacilitatorConsole;
