import { useEffect, useState, type ReactNode } from "react";
import { buildCommissionActivity } from "../services/activityFeed";
import { getCatalog } from "../services/catalogService";
import { createBallotMeasure, isMillageCard } from "../services/ballotService";
import { stopDebateTimer } from "../services/chairService";
import { getCardLedgerLabel } from "../services/challengeLedgerEffect";
import type { CardDisplayItem } from "../services/cardDisplay";
import {
  applyCard,
  applyChairFreeCard,
  isCardAvailable,
  reconsiderCard,
  resolveMotionFails,
  type CardType,
} from "../services/ledgerService";
import { isMotionLocked } from "../services/motionService";
import { formatDuration, useCountdown } from "../hooks/useCountdown";
import AppliedChallengesPanel from "./AppliedChallengesPanel";
import BallotMeasureModal from "./BallotMeasureModal";
import BallotMeasuresList from "./BallotMeasuresList";
import BudgetEffectLabel from "./BudgetEffectLabel";
import CardsSection from "./CardsSection";
import CardUnderDebateBar from "./CardUnderDebateBar";
import CardStatusLegend from "./CardStatusLegend";
import DebriefScorecard from "./DebriefScorecard";
import LedgerStatusBar from "./LedgerStatusBar";
import PriorityTile from "./PriorityTile";
import PublicTrustGauge from "./PublicTrustGauge";
import RoleHeaderBar from "./RoleHeaderBar";
import type { CardCatalog } from "../types/catalog";
import { SESSION_PHASE_LABELS, type Commission, type Session } from "../types/session";
import "./lb-components.css";

interface Props {
  code: string;
  session: Session;
  commissionId: string;
  commission: Commission;
}

/**
 * Design step 1: visually restyled to the approved look. Every control,
 * write path, and rule is unchanged from before this round -- apply,
 * Reconsider, Priority funding, and Motion Passes/Fails all still go
 * through the exact same functions, just restyled with the shared
 * components (CardsSection defaults to List here, "they need the
 * overview," but Swipe is fully wired too -- see the delivery notes).
 */
