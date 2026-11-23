import { useEffect, useState, type ReactNode } from "react";
import { buildCommissionActivity } from "../services/activityFeed";
import { getCatalog } from "../services/catalogService";
import { useIsDesktop } from "../hooks/useIsDesktop";
import {
  recordCommissionPriority,
  setChairHighlightedCard,
  startDebateTimer,
  stopDebateTimer,
} from "../services/chairService";
import { getCardLedgerLabel } from "../services/challengeLedgerEffect";
import type { CardDisplayItem } from "../services/cardDisplay";
import { isCardAvailable, type CardType } from "../services/ledgerService";
import { clearMotion, isMotionLocked, signalMotion, signalSecond } from "../services/motionService";
import { formatDuration, useCountdown } from "../hooks/useCountdown";
import AppliedChallengesPanel from "./AppliedChallengesPanel";
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
  isMyChair: boolean;
  myUid: string;
}

/**
 * Commissioner (and, if elected, Chair) view. Per spec Section 8a #2/#3:
 * Commissioners get the full Revenue/Expenditure catalog to browse
 * read-only (no apply/reconsider -- that stays exclusive to the
 * Manager/Administrator) plus the universal status bar and decisions log.
 * The Chair additionally gets two live controls -- highlighting a card as
 * "currently under debate" and running the debate timer -- but records no
 * vote outcome of any kind and doesn't gate the Manager/Administrator's own
 * apply/reconsider actions. During Main Game, any Commissioner can also
 * signal a motion/second (Phase 6 #1) -- a lightweight, non-gating signal,
 * same trust model as everything else here.
 *
 * Design step 1: visually restyled to the approved look (RoleHeaderBar/
 * CardUnderDebateBar, BudgetTiles/BalanceTrack, the new PublicTrustGauge/
 * PriorityPanel, StatusChip/BudgetEffectChip, and CardsSection's Swipe/
 * List catalog) -- every field, control, and rule above is unchanged.
 */
