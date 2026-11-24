import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { buildFacilitatorActivity } from "../services/activityFeed";
import { getCatalog } from "../services/catalogService";
import { getChallengeLedgerEffect } from "../services/challengeLedgerEffect";
import { buildPhaseIndicator } from "../services/facilitatorPhaseIndicator";
import {
  advancePhase,
  computeAndStoreFinalScores,
  rerollSpeakerPrompts,
  rollForChair,
  triggerChallenge,
} from "../services/facilitatorService";
import { uiIconUrl } from "../services/icons";
import { persistGameResults } from "../services/resultsService";
import { clearSessionData } from "../services/sessionService";
import { useCountdown, formatClock } from "../hooks/useCountdown";
import ActivityFeedButton from "./ActivityFeedButton";
import BudgetEffectLabel from "./BudgetEffectLabel";
import CardIcon from "./CardIcon";
import DebriefScorecard from "./DebriefScorecard";
import FacilitatorTableCard from "./FacilitatorTableCard";
import ScoreComparisonTable from "./ScoreComparisonTable";
import SeatResetDialog from "./SeatResetDialog";
import type { CardCatalog } from "../types/catalog";
import { SESSION_PHASE_ORDER, type Session } from "../types/session";
import "./lb-components.css";
import "./FacilitatorConsole.css";

interface Props {
  code: string;
  session: Session;
}

/**
 * Design step 2: the Facilitator's action screen, restyled to the
 * approved wide (1920px design, 1280px+ floor) mockup -- a River Blue top
 * bar (logo, phase indicator, Main Game clock, Challenge-due badge,
 * Activity, Open Public View, Seat reset, Next Phase) over a two-column
 * body: a fluid Tables grid and a fixed 640px sticky Challenge Cards
 * panel. Visual/layout change only -- every write action (triggerChallenge,
 * advancePhase, rollForChair, seat reset, computeAndStoreFinalScores,
 * persistGameResults, clearSessionData) is untouched, only where its
 * control lives on screen.
 */
