import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { useAnonymousAuth } from "../hooks/useAnonymousAuth";
import { useConnectionStatus } from "../hooks/useConnectionStatus";
import { rememberSession } from "../services/localSession";
import { startPresence } from "../services/presenceService";
import { subscribeToSession } from "../services/sessionService";
import { formatClock, useCountdown } from "../hooks/useCountdown";
import CommissionerView from "./CommissionerView";
import EventPopupHost from "./EventPopupHost";
import FacilitatorConsole from "./FacilitatorConsole";
import ManagerConsole from "./ManagerConsole";
import SpeakerView from "./SpeakerView";
import { SESSION_PHASE_LABELS, type Session } from "../types/session";
import "./lb-components.css";

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
  const connected = useConnectionStatus();

  useEffect(() => {
    if (authStatus !== "signed-in") return;
    return subscribeToSession(code, setSession);
  }, [code, authStatus]);

  // Phase 8.2: presence is purely a connectivity marker (see
  // presenceService.ts) -- never wired into any role claim or write path,
  // so losing it can't release a seat or drop recorded history. Started
  // once per signed-in uid per session; its own cleanup (on unmount or a
  // uid/code change) clears the marker and cancels the pending
  // onDisconnect so a deliberate navigation away doesn't linger as
  // "connected" until a timeout.
  useEffect(() => {
    if (authStatus !== "signed-in" || !user) return;
    return startPresence(code, user.uid);
  }, [code, authStatus, user]);

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
  const reconnectBanner = !connected && (
    <p role="status" style={{ background: "rgba(255,184,28,.18)", border: "1px solid rgba(255,184,28,.6)", borderRadius: "0.5rem", padding: "0.6rem 0.9rem", fontWeight: 600, margin: "0.5rem 0" }}>
      ⏳ Reconnecting… your last known state is still shown below.
    </p>
  );

  // Checked against facilitatorId (set once at creation, never overwritten)
  // rather than myParticipant.role: that role field lives in the same
  // uid-keyed participants map that the join flow writes to, so if the
  // facilitator's own device ever also joins as a participant role (e.g.
  // testing the join link in the same browser, which shares the anonymous
  // auth identity across tabs), that write would silently overwrite their
  // own "facilitator" role and lock them out of their own console.
  if (user?.uid === session.facilitatorId) {
    rememberSession(code, user.uid);
    return (
      <>
        {reconnectBanner}
        <FacilitatorConsole code={code} session={session} />
      </>
    );
  }

  const myCommission = myParticipant?.commissionId ? session.commissions[myParticipant.commissionId] : undefined;
  const isMyChair = !!user && !!myCommission && myCommission.members?.chairId === user.uid;

  // One shared instance for every non-Facilitator role at a table (Manager/
  // Administrator, Chair, Commissioners, Speakers) -- see
  // EventPopupHost.tsx. canSecond differs per role (Commissioners,
  // including the Chair, may second; the Manager/Administrator and Public
  // Hearing Speakers get the info-only motion pop-up), so this is built
  // per-role below rather than once here.
  const activeSession = session;
  function eventPopupHost(canSecond: boolean) {
    if (!myCommission || !myParticipant?.commissionId || !user) return null;
    return (
      <EventPopupHost
        code={code}
        commissionId={myParticipant.commissionId}
        commission={myCommission}
        catalogVersion={activeSession.catalogVersion}
        phase={activeSession.phase}
        myUid={user.uid}
        participants={activeSession.participants}
        canSecond={canSecond}
      />
    );
  }

  // Same reasoning as the Facilitator check above: routed on the
  // one-shot-write members.managerAdminId (Phase 2's claimSingleSeatRole),
  // not myParticipant.role, so this can't be knocked over by the same
  // mutable-role-field issue fixed for the Facilitator in Phase 3.
  if (user && myCommission?.members?.managerAdminId === user.uid && myParticipant?.commissionId) {
    rememberSession(code, user.uid);
    return (
      <>
        {reconnectBanner}
        {eventPopupHost(false)}
        <ManagerConsole code={code} session={session} commissionId={myParticipant.commissionId} commission={myCommission} />
      </>
    );
  }

  // Routed on membership in members.commissionerIds (one-shot self-write
  // from joinAsCommissioner) rather than myParticipant.role, same reasoning
  // as the Facilitator/Manager-Administrator checks above.
  const isMyCommissioner = !!user && !!myCommission && !!myCommission.members?.commissionerIds?.[user.uid];
  if (isMyCommissioner && myParticipant?.commissionId && myCommission) {
    rememberSession(code, user.uid);
    return (
      <>
        {reconnectBanner}
        {eventPopupHost(true)}
        <CommissionerView
          code={code}
          session={session}
          commissionId={myParticipant.commissionId}
          commission={myCommission}
          isMyChair={isMyChair}
          myUid={user?.uid ?? ""}
        />
      </>
    );
  }

  // Routed on presence in session.publicHearingSpeakers (one-shot self-write
  // from joinAsPublicHearingSpeaker) rather than myParticipant.role.
  const mySpeaker = user ? session.publicHearingSpeakers?.[user.uid] : undefined;
  if (mySpeaker) {
    rememberSession(code, user!.uid);
    return (
      <>
        {reconnectBanner}
        {eventPopupHost(false)}
        <SpeakerView code={code} session={session} speaker={mySpeaker} />
      </>
    );
  }

  return (
    <div className="lb-screen">
      <div className="hero" style={{ height: 96, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px" }}>
        <img src="/assets/logo.png" alt="Let's Balance!" style={{ height: 64, width: "auto" }} />
        <span style={{ border: "1.5px solid rgba(255,255,255,.75)", borderRadius: 8, padding: "5px 8px", font: "700 13px var(--lb-f-head)", letterSpacing: "0.14em", color: "#fff" }}>{code}</span>
      </div>
      <div className="lb-pad">
        {reconnectBanner}
        <span className="eyebrow">Phase: {SESSION_PHASE_LABELS[session.phase] ?? session.phase}</span>
        <h1 style={{ fontSize: 24 }}>Lobby</h1>
        {session.phase === "rankPriorities" && phaseTimerMs !== null && <p>Rank Priorities time remaining: {formatClock(phaseTimerMs)}</p>}
        {session.phase === "mainGame" && mainGameMs !== null && <p>Main Game time remaining: {formatClock(mainGameMs)}</p>}
        <p style={{ color: "var(--lb-muted)" }}>Debate timer: {session.settings.debateTimerMinutes} min</p>
        {myParticipant && (
          <p>
            You are:{" "}
            <strong>
              {ROLE_LABELS[myParticipant.role]}
              {isMyChair && " (Chair)"}
            </strong>
            {myParticipant.commissionId && ` — ${session.commissions[myParticipant.commissionId]?.name ?? myParticipant.commissionId}`}
          </p>
        )}

        {myCommission?.activeChallenge && (
          <p className="panel" style={{ background: "rgba(255,143,28,.17)", borderColor: "var(--lb-orange)" }}>
            📢 Challenge: {myCommission.activeChallenge.printedText}
          </p>
        )}

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem", margin: "1rem 0" }}>
          <QRCodeSVG value={joinUrl} size={140} />
          <p style={{ color: "var(--lb-muted)", fontSize: 13 }}>Scan to join, or share the code above.</p>
        </div>

        <h2>Commissions</h2>
        <div className="roles">
          {Object.entries(session.commissions ?? {}).map(([id, commission]) => {
            // RTDB prunes empty objects and null values from storage, so a
            // freshly created commission with nobody joined yet has no
            // `members` node at all -- everything here must tolerate that.
            const members = commission.members ?? { managerAdminId: null, chairId: null, commissionerIds: {} };
            const commissioners = Object.keys(members.commissionerIds ?? {}).map((uid) => session.participants[uid]?.name ?? uid);
            return (
              <div key={id} className="panel">
                <h3>{commission.name ?? `Table ${id} (unnamed)`}</h3>
                <p>Manager/Administrator: {members.managerAdminId ? (session.participants[members.managerAdminId]?.name ?? members.managerAdminId) : "— open —"}</p>
                <p>
                  Commissioners ({commissioners.length}): {commissioners.length > 0 ? commissioners.join(", ") : "none yet"}
                </p>
                {members.chairId && <p>Chair: {session.participants[members.chairId]?.name ?? members.chairId}</p>}
              </div>
            );
          })}
        </div>

        <h2>Public Hearing Speakers</h2>
        {Object.keys(session.publicHearingSpeakers ?? {}).length === 0 && <p>None yet.</p>}
        <ul style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          {Object.values(session.publicHearingSpeakers ?? {}).map((speaker) => (
            <li key={speaker.id}>{speaker.name}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default Lobby;
