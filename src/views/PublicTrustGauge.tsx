import { getPublicTrustTier } from "../services/ledgerService";
import "./lb-components.css";

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
 * assigned Speaker -- recomputed live as Speakers join, same as before
 * this round. Design step 1 restyle: a fixed three-band arc (red left,
 * gray middle, green right -- design tokens, not the old dynamic-fill
 * blue/red pair) with a white knob marking the live position, instead of
 * a colored arc that grew/shrank with the tally. The "No Speakers
 * assigned yet" state (hasSpeakers false) is unchanged: the knob centers
 * and the value/tier read em-dashes, exactly as before.
 */
function PublicTrustGauge({ publicTrustTally, speakerCount }: Props) {
  const maxMagnitude = 3 * speakerCount;
  const hasSpeakers = maxMagnitude > 0;
  const clampedTally = hasSpeakers ? Math.max(-maxMagnitude, Math.min(maxMagnitude, publicTrustTally)) : 0;
  const percent = hasSpeakers ? ((clampedTally + maxMagnitude) / (2 * maxMagnitude)) * 100 : 50;
  const knobAngle = 180 - (percent / 100) * 180;
  const knob = polarToCartesian(knobAngle);

  const tier = getPublicTrustTier(publicTrustTally);
  const tierLabel = hasSpeakers ? TIER_LABELS[tier] : "No Speakers assigned yet";
  const tallyLabel = hasSpeakers ? (clampedTally >= 0 ? `+${clampedTally}` : `${clampedTally}`) : "—";

  return (
    <div className="panel gaugeBox">
      <h3 style={{ fontSize: "16px" }}>Public Trust</h3>
      <svg
        viewBox="0 0 200 112"
        width="220"
        height="123"
        role="img"
        aria-label={`Public Trust: ${tallyLabel} of a possible ±${maxMagnitude}, ${tierLabel}`}
      >
        {/* Fixed three-band track: red (negative third) / gray (neutral third) / green (positive third). */}
        <path d={arcPath(180, 120)} stroke="var(--lb-red)" strokeWidth={STROKE_WIDTH} fill="none" strokeLinecap="round" />
        <path d={arcPath(120, 60)} stroke="var(--lb-gray)" strokeWidth={STROKE_WIDTH} fill="none" />
        <path d={arcPath(60, 0)} stroke="var(--lb-field)" strokeWidth={STROKE_WIDTH} fill="none" strokeLinecap="round" />
        <circle cx={knob.x} cy={knob.y} r={10} fill="#fff" stroke="var(--lb-ink)" strokeWidth={4} />
        <text x={CX - R} y={CY + 11} textAnchor="middle" className="gauge-pole-label">
          {hasSpeakers ? "−" : "—"}
        </text>
        <text x={CX + R} y={CY + 11} textAnchor="middle" className="gauge-pole-label">
          {hasSpeakers ? "+" : "—"}
        </text>
      </svg>
      <div className="gv">{tallyLabel}</div>
      <div className="gauge-tier-label">{tierLabel}</div>
    </div>
  );
}

export default PublicTrustGauge;