function FacilitatorConsole({ code, session }: Props) {
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState<CardCatalog | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [rolling, setRolling] = useState<string | null>(null);
  const [rollError, setRollError] = useState<string | null>(null);
  const [selectedChallengeId, setSelectedChallengeId] = useState<string | null>(null);
  const [triggeringCommissionId, setTriggeringCommissionId] = useState<string | null>(null);
  const [rerollingUid, setRerollingUid] = useState<string | null>(null);
  const [resultsError, setResultsError] = useState<string | null>(null);
  const [advancingPhase, setAdvancingPhase] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);
  const [seatResetOpen, setSeatResetOpen] = useState(false);
  const [lastChallengeNotice, setLastChallengeNotice] = useState<{ commissionId: string; text: string } | null>(null);

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
  const facilitatorActivity = catalog ? buildFacilitatorActivity(session.commissions ?? {}, catalog, session.participants) : [];
  const phaseIdx = SESSION_PHASE_ORDER.indexOf(session.phase);
  const isLastPhase = phaseIdx === SESSION_PHASE_ORDER.length - 1;
  const phaseBuckets = buildPhaseIndicator(session.phase);

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
    if (advancingPhase) return;
    setAdvancingPhase(true);
    try {
      await advancePhase(code, session.phase);
    } finally {
      setAdvancingPhase(false);
    }
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
      const tableName = session.commissions[commissionId]?.name ?? `Table ${commissionId}`;
      setLastChallengeNotice({ commissionId, text: `Sent to ${tableName}` });
      setTimeout(() => setLastChallengeNotice(null), 4000);
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

  /**
   * Phase 8.3: deletes the ephemeral RTDB session data only -- the
   * Firestore gameResults record (already confirmed saved via
   * resultsPersisted above) is a separate store this never touches.
   * Gated on resultsPersisted in the UI, since the RTDB rule itself
   * can't verify a Firestore write succeeded -- only that phase is
   * 'debrief'. Navigates home afterward since this session no longer
   * exists to render.
   */
  async function handleClearSession() {
    if (!window.confirm(`End and clear session ${code}? This permanently deletes the live session data (ledgers, decisions, everyone's progress). The saved final results are NOT affected. This cannot be undone.`)) {
      return;
    }
    setClearing(true);
    setClearError(null);
    try {
      await clearSessionData(code);
      navigate("/");
    } catch (err) {
      setClearError(err instanceof Error ? err.message : String(err));
    } finally {
      setClearing(false);
    }
  }

  /**
   * Opens the Public View in a new tab, same browser -- so it shares
   * this device's existing anonymous sign-in and RTDB read access with
   * no rules change (see PublicView.tsx for the facilitatorId check that
   * makes this the right tab/browser). The Facilitator drags that new
   * window onto the projector.
   */
  function handleOpenPublicView() {
    window.open(`/display/${code}`, "_blank", "noopener");
  }

  // Loose != null deliberately also catches undefined -- RTDB prunes an unset nextChallengeDue to "key absent," same reasoning as useCountdown's own comment.
  const challengeReminderDue =
    session.phase === "mainGame" && clock.nextChallengeDue != null && (nextChallengeMs ?? 0) <= 0;

  return (
    <div className="fc">
      <h1 className="lb-visually-hidden">Facilitator Console — {code}</h1>

      <div className="ftop">
        <img className="lg" src="/assets/logo.png" alt="Let's Balance!" />
        <div className="tl">
          <span>Facilitator Console</span>
          <b>Session {code}</b>
        </div>
        <div className="phases" aria-label={`Phase: ${phaseBuckets.find((b) => b.status === "now")?.label}`}>
          {phaseBuckets.map((bucket) => (
            <span key={bucket.label} className={bucket.status === "now" ? "now" : bucket.status === "done" ? "done" : undefined}>
              {bucket.label}
            </span>
          ))}
        </div>
        <div className="rt">
          {session.phase === "rankPriorities" && phaseTimerMs !== null && (
            <div className="st2">
              <span>Rank Priorities time remaining</span>
              <b>{formatClock(phaseTimerMs)}</b>
            </div>
          )}
          {session.phase === "mainGame" && mainGameMs !== null && (
            <div className="st2">
              <span>Main Game time remaining</span>
              <b>{mainGameMs > 0 ? formatClock(mainGameMs) : "Time's up"}</b>
            </div>
          )}
          {challengeReminderDue && (
            <span className="due">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                <circle cx="12" cy="13" r="8" />
                <path d="M12 9v4l3 2M9 2h6" />
              </svg>
              Challenge due
            </span>
          )}
          <ActivityFeedButton
            entries={facilitatorActivity}
            storageKey={`activity-feed-last-seen:${code}:facilitator:${session.facilitatorId}`}
            showTableName
          />
          <button type="button" className="fb" onClick={handleOpenPublicView}>
            <img src={uiIconUrl("public-sentiment")} alt="" style={{ width: 22, height: 22 }} />
            Open Public View
          </button>
          <button type="button" className="fb quiet" onClick={() => setSeatResetOpen(true)} disabled={session.phase === "debrief"}>
            Seat reset
          </button>
          <button type="button" className="fb solid" onClick={() => void handleNextPhase()} disabled={isLastPhase || blockedOnChair || advancingPhase}>
            {isLastPhase ? "Session Complete" : "Next Phase →"}
          </button>
        </div>
      </div>

      {seatResetOpen && <SeatResetDialog code={code} session={session} onClose={() => setSeatResetOpen(false)} />}

      <div className="fc-banner-stack">
        {reachedRollForChair && missingChairTables.length > 0 && (
          <div className="roll-panel">
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
                  <div key={id} className="roll-panel__table">
                    <h3 style={{ fontSize: 16 }}>{c.name ?? `Table ${id} (unnamed)`}</h3>
                    <button type="button" className="btn primary sm" onClick={() => void handleRoll(id)} disabled={rolling === id || commissionerUids.length === 0}>
                      {rolling === id ? "Rolling…" : "Roll for Chair"}
                    </button>
                    {commissionerUids.length === 0 && (
                      <p style={{ color: "var(--lb-red)", margin: 0, fontSize: 13 }}>
                        No Commissioners have joined this table yet -- at least one is needed to roll.
                      </p>
                    )}
                    {c.chairRoll && (
                      <div className="roll-panel__rolls">
                        {Object.entries(c.chairRoll).map(([uid, roll]) => (
                          <span key={uid}>
                            {session.participants[uid]?.name ?? uid}: {roll}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            {rollError && <p style={{ color: "var(--lb-red)", margin: 0 }}>{rollError}</p>}
          </div>
        )}

        {catalogError && <p style={{ color: "var(--lb-red)" }}>{catalogError}</p>}

        {session.phase === "debrief" && catalog && (
          <div className="panel" style={{ textAlign: "left" }}>
            {resultsPersisted && <p style={{ margin: 0, fontWeight: 700 }}>✅ Final results saved.</p>}
            {resultsError && <p style={{ color: "var(--lb-red)", margin: 0 }}>Could not save final results: {resultsError}</p>}
            {resultsPersisted && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button type="button" className="btn primary sm" onClick={() => void handleClearSession()} disabled={clearing} style={{ alignSelf: "flex-start" }}>
                  {clearing ? "Clearing…" : "End & Clear Session"}
                </button>
                <p style={{ margin: 0, fontSize: 13, color: "var(--lb-muted)" }}>
                  Deletes the live session data once everyone's done. The saved final results stay in place.
                </p>
                {clearError && <p style={{ color: "var(--lb-red)", margin: 0 }}>{clearError}</p>}
              </div>
            )}
          </div>
        )}

        {session.phase === "debrief" &&
          catalog &&
          (commissionEntries.length > 1 ? (
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
          ))}
      </div>

      <div className="fbody">
        <div>
          <div className="fh">
            <h2>Tables</h2>
          </div>
          <div className="tgrid">
            {commissionEntries.map(([id, commission]) => (
              <FacilitatorTableCard
                key={id}
                commissionId={id}
                commission={commission}
                session={session}
                catalog={catalog}
                speakers={speakers.filter((s) => s.commissionId === id)}
                selectedChallengeId={selectedChallengeId}
                pushing={triggeringCommissionId === id}
                pushNotice={lastChallengeNotice?.commissionId === id ? lastChallengeNotice.text : null}
                onPushChallenge={handleTriggerChallenge}
                rerollingUid={rerollingUid}
                onReroll={handleReroll}
              />
            ))}
          </div>
        </div>

        {session.phase === "mainGame" && catalog && (
          <div className="cp">
            <div className="ph3">
              <h2>Challenge Cards</h2>
              <p>Pushing a Challenge applies its dollar impact immediately. Challenges can't be debated or declined.</p>
            </div>
            <div className="cr-scroll">
              <div className="cr h">
                <span></span>
                <span></span>
                <span>Title</span>
                <span>Facilitator narrative</span>
                <span>Budget effect</span>
              </div>
              {catalog.challengeCards.map((card) => {
                const selected = selectedChallengeId === card.id;
                return (
                  <label key={card.id} className={`cr${selected ? " sel" : ""}`}>
                    <input
                      type="radio"
                      name="challenge"
                      checked={selected}
                      onChange={() => setSelectedChallengeId(card.id)}
                      aria-label={card.title}
                    />
                    <CardIcon cardId={card.id} cardType="challenge" className="ic" />
                    <b>{card.title}</b>
                    <span className="nv">{card.facilitatorNarrative}</span>
                    <BudgetEffectLabel label={getChallengeLedgerEffect(card).label} />
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default FacilitatorConsole;
