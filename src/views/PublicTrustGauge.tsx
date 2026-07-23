import { getPublicTrustTier } from "../services/ledgerService";

interface Props {
  publicTrustTally: number;
  /** Speakers currently assigned to this Commission -- the gauge's scale is 3 * this count (spec Section 8a #6). */
  speakerCount: number;
}

const TIER_LABELS: Record<string, string> = {
  positive: "Positive",
  neutral: "Neutral",
  negative: "Negative",
};

// Diverging pair validated for CVD-safe adjacency (see dataviz skill --
// green/red, this app's convention elsewhere, fails CVD separation hard at
// ~1.7 ΔE under deuteranopia; blue/red clears every check at ~20+ ΔE).
const POSITIVE_COLOR = "#2a78d6";
const NEGATIVE_COLOR = "#e34948";
const NEUTRAL_COLOR = "#9a9992";
const TRACK_COLOR = "#e3e2df";

const CX = 100;
const CY = 100;
const R = 78;
const STROKE_WIDTH = 16;

function polarToCartesian(angleDeg: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CX + R * Math.cos(rad), y: CY - R * Math.sin(rad) };
}

function arcPath(angleStart: number, angleEnd: number): string {
  const start = polarToCartesian(angleStart);
  const end = polarToCartesian(angleEnd);
  const largeArc = Math.abs(angleStart - angleEnd) > 180 ? 1 : 0;
  const sweep = angleStart > angleEnd ? 1 : 0;
  return `M ${start.x} ${start.y} A ${R} ${R} 0 ${largeArc} ${sweep} ${end.x} ${end.y}`;
}

/**
 * Half-circle Public Trust gauge (spec Section 8a #6): scale is this
 * Commission's actual maximum possible magnitude -- 3 lifetime actions per
 * assigned Speaker -- recomputed live as Speakers join. The needle/fill
 * position communicates degree within that range, not just direction;
 * the Positive/Neutral/Negative label still ties to the scoring bucket.
 * Deliberately separate from the Reserve Tier indicator, not crammed next
 * to it (an earlier version placed them confusingly close together).
 */
function PublicTrustGauge({ publicTrustTally, speakerCount }: Props) {
  const maxMagnitude = 3 * speakerCount;
  const hasSpeakers = maxMagnitude > 0;
  const clampedTally = hasSpeakers ? Math.max(-maxMagnitude, Math.min(maxMagnitude, publicTrustTally)) : 0;
  const percent = hasSpeakers ? ((clampedTally + maxMagnitude) / (2 * maxMagnitude)) * 100 : 50;
  const needleAngle = 180 - (percent / 100) * 180;

  const fillColor = clampedTally > 0 ? POSITIVE_COLOR : clampedTally < 0 ? NEGATIVE_COLOR : NEUTRAL_COLOR;
  const fillPath = clampedTally === 0 ? null : clampedTally > 0 ? arcPath(90, needleAngle) : arcPath(needleAngle, 90);
  const needleTip = polarToCartesian(needleAngle);

  const tier = getPublicTrustTier(publicTrustTally);
  const tierLabel = hasSpeakers ? TIER_LABELS[tier] : "No Speakers assigned yet";
  const tallyLabel = hasSpeakers ? (clampedTally >= 0 ? `+${clampedTally}` : `${clampedTally}`) : "—";

  return (
    <div className="public-trust-gauge">
      <h3>Public Trust</h3>
      <svg viewBox="0 0 200 180" role="img" aria-label={`Public Trust: ${tallyLabel} of a possible ±${maxMagnitude}, ${tierLabel}`}>
        <path d={arcPath(180, 0)} fill="none" stroke={TRACK_COLOR} strokeWidth={STROKE_WIDTH} strokeLinecap="round" />
        {fillPath && (
          <path d={fillPath} fill="none" stroke={fillColor} strokeWidth={STROKE_WIDTH} strokeLinecap="round" />
        )}
        {/* Zero tick */}
        <line x1={CX} y1={CY - R - 6} x2={CX} y2={CY - R + 10} stroke="#b5b3ac" strokeWidth={2} />
        {/* Needle-tip marker */}
        <circle cx={needleTip.x} cy={needleTip.y} r={7} fill={fillColor} stroke="#fff" strokeWidth={2} />
        <text x={CX - R} y={CY + 24} textAnchor="middle" className="gauge-pole-label">
          {hasSpeakers ? `-${maxMagnitude}` : "—"}
        </text>
        <text x={CX + R} y={CY + 24} textAnchor="middle" className="gauge-pole-label">
          {hasSpeakers ? `+${maxMagnitude}` : "—"}
        </text>
        <text x={CX} y={CY + 45} textAnchor="middle" className="gauge-tally-readout">
          {tallyLabel}
        </text>
        <text x={CX} y={CY + 65} textAnchor="middle" className="gauge-tier-label">
          {tierLabel}
        </text>
      </svg>
    </div>
  );
}

export default PublicTrustGauge;
