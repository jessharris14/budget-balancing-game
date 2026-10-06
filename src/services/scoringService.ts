import { getPublicTrustTier, getPublicTrustTierPoints, getReserveTier, getReserveTierPoints } from "./ledgerService";
import type { CommissionLedger, CommissionPriority, FinalScore } from "../types/session";

/** computeFinalScore's return value, deliberately without `computedAt` -- a wall-clock timestamp would make the function non-deterministic and harder to unit-test. The caller attaches it when actually writing the result (see computeAndStoreFinalScores in facilitatorService.ts). */
export type ScoreBreakdown = Omit<FinalScore, "computedAt">;

/**
 * Authoritative end-of-game scoring (spec Section 6), Phase 7 B1. A
 * single pure function -- no Firebase imports, no side effects -- so it
 * can be unit-tested directly and, if this project ever moves to the
 * Blaze plan, lifted into a Cloud Function with no logic changes (see
 * computeAndStoreFinalScores in facilitatorService.ts for why this
 * currently runs client-side instead).
 *
 * Reuses getReserveTier/getReserveTierPoints and getPublicTrustTier/
 * getPublicTrustTierPoints from ledgerService.ts rather than
 * reimplementing the tier boundaries -- those already exist for exactly
 * this purpose (their own doc comments say so) and already back the live
 * in-game indicators, so the live numbers and the final score can never
 * disagree about where a boundary falls.
 *
 * priority.funded is read as-is: it's already the live-updated final
 * state (ledgerService's syncPriorityFunded flips it the instant the
 * linked card is applied OR reconsidered), so a Priority that was funded
 * and then reconsidered correctly scores as unfunded without this
 * function needing to know anything about decisionsLog history itself.
 */
export function computeFinalScore(
  ledger: CommissionLedger,
  priority: CommissionPriority,
  publicTrustTally: number,
): ScoreBreakdown {
  const balancedPoints = ledger.deficitOrSurplus === 0 ? 1 : 0;
  const balanced = {
    points: balancedPoints,
    reason:
      ledger.deficitOrSurplus === 0
        ? "Balanced (Revenue = Expenditures)"
        : `Not balanced (${ledger.deficitOrSurplus > 0 ? "surplus" : "deficit"} of $${Math.abs(ledger.deficitOrSurplus)}) -> 0`,
  };

  const priorityFundedPoints = priority.funded ? 1 : 0;
  const priorityFunded = {
    points: priorityFundedPoints,
    reason: priority.funded ? "Priority funded -> +1" : "Priority not funded -> 0",
  };

  const reserveTier = getReserveTier(ledger.reserves);
  const reservePoints = getReserveTierPoints(reserveTier);
  const reserves = {
    points: reservePoints,
    reason: `Reserves $${ledger.reserves} -> ${reservePoints >= 0 ? "+" : ""}${reservePoints}`,
  };

  const trustTier = getPublicTrustTier(publicTrustTally);
  const trustPoints = getPublicTrustTierPoints(trustTier);
  const publicTrust = {
    points: trustPoints,
    reason: `Public Trust ${publicTrustTally >= 0 ? "+" : ""}${publicTrustTally} (${trustTier}) -> ${trustPoints >= 0 ? "+" : ""}${trustPoints}`,
  };

  const total = balancedPoints + priorityFundedPoints + reservePoints + trustPoints;

  return { balanced, priorityFunded, reserves, publicTrust, total };
}
