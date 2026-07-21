import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { getCatalog } from "../services/catalogService";
import {
  advancePhase,
  recordCommissionPriority,
  rollForChair,
  triggerChallenge,
} from "../services/facilitatorService";
import { useCountdown, formatDuration } from "../hooks/useCountdown";
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
  const [selectedChallengeId, setSelectedChallengeId] = useState<string | null>(null);

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

  const phaseTimerMs = useCountdown(session.clock.phaseTimer);
  const mainGameMs = useCountdown(session.clock.mainGameTimer);
  const nextChallengeMs = useCountdown(session.clock.nextChallengeDue);

  const commissionEntries = Object.entries(session.commissions ?? {});
  const phaseIdx = SESSION_PHASE_ORDER.indexOf(session.phase);
  const isLastPhase = phaseIdx === SESSION_PHASE_ORDER.length - 1;

  async function handleNextPhase() {
    await advancePhase(code, session.phase);
  }

  async function handleRoll(commissionId: string) {
    const commission = session.commissions[commissionId];
    const commissionerUids = Object.keys(commission.members?.commissionerIds ?? {});
    if (commissionerUids.length === 0) return;
    setRolling(commissionId);
    try {
      await rollForChair(code, commissionId, commissionerUids);
    } finally {
      setRolling(null);
    }
  }

  async function handleSelectPriority(commissionId: string, cardId: string) {
    await recordCommissionPriority(code, commissionId, cardId);
  }

  async function handleTriggerChallenge(commissionId: string) {
    if (!catalog || !selectedChallengeId) return;
    const card = catalog.challengeCards.find((c) => c.id === selectedChallengeId);
    if (!card) return;
    await triggerChallenge(code, commissionId, card, session.clock.mainGameTimer);
  }

  const challengeReminderDue =
    session.phase === "mainGame" && session.clock.nextChallengeDue !== null && (nextChallengeMs ?? 0) <= 0;

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
        <button onClick={handleNextPhase} disabled={isLastPhase}>
          {isLastPhase ? "Session Complete" : "Next Phase →"}
        </button>
      </div>

      {session.phase === "rankPriorities" && phaseTimerMs !== null && (
        <p>Rank Priorities time remaining: {formatDuration(phaseTimerMs)}</p>
      )}

      {session.phase === "mainGame" && mainGameMs !== null && (
        <>
          <p>Main Game time remaining: {formatDuration(mainGameMs)}</p>
          {challengeReminderDue && <p className="challenge-due">⏰ Challenge due — trigger one when ready.</p>}
          {!challengeReminderDue && nextChallengeMs !== null && (
            <p>Next challenge reminder in: {formatDuration(nextChallengeMs)}</p>
          )}
          {!challengeReminderDue && session.clock.nextChallengeDue === null && (
            <p>No more challenge reminders (inside the final 10 minutes).</p>
          )}
        </>
      )}

      {catalogError && <p className="error">{catalogError}</p>}

      <h2>Commissions</h2>
      {commissionEntries.map(([id, commission]) => {
        const members = commission.members ?? { managerAdminId: null, clerkId: null, chairId: null, commissionerIds: {} };
        const commissionerUids = Object.keys(members.commissionerIds ?? {});
        const chairName = members.chairId ? (session.participants[members.chairId]?.name ?? members.chairId) : null;

        const commissionerNames = commissionerUids.map((uid) => session.participants[uid]?.name ?? uid);

        return (
          <div key={id} className="lobby-commission">
            <h3>{commission.name ?? `Table ${id} (unnamed)`}</h3>
            <p>Manager/Administrator: {members.managerAdminId ? (session.participants[members.managerAdminId]?.name ?? members.managerAdminId) : "— open —"}</p>
            <p>Clerk: {members.clerkId ? (session.participants[members.clerkId]?.name ?? members.clerkId) : "— open —"}</p>
            <p>Commissioners ({commissionerNames.length}): {commissionerNames.length > 0 ? commissionerNames.join(", ") : "none yet"}</p>

            {session.phase === "rollForChair" && (
              <div>
                {members.chairId ? (
                  <p>Chair: {chairName}</p>
                ) : (
                  <button onClick={() => handleRoll(id)} disabled={rolling === id || commissionerUids.length === 0}>
                    {rolling === id ? "Rolling…" : "Roll for Chair"}
                  </button>
                )}
                {commission.chairRoll && (
                  <ul>
                    {Object.entries(commission.chairRoll).map(([uid, roll]) => (
                      <li key={uid}>
                        {session.participants[uid]?.name ?? uid}: {roll}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {session.phase === "rankPriorities" && catalog && (
              <div className="role-options">
                {catalog.priorityCards.map((card) => (
                  <label key={card.id}>
                    <input
                      type="radio"
                      name={`priority-${id}`}
                      checked={commission.priority?.selectedCardId === card.id}
                      onChange={() => handleSelectPriority(id, card.id)}
                    />
                    {card.title} — {card.description}
                  </label>
                ))}
              </div>
            )}

            {session.phase === "mainGame" && (
              <div>
                <button onClick={() => handleTriggerChallenge(id)} disabled={!selectedChallengeId}>
                  Push selected Challenge to this table
                </button>
                {commission.activeChallenge && (
                  <p>Last triggered: {commission.activeChallenge.printedText}</p>
                )}
              </div>
            )}
          </div>
        );
      })}

      <h2>Public Hearing Speakers</h2>
      {Object.keys(session.publicHearingSpeakers ?? {}).length === 0 && <p>None yet.</p>}
      <ul>
        {Object.values(session.publicHearingSpeakers ?? {}).map((speaker) => (
          <li key={speaker.id}>{speaker.name}</li>
        ))}
      </ul>

      {session.phase === "mainGame" && catalog && (
        <>
          <h2>Challenge Cards</h2>
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
                  <td>
                    <input
                      type="radio"
                      name="challenge"
                      checked={selectedChallengeId === card.id}
                      onChange={() => setSelectedChallengeId(card.id)}
                    />
                  </td>
                  <td>{card.title}</td>
                  <td>{card.facilitatorNarrative}</td>
                  <td>
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
