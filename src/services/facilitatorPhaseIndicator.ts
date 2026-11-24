import { SESSION_PHASE_ORDER, type SessionPhase } from "../types/session";

export type PhaseBucketStatus = "done" | "now" | "upcoming";

export interface PhaseBucket {
  label: string;
  status: PhaseBucketStatus;
}

const BUCKET_LABELS = ["Lobby", "Rank Priorities", "Main Game", "Debrief"] as const;

/**
 * The Facilitator Console's top-bar phase indicator groups the session's
 * 8 real phases (SESSION_PHASE_ORDER) into the 4 buckets the mockup shows:
 * everything up through Roll for Chair reads as "Lobby" (there is no
 * separate control for any of those sub-phases here, only the existing
 * Next Phase button), then Rank Priorities, Main Game, and Debrief each
 * get their own segment.
 */
function bucketIndexForPhase(phase: SessionPhase): number {
  const idx = SESSION_PHASE_ORDER.indexOf(phase);
  const rollForChairIdx = SESSION_PHASE_ORDER.indexOf("rollForChair");
  if (idx <= rollForChairIdx) return 0;
  if (phase === "rankPriorities") return 1;
  if (phase === "mainGame") return 2;
  return 3;
}

export function buildPhaseIndicator(phase: SessionPhase): PhaseBucket[] {
  const currentBucket = bucketIndexForPhase(phase);
  return BUCKET_LABELS.map((label, i) => ({
    label,
    status: i < currentBucket ? "done" : i === currentBucket ? "now" : "upcoming",
  }));
}