function ManagerConsole({ code, session, commissionId, commission }: Props) {
  const [catalog, setCatalog] = useState<CardCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyCardId, setBusyCardId] = useState<string | null>(null);
  const [resolvingCardId, setResolvingCardId] = useState<string | null>(null);
  const [freeCardChoice, setFreeCardChoice] = useState<{ type: CardType; id: string } | null>(null);
  // Tracks the last ballot that was active, so the modal can keep showing
  // its final result after activeBallotId clears back to null on
  // resolution -- the ballot record itself (and so the result shown)
  // still comes entirely from server state, this just remembers which
  // one to keep looking up until the Administrator dismisses it.
  const [lastBallotId, setLastBallotId] = useState<string | null>(null);
  const [ballotDismissed, setBallotDismissed] = useState(false);

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

  // Hooks must run unconditionally, before the "still loading the catalog"
  // early return below.
  const clock = session.clock ?? { phaseTimer: null, mainGameTimer: null, nextChallengeDue: null };
  const phaseTimerMs = useCountdown(clock.phaseTimer);
  const mainGameMs = useCountdown(clock.mainGameTimer);

  useEffect(() => {
    if (commission.activeBallotId && commission.activeBallotId !== lastBallotId) {
      setLastBallotId(commission.activeBallotId);
      setBallotDismissed(false);
    }
  }, [commission.activeBallotId, lastBallotId]);

  async function runAction(cardId: string, action: () => Promise<{ ok: boolean; reason?: string }>) {
    setBusyCardId(cardId);
    setError(null);
    try {
      const result = await action();
      if (!result.ok) setError(result.reason ?? "Action failed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyCardId(null);
    }
  }

  if (error && !catalog) return <p className="lb-screen lb-pad error">{error}</p>;
  if (!catalog) return <p className="lb-screen lb-pad">Loading ledger…</p>;
  const loadedCatalog = catalog;

  const highlightedCardType: CardType | null = commission.chairHighlightedCardId
    ? (catalog.revenueCards.some((c) => c.id === commission.chairHighlightedCardId) ? "revenue" : "expenditure")
    : null;

  /**
   * Applies the card currently under debate via the exact same applyCard
   * used by the catalog table's own per-card buttons -- not a
   * reimplementation. For a millage card, applying it directly would skip
   * the Board's actual decision mechanism for a millage rate: instead of
   * applying it, this opens a Ballot Measure for the room to vote on --
   * the card only actually gets applied if that ballot later passes, via
   * closeBallotMeasure calling this exact same applyCard.
   */
  async function handleMotionPasses() {
    const cardId = commission.chairHighlightedCardId;
    if (!cardId || !highlightedCardType) return;
    setResolvingCardId(cardId);
    try {
      if (isMillageCard(catalog!, highlightedCardType, cardId)) {
        await runAction(cardId, async () => {
          await createBallotMeasure(code, commissionId, highlightedCardType, cardId);
          await stopDebateTimer(code, commissionId);
          return { ok: true };
        });
        return;
      }
      await runAction(cardId, async () => {
        const result = await applyCard(code, commissionId, catalog!, highlightedCardType, cardId);
        if (result.ok) await stopDebateTimer(code, commissionId);
        return result;
      });
    } finally {
      setResolvingCardId(null);
    }
  }

  async function handleMotionFails() {
    const cardId = commission.chairHighlightedCardId;
    if (!cardId || !highlightedCardType) return;
    setResolvingCardId(cardId);
    try {
      await runAction(cardId, () => resolveMotionFails(code, commissionId, cardId, highlightedCardType));
    } finally {
      setResolvingCardId(null);
    }
  }

  // Keeps the Card Under Debate panel (and its buttons' disabled/"Working…"
  // state) showing the SAME card throughout a Motion Passes/Fails
  // resolution, even once the live chairHighlightedCardId has already
  // gone null partway through that resolution's sequence of writes.
  const debateCardId = commission.chairHighlightedCardId ?? resolvingCardId;
  const isResolvingMotion = resolvingCardId !== null;

  const highlightedCard = debateCardId
    ? (catalog.revenueCards.find((c) => c.id === debateCardId) ?? catalog.expenditureCards.find((c) => c.id === debateCardId))
    : null;
  const debateCardType: CardType | null = debateCardId
    ? (catalog.revenueCards.some((c) => c.id === debateCardId) ? "revenue" : "expenditure")
    : null;
  const debateEffect =
    highlightedCard && debateCardType ? getCardLedgerLabel(debateCardType, highlightedCard.amount, highlightedCard.direction) : null;

  // Keeps showing the ballot (including its final result) until the
  // Administrator dismisses it, even after activeBallotId clears back to
  // null on resolution -- see the lastBallotId effect above.
  const visibleBallotId = !ballotDismissed ? lastBallotId : null;
  const visibleBallot = visibleBallotId ? commission.ballotMeasures?.[visibleBallotId] : null;
  const visibleBallotCard = visibleBallot
    ? (visibleBallot.cardType === "revenue"
        ? catalog.revenueCards.find((c) => c.id === visibleBallot.cardId)
        : catalog.expenditureCards.find((c) => c.id === visibleBallot.cardId))
    : undefined;

  const chairName = commission.members?.chairId
    ? (session.participants[commission.members.chairId]?.name ?? commission.members.chairId)
    : null;

  const speakerCount = Object.values(session.publicHearingSpeakers ?? {}).filter(
    (s) => s.commissionId === commissionId,
  ).length;

  const motion = commission.activeMotion;
  const motionCard = motion
    ? (catalog.revenueCards.find((c) => c.id === motion.cardId) ??
      catalog.expenditureCards.find((c) => c.id === motion.cardId))
    : null;
  const moverName = motion ? (session.participants[motion.movedBy]?.name ?? motion.movedBy) : null;
  const seconderName = motion?.secondedBy ? (session.participants[motion.secondedBy]?.name ?? motion.secondedBy) : null;
  const showMotionProvenance = !!motion?.secondedBy && motion.cardId === commission.chairHighlightedCardId;
  /**
   * Change 4: Reconsider is disabled while isMotionLocked (Change 1) is
   * true -- a motion/debate/ballot in progress elsewhere on this
   * Commission's table means the ledger shouldn't also be changing
   * underneath it from a reconsideration at the same moment.
   */
  const reconsiderLocked = isMotionLocked(commission);

  const tableName = commission.name ?? `Table ${commissionId}`;
  const activityEntries = buildCommissionActivity(commission, catalog, session.participants);

  const canUseFreeCard = session.phase === "mainGame" && !commission.chairFreeCardUsed;
  const dollarCards = [
    ...catalog.revenueCards
      .filter((c) => c.amount === 1 && isCardAvailable(commission, c.id))
      .map((c) => ({ type: "revenue" as CardType, id: c.id, title: c.title })),
    ...catalog.expenditureCards
      .filter((c) => c.amount === 1 && isCardAvailable(commission, c.id))
      .map((c) => ({ type: "expenditure" as CardType, id: c.id, title: c.title })),
  ];

  /** The Administrator's only per-card catalog action: Reconsider, shown only on an Applied card. No motion/second controls here -- those stay exclusive to Commissioners. */
  function renderCardAction(item: CardDisplayItem): ReactNode {
    if (item.status !== "applied") return null;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem", alignItems: "flex-end" }}>
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => void runAction(item.cardId, () => reconsiderCard(code, commissionId, loadedCatalog, item.cardId))}
          disabled={reconsiderLocked || busyCardId === item.cardId}
        >
          Reconsider
        </button>
        {reconsiderLocked && <span style={{ fontSize: "11px", color: "var(--lb-muted)" }}>Finish the current motion first.</span>}
      </div>
    );
  }

  return (
    <div className="lb-screen">
      <RoleHeaderBar
        viewLabel="Manager/Administrator View"
        shortRoleLabel="Administrator"
        tableName={tableName}
        code={code}
        phaseLabel={SESSION_PHASE_LABELS[session.phase] ?? session.phase}
        activityEntries={activityEntries}
        activityStorageKey={`activity-feed-last-seen:${code}:${commissionId}:${commission.members?.managerAdminId ?? "admin"}`}
      />
      {session.phase !== "debrief" && debateCardId && highlightedCard && debateEffect && (
        <CardUnderDebateBar cardTitle={highlightedCard.title} budgetEffectLabel={debateEffect.label} debateTimerEndsAt={commission.debateTimerEndsAt} />
      )}
      <h1 className="lb-visually-hidden">
        Manager/Administrator View — {tableName} — {code}
      </h1>

      <div className="lb-pad">
        {error && <p style={{ color: "var(--lb-red)" }}>{error}</p>}

        {session.phase === "debrief" ? (
          <DebriefScorecard commission={commission} catalog={catalog} speakerCount={speakerCount} />
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              {session.phase === "rankPriorities" && phaseTimerMs !== null && (
                <div className="panel" style={{ padding: "10px 14px", gap: "4px" }}>
                  <span className="eyebrow">Rank Priorities time remaining</span>
                  <b style={{ font: "800 22px/1 var(--lb-f-head)", fontVariantNumeric: "tabular-nums" }}>{formatDuration(phaseTimerMs)}</b>
                </div>
              )}
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

            <LedgerStatusBar ledger={commission.ledger} />
            <PublicTrustGauge publicTrustTally={commission.publicTrustTally} speakerCount={speakerCount} />
            {session.phase === "mainGame" && (
              <PriorityTile priority={commission.priority} priorityCards={catalog.priorityCards} catalog={catalog} />
            )}

            <AppliedChallengesPanel commission={commission} catalog={catalog} />

            {/* Change 1: Pending Motion only shows while unseconded; once seconded, Card Under Debate folds the mover/seconder in as one line instead. */}
            {session.phase === "mainGame" && motion && !motion.secondedBy && (
              <div className="panel">
                <h3>Pending Motion</h3>
                <p>
                  {motionCard?.title ?? motion.cardId} — moved by {moverName}
                  {motionCard && (
                    <>
                      {" — "}
                      <BudgetEffectLabel label={getCardLedgerLabel(motion.cardType, motionCard.amount, motionCard.direction).label} />
                    </>
                  )}
                </p>
                <p style={{ color: "var(--lb-muted)" }}>— awaiting second —</p>
              </div>
            )}

            {debateCardId && (
              <div className="lb-debate-panel">
                <span className="eyebrow">Card Under Debate</span>
                <h3 style={{ fontSize: "17px" }}>{highlightedCard?.title ?? debateCardId}</h3>
                {highlightedCard && debateCardType && <BudgetEffectLabel label={getCardLedgerLabel(debateCardType, highlightedCard.amount, highlightedCard.direction).label} />}
                {showMotionProvenance && (
                  <p style={{ fontSize: "13px" }}>
                    Moved by {moverName}, seconded by {seconderName}
                  </p>
                )}
                {/* Once a Ballot Measure has actually been opened for this card, its own modal takes over. Also frozen once Debrief starts. */}
                {session.phase === "mainGame" && !commission.activeBallotId && (
                  <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                    <button type="button" className="btn primary sm" style={{ minWidth: "9rem" }} onClick={() => void handleMotionPasses()} disabled={isResolvingMotion}>
                      {isResolvingMotion ? "Working…" : "Motion Passes"}
                    </button>
                    <button type="button" className="btn ghost sm" style={{ minWidth: "9rem" }} onClick={() => void handleMotionFails()} disabled={isResolvingMotion}>
                      {isResolvingMotion ? "Working…" : "Motion Fails"}
                    </button>
                  </div>
                )}
              </div>
            )}

            {visibleBallot && (
              <BallotMeasureModal
                code={code}
                commissionId={commissionId}
                catalog={catalog}
                card={visibleBallotCard}
                ballot={visibleBallot}
                onDismiss={() => setBallotDismissed(true)}
              />
            )}

            {canUseFreeCard && (
              <div className="panel">
                <h3>Chair's Free Card (one-time, $1 only)</h3>
                <select
                  className="field inp"
                  value={freeCardChoice ? `${freeCardChoice.type}:${freeCardChoice.id}` : ""}
                  onChange={(e) => {
                    const [type, id] = e.target.value.split(":");
                    setFreeCardChoice(type && id ? { type: type as CardType, id } : null);
                  }}
                >
                  <option value="">Select a $1 card…</option>
                  {dollarCards.map((c) => (
                    <option key={`${c.type}:${c.id}`} value={`${c.type}:${c.id}`}>
                      {c.id} — {c.title} ({c.type})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn primary sm"
                  onClick={() =>
                    freeCardChoice &&
                    runAction(freeCardChoice.id, () =>
                      applyChairFreeCard(code, commissionId, catalog, session.phase, freeCardChoice.type, freeCardChoice.id),
                    )
                  }
                  disabled={!freeCardChoice || busyCardId === freeCardChoice.id}
                >
                  Apply Free Card
                </button>
              </div>
            )}

            <BallotMeasuresList commission={commission} catalog={catalog} />

            <CardStatusLegend />

            <CardsSection catalog={catalog} commission={commission} defaultView="list" renderAction={renderCardAction} />
          </>
        )}
      </div>
    </div>
  );
}

export default ManagerConsole;