function CommissionerView({ code, session, commissionId, commission, isMyChair, myUid }: Props) {
  const [catalog, setCatalog] = useState<CardCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [motionBusyCardId, setMotionBusyCardId] = useState<string | null>(null);
  const isDesktop = useIsDesktop();

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

  const clock = session.clock ?? { phaseTimer: null, mainGameTimer: null, nextChallengeDue: null };
  const phaseTimerMs = useCountdown(clock.phaseTimer);
  const mainGameMs = useCountdown(clock.mainGameTimer);

  useEffect(() => {
    setSelectedCardId(commission.chairHighlightedCardId ?? "");
  }, [commission.chairHighlightedCardId]);

  // The moment a motion has both a mover and a seconder, auto-highlight
  // that card as "Card Under Debate" -- no separate manual step for the
  // Chair. Unlike the original version of this effect, the motion itself
  // is NOT cleared here anymore: keeping it around (with movedBy/
  // secondedBy intact) through the whole debate is what lets the Card
  // Under Debate panel fold "Moved by X, seconded by Y" into its own
  // display instead of needing a second, separate Pending Motion panel to
  // stay visible alongside it (Change 1's duplicate-panel fix). The
  // motion is cleared later, at actual resolution -- Motion Passes
  // (applyCard), Motion Fails, or a Ballot Measure resolving either way --
  // not at promotion time. Only ever runs on the Chair's own client,
  // since chairHighlightedCardId is writable by the Chair (or the
  // Manager/Administrator) per RTDB rules, and only writes when the
  // highlight doesn't already match, so it can't fight a manual dropdown
  // change. A table that skips motion/second and highlights verbally
  // instead never produces a seconded motion, so this never interferes
  // with that fallback.
  useEffect(() => {
    if (!isMyChair) return;
    const activeMotion = commission.activeMotion;
    if (!activeMotion?.secondedBy) return;
    if (commission.chairHighlightedCardId === activeMotion.cardId) return;
    void setChairHighlightedCard(code, commissionId, activeMotion.cardId);
  }, [
    isMyChair,
    commission.activeMotion?.cardId,
    commission.activeMotion?.secondedBy,
    commission.chairHighlightedCardId,
    code,
    commissionId,
  ]);

  // The debate is over once the highlighted card is actually applied --
  // clear Card Under Debate automatically rather than leaving it to show
  // an already-decided card until the Chair notices and clicks Clear.
  // Only ever runs on the Chair's own client (same write-access reason as
  // above); applyCard already clears a matching activeMotion on its own
  // (it has legitimate write access there), so this only needs to handle
  // the highlight side.
  useEffect(() => {
    if (!isMyChair) return;
    const highlighted = commission.chairHighlightedCardId;
    if (!highlighted) return;
    if (!commission.cardsInPlay?.[highlighted]) return;
    void setChairHighlightedCard(code, commissionId, null);
  }, [isMyChair, commission.chairHighlightedCardId, commission.cardsInPlay, code, commissionId]);

  if (error && !catalog) return <p className="lb-screen lb-pad error">{error}</p>;
  if (!catalog) return <p className="lb-screen lb-pad">Loading catalog…</p>;

  const highlightedCard = commission.chairHighlightedCardId
    ? (catalog.revenueCards.find((c) => c.id === commission.chairHighlightedCardId) ??
      catalog.expenditureCards.find((c) => c.id === commission.chairHighlightedCardId))
    : null;
  const highlightedCardType: CardType | null = commission.chairHighlightedCardId
    ? (catalog.revenueCards.some((c) => c.id === commission.chairHighlightedCardId) ? "revenue" : "expenditure")
    : null;
  const highlightedEffect =
    highlightedCard && highlightedCardType
      ? getCardLedgerLabel(highlightedCardType, highlightedCard.amount, highlightedCard.direction)
      : null;

  const chairName = commission.members?.chairId
    ? (session.participants[commission.members.chairId]?.name ?? commission.members.chairId)
    : null;

  const tableName = commission.name ?? `Table ${commissionId}`;
  const activityEntries = buildCommissionActivity(commission, catalog, session.participants);

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
  const locked = isMotionLocked(commission);
  // The "Moved by X, seconded by Y" line folded into Card Under Debate
  // (Change 1): only once the motion that produced this specific
  // highlighted card has actually been seconded -- an unseconded motion
  // still gets its own Pending Motion panel below, and a table that
  // skips motion/second and highlights verbally has no motion to show at
  // all, so this line simply doesn't render for them.
  const showMotionProvenance = !!motion?.secondedBy && motion.cardId === commission.chairHighlightedCardId;

  async function handleHighlight(cardId: string) {
    setBusy(true);
    setError(null);
    try {
      await setChairHighlightedCard(code, commissionId, cardId || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleStartTimer() {
    setBusy(true);
    try {
      await startDebateTimer(code, commissionId, session.settings.debateTimerMinutes);
    } finally {
      setBusy(false);
    }
  }

  async function handleStopTimer() {
    setBusy(true);
    try {
      await stopDebateTimer(code, commissionId);
    } finally {
      setBusy(false);
    }
  }

  async function handleSelectPriority(cardId: string) {
    setBusy(true);
    try {
      await recordCommissionPriority(code, commissionId, cardId);
    } finally {
      setBusy(false);
    }
  }

  async function handleMotion(cardId: string, cardType: CardType) {
    setMotionBusyCardId(cardId);
    setError(null);
    try {
      const result = await signalMotion(code, commissionId, cardId, cardType);
      if (!result.ok) setError(result.reason ?? "Could not move to adopt that card.");
    } finally {
      setMotionBusyCardId(null);
    }
  }

  async function handleSecond() {
    setBusy(true);
    setError(null);
    try {
      const result = await signalSecond(code, commissionId);
      if (!result.ok) {
        const name = result.alreadySecondedBy
          ? (session.participants[result.alreadySecondedBy]?.name ?? result.alreadySecondedBy)
          : null;
        setError(name ? `Already seconded by ${name}.` : (result.reason ?? "Could not second that motion."));
      }
    } finally {
      setBusy(false);
    }
  }

  /**
   * Phase 7 A3: resets a motion that moved but never got a second --
   * Chair-only, and only while unseconded (enforced both by the button's
   * own render condition below and, more importantly, by the activeMotion
   * RTDB rule itself). Replaces the old generic "Clear" button, which used
   * to be available to the mover too and at any seconded state; once
   * seconded, resolution is exclusively the Administrator's Motion
   * Passes/Fails now, so a manual clear option there would just be a
   * second, overlapping control.
   */
  async function handleResetUnsecondedMotion() {
    setBusy(true);
    try {
      if (isMyChair && motion && commission.chairHighlightedCardId === motion.cardId) {
        await setChairHighlightedCard(code, commissionId, null);
      }
      await clearMotion(code, commissionId);
    } finally {
      setBusy(false);
    }
  }

  /**
   * Shared Motion/Second action for the Cards section -- Main Game only,
   * and only for cards not already played or locked out (status chip
   * already says why otherwise, so no action renders). Change 1: "I move
   * to adopt" disappears from every OTHER card for every Commissioner and
   * the Chair for as long as isMotionLocked is true -- not just while a
   * motion is pending unseconded, but for the whole debate through Card
   * Under Debate and any Ballot Measure. Design step 1: that locked state
   * now shows a disabled "Motion in progress" button instead of nothing,
   * per the brief -- the RULE for when a real "I move to adopt" shows is
   * unchanged.
   */
  function renderCardAction(item: CardDisplayItem): ReactNode {
    if (session.phase !== "mainGame") return null;
    if (!isCardAvailable(commission, item.cardId)) return null;
    if (motion?.cardId === item.cardId) {
      if (!motion.secondedBy && motion.movedBy !== myUid) {
        return (
          <button type="button" className="btn primary sm" onClick={handleSecond} disabled={busy}>
            Second
          </button>
        );
      }
      return <span className="st">Motioned</span>;
    }
    if (locked) {
      return (
        <button type="button" className="btn off sm" disabled>
          Motion in progress
        </button>
      );
    }
    return (
      <button
        type="button"
        className="btn primary sm"
        onClick={() => handleMotion(item.cardId, item.cardType)}
        disabled={motionBusyCardId === item.cardId}
      >
        {motionBusyCardId === item.cardId ? "Motioning…" : "I move to adopt"}
      </button>
    );
  }

  // Desktop (screens 11/13): the Main Game time/Chair stats move into the
  // header's one row instead of this small-panels grid. Chair always shows
  // something (falls back to "Not yet elected"), matching the body's own
  // fallback text below -- so the header never shows just one stat when it
  // has room for two.
  const headerMainGameLabel = session.phase === "mainGame" && mainGameMs !== null ? formatDuration(mainGameMs) : undefined;
  const headerChairName = `${chairName ?? "Not yet elected"}${isMyChair ? " (you)" : ""}`;

  const tilesPanel = !isDesktop && (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
      {session.phase === "mainGame" && mainGameMs !== null && (
        <div className="panel" style={{ padding: "10px 14px", gap: "4px" }}>
          <span className="eyebrow">Main Game time remaining</span>
          <b style={{ font: "800 22px/1 var(--lb-f-head)", fontVariantNumeric: "tabular-nums" }}>{formatDuration(mainGameMs)}</b>
        </div>
      )}
      <div className="panel" style={{ padding: "10px 14px", gap: "4px" }}>
        <span className="eyebrow">Chair</span>
        <b style={{ font: "800 22px/1 var(--lb-f-head)" }}>
          {chairName ?? "Not yet elected"}
          {isMyChair && " (you)"}
        </b>
      </div>
    </div>
  );

  const ledgerBlock = <LedgerStatusBar ledger={commission.ledger} />;
  const trustBlock = <PublicTrustGauge publicTrustTally={commission.publicTrustTally} speakerCount={speakerCount} />;
  const priorityBlock = session.phase === "mainGame" && (
    <PriorityTile priority={commission.priority} priorityCards={catalog.priorityCards} catalog={catalog} />
  );
  const challengesBlock = <AppliedChallengesPanel commission={commission} catalog={catalog} />;

  // Change 1: Pending Motion only shows while this motion hasn't been
  // seconded yet -- once it has, Card Under Debate takes over as the
  // single place showing this card.
  const pendingMotionBlock = session.phase === "mainGame" && motion && !motion.secondedBy && (
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
      {motion.movedBy !== myUid && (
        <button type="button" className="btn primary sm" onClick={handleSecond} disabled={busy}>
          Second
        </button>
      )}
      {isMyChair && (
        <>
          <p style={{ color: "var(--lb-muted)", fontSize: "13px" }}>No second? As Chair, you decide when to move on.</p>
          <button type="button" className="btn ghost sm" onClick={() => void handleResetUnsecondedMotion()} disabled={busy}>
            No Second — Reset Motion
          </button>
        </>
      )}
    </div>
  );

  const debateBlock = (
    <div className="lb-debate-panel">
      <span className="eyebrow">Card Under Debate</span>
      {isMyChair ? (
        <>
          <select className="field inp" value={selectedCardId} onChange={(e) => handleHighlight(e.target.value)} disabled={busy || locked}>
            <option value="">— none highlighted —</option>
            <optgroup label="Revenue">
              {catalog.revenueCards.map((card) => (
                <option key={card.id} value={card.id}>
                  {card.title} — {getCardLedgerLabel("revenue", card.amount, card.direction).label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Expenditure">
              {catalog.expenditureCards.map((card) => (
                <option key={card.id} value={card.id}>
                  {card.title} — {getCardLedgerLabel("expenditure", card.amount, card.direction).label}
                </option>
              ))}
            </optgroup>
          </select>
          {highlightedEffect && <BudgetEffectLabel label={highlightedEffect.label} />}
          {locked && (
            <p style={{ color: "var(--lb-muted)", fontSize: "13px" }}>
              Debate in progress — resolve it (Motion Passes/Fails, or the Ballot Measure) before picking a different card.
            </p>
          )}
          {showMotionProvenance && (
            <p style={{ fontSize: "13px" }}>
              Moved by {moverName}, seconded by {seconderName}
            </p>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
            <button type="button" className="btn ghost sm" onClick={handleStartTimer} disabled={busy}>
              {commission.debateTimerEndsAt !== null ? "Restart Timer" : "Start Timer"}
            </button>
            <button type="button" className="btn ghost sm" onClick={handleStopTimer} disabled={busy || commission.debateTimerEndsAt === null}>
              Stop Timer
            </button>
          </div>
        </>
      ) : (
        <>
          {highlightedCard ? (
            <h3 style={{ fontSize: "17px" }}>{highlightedCard.title}</h3>
          ) : (
            <p style={{ color: "var(--lb-muted)" }}>No card under debate.</p>
          )}
          {highlightedEffect && <BudgetEffectLabel label={highlightedEffect.label} />}
          {showMotionProvenance && (
            <p style={{ fontSize: "13px" }}>
              Moved by {moverName}, seconded by {seconderName}
            </p>
          )}
        </>
      )}
    </div>
  );

  const ballotBlock = <BallotMeasuresList commission={commission} catalog={catalog} />;
  const legendBlock = <CardStatusLegend />;
  const cardsBlock = <CardsSection catalog={catalog} commission={commission} defaultView={isMyChair ? "list" : "swipe"} renderAction={renderCardAction} />;

  return (
    <div className="lb-screen">
      <RoleHeaderBar
        viewLabel={isMyChair ? "Chair View" : "Commissioner View"}
        shortRoleLabel={isMyChair ? "Chair" : "Commissioner"}
        tableName={tableName}
        code={code}
        phaseLabel={SESSION_PHASE_LABELS[session.phase] ?? session.phase}
        activityEntries={activityEntries}
        activityStorageKey={`activity-feed-last-seen:${code}:${commissionId}:${myUid}`}
        mainGameLabel={headerMainGameLabel}
        chairName={session.phase === "debrief" ? undefined : headerChairName}
      />
      {session.phase !== "debrief" && commission.chairHighlightedCardId && highlightedCard && highlightedEffect && (
        <CardUnderDebateBar
          cardTitle={highlightedCard.title}
          budgetEffectLabel={highlightedEffect.label}
          debateTimerEndsAt={commission.debateTimerEndsAt}
        />
      )}
      <h1 className="lb-visually-hidden">
        {isMyChair ? "Chair" : "Commissioner"} View — {tableName} — {code}
      </h1>

      <div className="lb-pad">
        {error && <p style={{ color: "var(--lb-red)" }}>{error}</p>}

        {session.phase === "rankPriorities" && (
          <div className="panel">
            <h3>Rank Priorities</h3>
            {phaseTimerMs !== null && <p>Time remaining: {formatDuration(phaseTimerMs)}</p>}
            {isMyChair ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {catalog.priorityCards.map((card) => {
                  const selected = commission.priority?.selectedCardId === card.id;
                  return (
                    <label key={card.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: "normal" }}>
                      <input type="radio" name="priority" checked={selected} disabled={busy} onChange={() => handleSelectPriority(card.id)} />
                      {card.title} — {card.description}
                      {selected && <span style={{ color: "var(--lb-forest)", fontWeight: 700 }}> ✓ Selected</span>}
                    </label>
                  );
                })}
              </div>
            ) : (
              <ul style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {catalog.priorityCards.map((card) => {
                  const selected = commission.priority?.selectedCardId === card.id;
                  return (
                    <li key={card.id} style={selected ? { color: "var(--lb-forest)", fontWeight: 700 } : undefined}>
                      {card.title} — {card.description}
                      {selected && " ✓ Selected"}
                    </li>
                  );
                })}
              </ul>
            )}
            <p style={{ fontWeight: 700 }}>
              Selected:{" "}
              {commission.priority?.selectedCardId
                ? (catalog.priorityCards.find((c) => c.id === commission.priority?.selectedCardId)?.title ??
                  commission.priority.selectedCardId)
                : "not yet recorded by the Chair"}
            </p>
          </div>
        )}

        {session.phase === "debrief" ? (
          <DebriefScorecard commission={commission} catalog={catalog} speakerCount={speakerCount} />
        ) : isDesktop ? (
          <div className="dbody">
            <div className="dcol sticky">
              {ledgerBlock}
              {trustBlock}
              {priorityBlock}
              {challengesBlock}
              {pendingMotionBlock}
              {debateBlock}
            </div>
            <div className="dcol">
              {ballotBlock}
              {legendBlock}
              {cardsBlock}
            </div>
          </div>
        ) : (
          <>
            {tilesPanel}
            {ledgerBlock}
            {trustBlock}
            {priorityBlock}
            {challengesBlock}
            {pendingMotionBlock}
            {debateBlock}
            {ballotBlock}
            {legendBlock}
            {cardsBlock}
          </>
        )}
      </div>
    </div>
  );
}

export default CommissionerView;
