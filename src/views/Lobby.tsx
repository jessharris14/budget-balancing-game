import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { useAnonymousAuth } from "../hooks/useAnonymousAuth";
import { subscribeToSession } from "../services/sessionService";
import { formatDuration, useCountdown } from "../hooks/useCountdown";
import CommissionerView from "./CommissionerView";
import FacilitatorConsole from "./FacilitatorConsole";
import ManagerConsole from "./ManagerConsole";
import SpeakerView from "./SpeakerView";
import { SESSION_PHASE_LABELS, type Session } from "../types/session";
import "./session.css";

const ROLE_LABELS: Record<string, string> = {
  facilitator: "Facilitator",
  managerAdmin: "Manager/Administrator",
  commissioner: "Commissioner",
  publicHearingSpeaker: "Public Hearing Speaker",
};

function Lobby() {
  const { code = "" } = useParams<{ code: string }>();
  const { user, status: authStatus } = useAnonymousAuth();
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    if (authStatus !== "signed-in") return;
    return subscribeToSession(code, setSession);
  }, [code, authStatus]);

  // Hooks must run unconditionally on every render, before the loading/error
  // early returns below -- session is possibly still undefined/null here,
  // so these read through optional chaining rather than off the narrowed
  // `session` used everywhere past those guards.
  const clock = session?.clock ?? { phaseTimer: null, mainGameTimer: null, nextChallengeDue: null };
  const phaseTimerMs = useCountdown(clock.phaseTimer);
  const mainGameMs = useCountdown(clock.mainGameTimer);

  if (authStatus !== "signed-in") return <p className="session-view">Signing in…</p>;
  if (session === undefined) return <p className="session-view">Loading lobby…</p>;
  if (session === null) return <p className="session-view">No session found for code "{code}".</p>;

  const myParticipant = user ? session.participants[user.uid] : undefined;
  const joinUrl = `${window.location.origin}/join?code=${code}`;

  // Checked against facilitatorId (set once at creation, never overwritten)
  // rather than myParticipant.role: that role field lives in the same
  // uid-keyed participants map that the join flow writes to, so if the
  // facilitator's own device ever also joins as a participant role (e.g.
  // testing the join link in the same browser, which shares the anonymous
  // auth identity across tabs), that write would silently overwrite their
  // own "facilitator" role and lock them out of their own console.
  if (user?.uid === session.facilitatorId) {
    return <FacilitatorConsole code={code} session={session} />;
  }

  const myCommission = myParticipant?.commissionId ? session.commissions[myParticipant.commissionId] : undefined;
  const isMyChair = !!user && !!myCommission && myCommission.members?.chairId === user.uid;

  // Same reasoning as the Facilitator check above: routed on the
  // one-shot-write members.managerAdminId (Phase 2's claimSingleSeatRole),
  // not myParticipant.role, so this can't be knocked over by the same
  // mutable-role-field issue fixed for the Facilitator in Phase 3.
  if (user && myCommission?.members?.managerAdminId === user.uid && myParticipant?.commissionId) {
    return (
      <ManagerConsole code={code} session={session} commissionId={myParticipant.commissionId} commission={myCommission} />
    );
  }

  // Routed on membership in members.commissionerIds (one-shot self-write
  // from joinAsCommissioner) rather than myParticipant.role, same reasoning
  // as the Facilitator/Manager-Administrator checks above.
  const isMyCommissioner = !!user && !!myCommission && !!myCommission.members?.commissionerIds?.[user.uid];
  if (isMyCommissioner && myParticipant?.commissionId && myCommission) {
    return (
      <CommissionerView
        code={code}
        session={session}
        commissionId={myParticipant.commissionId}
        commission={myCommission}
        isMyChair={isMyChair}
      />
    );
  }

  // Routed on presence in session.publicHearingSpeakers (one-shot self-write
  // from joinAsPublicHearingSpeaker) rather than myParticipant.role.
  const mySpeaker = user ? session.publicHearingSpeakers?.[user.uid] : undefined;
  if (mySpeaker) {
    return <SpeakerView code={code} session={session} speaker={mySpeaker} />;
  }

  return (
    <div className="session-view">
      <h1>Lobby — {code}</h1>
      <p>Phase: <strong>{SESSION_PHASE_LABELS[session.phase] ?? session.phase}</strong></p>
      {session.phase === "rankPriorities" && phaseTimerMs !== null && (
        <p>Rank Priorities time remaining: {formatDuration(phaseTimerMs)}</p>
      )}
      {session.phase === "mainGame" && mainGameMs !== null && (
        <p>Main Game time remaining: {formatDuration(mainGameMs)}</p>
      )}
      <p>Debate timer: {session.settings.debateTimerMinutes} min</p>
      {myParticipant && (
        <p>
          You are: <span className="lobby-you">{ROLE_LABELS[myParticipant.role]}{isMyChair && " (Chair)"}</span>
          {myParticipant.commissionId && ` — ${session.commissions[myParticipant.commissionId]?.name ?? myParticipant.commissionId}`}
        </p>
      )}

      {myCommission?.activeChallenge && (
        <p className="challenge-banner">📢 Challenge: {myCommission.activeChallenge.printedText}</p>
      )}

      <div className="code-display">
        <div className="code">{code}</div>
        <QRCodeSVG value={joinUrl} size={150} />
      </div>

      <h2>Commissions</h2>
      {Object.entries(session.commissions ?? {}).map(([id, commission]) => {
        // RTDB prunes empty objects and null values from storage, so a
        // freshly created commission with nobody joined yet has no
        // `members` node at all -- everything here must tolerate that.
        const members = commission.members ?? { managerAdminId: null, chairId: null, commissionerIds: {} };
        const commissioners = Object.keys(members.commissionerIds ?? {}).map(
          (uid) => session.participants[uid]?.name ?? uid,
        );
        return (
          <div key={id} className="lobby-commission">
            <h3>{commission.name ?? `Table ${id} (unnamed)`}</h3>
            <p>Manager/Administrator: {members.managerAdminId ? (session.participants[members.managerAdminId]?.name ?? members.managerAdminId) : "— open —"}</p>
            <p>Commissioners ({commissioners.length}): {commissioners.length > 0 ? commissioners.join(", ") : "none yet"}</p>
            {members.chairId && <p>Chair: {session.participants[members.chairId]?.name ?? members.chairId}</p>}
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
    </div>
  );
}

export default Lobby;
