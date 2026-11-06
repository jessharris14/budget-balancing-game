import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { useAnonymousAuth } from "../hooks/useAnonymousAuth";
import { getBalanceStatus } from "../services/ledgerService";
import { subscribeToSession } from "../services/sessionService";
import { formatDuration, useCountdown } from "../hooks/useCountdown";
import BalanceStatusDisplay from "./BalanceStatusDisplay";
import PublicTrustGauge from "./PublicTrustGauge";
import { SESSION_PHASE_LABELS, type Session } from "../types/session";
import "./PublicView.css";

/**
 * Phase 9a: the read-only projector screen, opened by the Facilitator's
 * "Open Public View" button into a new tab in the SAME browser -- it
 * reuses that browser's existing anonymous sign-in, so it reads RTDB with
 * the exact same permissions the Facilitator Console already has, no
 * rules change needed. The one thing this adds on top of that shared
 * read access is a client-side check that the signed-in uid actually IS
 * this session's facilitatorId, so the route can't be casually opened
 * from an unrelated device/browser and show the room's data to someone
 * who just guessed or was handed the URL -- see the delivery notes for
 * why that's a soft, same-origin convenience check, not a real access
 * boundary, and what the smallest safe change would be to support a
 * genuinely separate display device.
 *
 * Deliberately built from an explicit list of fields, not by reusing
 * FacilitatorConsole/FacilitatorTableCard: this screen must never show
 * facilitatorNarrative, the Challenge Cards picker, anonymous ballot
 * votes, a pending motion's private details, or seat-reset controls --
 * none of that is read here at all, rather than being read and hidden.
 */
function PublicView() {
  const { code = "" } = useParams<{ code: string }>();
  const { user, status: authStatus } = useAnonymousAuth();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (authStatus !== "signed-in") return;
    return subscribeToSession(code, setSession);
  }, [code, authStatus]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void document.documentElement.requestFullscreen();
    }
  }, []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key.toLowerCase() === "f" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        toggleFullscreen();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleFullscreen]);

  // Hooks must run unconditionally, before any early return below.
  const clock = session?.clock ?? { phaseTimer: null, mainGameTimer: null, nextChallengeDue: null };
  const mainGameMs = useCountdown(clock.mainGameTimer);

  if (authStatus !== "signed-in") return <p className="public-view-status">Signing in…</p>;
  if (session === undefined) return <p className="public-view-status">Loading…</p>;
  if (session === null) return <p className="public-view-status">No session found for code "{code}".</p>;

  if (!user || user.uid !== session.facilitatorId) {
    return (
      <div className="public-view-status">
        <p>Open the Public View from the Facilitator Console in the same browser.</p>
      </div>
    );
  }

  const joinUrl = `${window.location.origin}/join?code=${code}`;
  const commissionEntries = Object.entries(session.commissions ?? {});
  const isDebrief = session.phase === "debrief";

  return (
    <div className="public-view">
      <header className="public-view-header">
        <div className="public-view-header__title">
          <h1>Let's Balance!</h1>
          <p className="public-view-header__code">Code: {code}</p>
        </div>
        <div className="public-view-header__phase">
          <p className="public-view-header__phase-name">{SESSION_PHASE_LABELS[session.phase] ?? session.phase}</p>
          {session.phase === "mainGame" && mainGameMs !== null && (
            <p className="public-view-header__clock">{formatDuration(mainGameMs)}</p>
          )}
        </div>
        <div className="public-view-header__qr">
          <QRCodeSVG value={joinUrl} size={110} />
          <p>Join at the code above</p>
        </div>
        <button className="public-view-fullscreen-button" onClick={toggleFullscreen}>
          {isFullscreen ? "Exit full screen" : "Full screen (F)"}
        </button>
      </header>

      <div className="public-view-grid">
        {commissionEntries.map(([id, commission]) => {
          const members = commission.members ?? { managerAdminId: null, chairId: null, commissionerIds: {} };
          const adminName = members.managerAdminId ? (session.participants[members.managerAdminId]?.name ?? "—") : null;
          const chairName = members.chairId ? (session.participants[members.chairId]?.name ?? "—") : null;
          const commissionerNames = Object.keys(members.commissionerIds ?? {}).map(
            (uid) => session.participants[uid]?.name ?? uid,
          );
          const speakerNames = Object.values(session.publicHearingSpeakers ?? {})
            .filter((s) => s.commissionId === id)
            .map((s) => s.name);
          const balance = getBalanceStatus(commission.ledger.deficitOrSurplus);

          return (
            <div key={id} className="public-view-card">
              <h2>{commission.name ?? `Table ${id}`}</h2>

              <div className="public-view-card__people">
                <p>
                  <strong>Manager/Administrator:</strong> {adminName ?? "— open —"}
                </p>
                <p>
                  <strong>Chair:</strong> {chairName ?? "not yet elected"}
                </p>
                <p>
                  <strong>Commissioners:</strong> {commissionerNames.length > 0 ? commissionerNames.join(", ") : "none yet"}
                </p>
                <p>
                  <strong>Public Hearing Speakers:</strong> {speakerNames.length > 0 ? speakerNames.join(", ") : "none yet"}
                </p>
              </div>

              <div className="public-view-card__finance">
                <div className="public-view-card__figure">
                  <span className="public-view-card__figure-label">Revenue</span>
                  <span className="public-view-card__figure-value">${commission.ledger.revenue.toLocaleString()}</span>
                </div>
                <div className="public-view-card__figure">
                  <span className="public-view-card__figure-label">Expenditures</span>
                  <span className="public-view-card__figure-value">${commission.ledger.expenditures.toLocaleString()}</span>
                </div>
                <div className="public-view-card__figure">
                  <span className="public-view-card__figure-label">Reserves</span>
                  <span className="public-view-card__figure-value">${commission.ledger.reserves.toLocaleString()}</span>
                </div>
              </div>

              <BalanceStatusDisplay deficitOrSurplus={commission.ledger.deficitOrSurplus} size="large" />
              {/* Reaffirm the word in plain static text too, not just the icon/color, for anyone reading from the back of the room. */}
              <p className="public-view-card__balance-note">{balance.label}</p>

              <PublicTrustGauge publicTrustTally={commission.publicTrustTally} speakerCount={speakerNames.length} />

              {isDebrief && commission.finalScore && (
                <p className="public-view-card__final-score">Final points: {commission.finalScore.total}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default PublicView;
