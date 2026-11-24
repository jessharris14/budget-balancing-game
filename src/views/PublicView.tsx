import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { useAnonymousAuth } from "../hooks/useAnonymousAuth";
import { ROLE_ICON, uiIconUrl } from "../services/icons";
import { subscribeToSession } from "../services/sessionService";
import { computeStageTransform } from "../services/stageTransform";
import { formatClock, useCountdown } from "../hooks/useCountdown";
import BalanceStatusDisplay from "./BalanceStatusDisplay";
import PublicTrustGauge from "./PublicTrustGauge";
import { SESSION_PHASE_LABELS, type Session } from "../types/session";
import "./PublicView.css";

const STAGE_WIDTH = 1920;
const STAGE_HEIGHT = 1080;

/** The 1920x1080 stage scaled (and letterboxed in River Blue) to fit whatever screen/projector it's shown on -- never its own scrollbars, never clipped, at any resolution. */
function useStageTransform() {
  const [transform, setTransform] = useState({ scale: 1, left: 0, top: 0 });

  useEffect(() => {
    function recompute() {
      setTransform(computeStageTransform(window.innerWidth, window.innerHeight, STAGE_WIDTH, STAGE_HEIGHT));
    }
    recompute();
    window.addEventListener("resize", recompute);
    return () => window.removeEventListener("resize", recompute);
  }, []);

  return transform;
}

/**
 * Design step 2: the read-only projector screen, restyled to the approved
 * 1920x1080 mockup -- River Blue, full-bleed, hills along the bottom (same
 * treatment as the Home screen), opened by the Facilitator's "Open Public
 * View" button into a new tab in the SAME browser -- it reuses that
 * browser's existing anonymous sign-in, so it reads RTDB with the exact
 * same permissions the Facilitator Console already has, no rules change
 * needed. The one thing this adds on top of that shared read access is a
 * client-side check that the signed-in uid actually IS this session's
 * facilitatorId, so the route can't be casually opened from an unrelated
 * device/browser and show the room's data to someone who just guessed or
 * was handed the URL -- see the delivery notes for why that's a soft,
 * same-origin convenience check, not a real access boundary, and what the
 * smallest safe change would be to support a genuinely separate display
 * device.
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
  const { scale, left, top } = useStageTransform();

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
  const tableCount = Math.min(4, Math.max(1, commissionEntries.length));

  return (
    <div className="public-view-outer">
      <div className="pw" style={{ transform: `translate(${left}px, ${top}px) scale(${scale})`, transformOrigin: "top left" }}>
        <svg className="hills" viewBox="0 0 1920 300" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 120 C320 40 640 70 960 120 C1280 170 1600 90 1920 70 L1920 300 L0 300 Z" fill="var(--lb-field)" opacity="0.55" />
          <path d="M0 190 C340 140 700 170 1000 200 C1300 230 1620 180 1920 160 L1920 300 L0 300 Z" fill="var(--lb-forest)" opacity="0.6" />
        </svg>

        {!isFullscreen && (
          <button type="button" className="fs" onClick={toggleFullscreen}>
            Full screen (F)
          </button>
        )}

        <div className="ph1">
          <img className="lg" src="/assets/logo.png" alt="Let's Balance! A Budget Simulation Game" />
          <div className="join">
            <div className="qr" role="img" aria-label="Join code QR code">
              <QRCodeSVG value={joinUrl} size={108} />
            </div>
            <div className="t">
              <span>Join with code</span>
              <span className="c">{code}</span>
            </div>
          </div>
          <div className="clk">
            <span className="p">{SESSION_PHASE_LABELS[session.phase] ?? session.phase}</span>
            {session.phase === "mainGame" && mainGameMs !== null && (
              <span className="n" aria-label={`Main Game time remaining ${formatClock(mainGameMs)}`}>
                {formatClock(mainGameMs)}
              </span>
            )}
          </div>
        </div>

        <div className={`pg count-${tableCount}`}>
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
            const isDeficit = commission.ledger.deficitOrSurplus < 0;

            return (
              <div key={id} className={`pc${isDeficit ? " def" : ""}`}>
                <div className="top">
                  <h2>{commission.name ?? `Table ${id}`}</h2>
                  <BalanceStatusDisplay deficitOrSurplus={commission.ledger.deficitOrSurplus} size="xl" />
                </div>

                <div className="ppl">
                  {adminName && (
                    <span>
                      <img src={ROLE_ICON.managerAdmin} alt="" />
                      {adminName}
                    </span>
                  )}
                  {chairName && (
                    <span>
                      <img src={ROLE_ICON.commissioner} alt="" />
                      {chairName}
                      <em>Chair</em>
                    </span>
                  )}
                  {commissionerNames.map((name) => (
                    <span key={name}>
                      <img src={ROLE_ICON.commissioner} alt="" />
                      {name}
                    </span>
                  ))}
                  {speakerNames.map((name) => (
                    <span key={name}>
                      <img src={ROLE_ICON.publicHearingSpeaker} alt="" />
                      {name}
                    </span>
                  ))}
                </div>

                <div className="mid">
                  <div className="m" style={{ background: "var(--lb-rev-tint)" }}>
                    <div className="l">
                      <img src={uiIconUrl("revenue")} alt="" />
                      Revenue
                    </div>
                    <b>${commission.ledger.revenue.toLocaleString()}</b>
                  </div>
                  <div className="m" style={{ background: "var(--lb-exp-tint)" }}>
                    <div className="l">
                      <img src={uiIconUrl("expenditures")} alt="" />
                      Expenditures
                    </div>
                    <b>${commission.ledger.expenditures.toLocaleString()}</b>
                  </div>
                  <div className="m" style={{ background: "var(--lb-bg)" }}>
                    <div className="l">
                      <img src={uiIconUrl("reserves")} alt="" />
                      Reserves
                    </div>
                    <b style={{ color: "var(--lb-forest)" }}>${commission.ledger.reserves.toLocaleString()}</b>
                  </div>
                </div>

                <div className="gz">
                  <PublicTrustGauge publicTrustTally={commission.publicTrustTally} speakerCount={speakerNames.length} />
                </div>

                {isDebrief && commission.finalScore && (
                  <p style={{ margin: 0, fontWeight: 800, fontSize: 24, fontFamily: "var(--lb-f-head)" }}>
                    Final points: {commission.finalScore.total}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default PublicView;
