import { describe, expect, it } from "vitest";
import { computeFinalScore } from "./scoringService";
import type { CommissionLedger, CommissionPriority } from "../types/session";

function ledger(overrides: Partial<CommissionLedger>): CommissionLedger {
  return { revenue: 100, expenditures: 100, reserves: 15, deficitOrSurplus: 0, ...overrides };
}

function priority(funded: boolean): CommissionPriority {
  return { selectedCardId: "P1", funded };
}

describe("computeFinalScore", () => {
  describe("balanced dimension", () => {
    it("scores +1 when deficitOrSurplus is exactly 0", () => {
      const score = computeFinalScore(ledger({ deficitOrSurplus: 0 }), priority(true), 0);
      expect(score.balanced.points).toBe(1);
    });

    it("scores 0 when $1 off (surplus)", () => {
      const score = computeFinalScore(ledger({ deficitOrSurplus: 1 }), priority(true), 0);
      expect(score.balanced.points).toBe(0);
    });

    it("scores 0 when $1 off (deficit)", () => {
      const score = computeFinalScore(ledger({ deficitOrSurplus: -1 }), priority(true), 0);
      expect(score.balanced.points).toBe(0);
    });
  });

  describe("priority funded dimension", () => {
    it("scores +1 when funded", () => {
      const score = computeFinalScore(ledger({}), priority(true), 0);
      expect(score.priorityFunded.points).toBe(1);
    });

    it("scores 0 when not funded", () => {
      const score = computeFinalScore(ledger({}), priority(false), 0);
      expect(score.priorityFunded.points).toBe(0);
    });

    it("scores 0 for a Priority that was funded and then reconsidered/reversed -- the final funded state is what counts, this function has no notion of history, it only ever reads the current value", () => {
      // Mirrors what ledgerService.syncPriorityFunded would have left behind:
      // funded flipped back to false once the linked card was reconsidered.
      const score = computeFinalScore(ledger({}), priority(false), 0);
      expect(score.priorityFunded.points).toBe(0);
    });
  });

  describe("reserves dimension (boundaries)", () => {
    it("$15 (>= 15) -> +1 (safe)", () => {
      expect(computeFinalScore(ledger({ reserves: 15 }), priority(true), 0).reserves.points).toBe(1);
    });
    it("$20 (>= 15) -> +1 (safe)", () => {
      expect(computeFinalScore(ledger({ reserves: 20 }), priority(true), 0).reserves.points).toBe(1);
    });
    it("$14 (exactly) -> 0 (neutral)", () => {
      expect(computeFinalScore(ledger({ reserves: 14 }), priority(true), 0).reserves.points).toBe(0);
    });
    it("$13 (10-13) -> -1 (warning)", () => {
      expect(computeFinalScore(ledger({ reserves: 13 }), priority(true), 0).reserves.points).toBe(-1);
    });
    it("$10 (10-13) -> -1 (warning)", () => {
      expect(computeFinalScore(ledger({ reserves: 10 }), priority(true), 0).reserves.points).toBe(-1);
    });
    it("$9 (<= 9) -> -2 (critical)", () => {
      expect(computeFinalScore(ledger({ reserves: 9 }), priority(true), 0).reserves.points).toBe(-2);
    });
    it("$0 (<= 9) -> -2 (critical)", () => {
      expect(computeFinalScore(ledger({ reserves: 0 }), priority(true), 0).reserves.points).toBe(-2);
    });
  });

  describe("public trust dimension (boundaries)", () => {
    it("tally +1 (> 0) -> +1 (positive)", () => {
      expect(computeFinalScore(ledger({}), priority(true), 1).publicTrust.points).toBe(1);
    });
    it("tally +2 (> 0) -> +1 (positive)", () => {
      expect(computeFinalScore(ledger({}), priority(true), 2).publicTrust.points).toBe(1);
    });
    it("tally 0 (exactly) -> 0 (neutral)", () => {
      expect(computeFinalScore(ledger({}), priority(true), 0).publicTrust.points).toBe(0);
    });
    it("tally -1 (< 0) -> -1 (negative)", () => {
      expect(computeFinalScore(ledger({}), priority(true), -1).publicTrust.points).toBe(-1);
    });
    it("tally -5 (< 0) -> -1 (negative)", () => {
      expect(computeFinalScore(ledger({}), priority(true), -5).publicTrust.points).toBe(-1);
    });
  });

  describe("total and reasons", () => {
    it("sums all four dimensions", () => {
      const score = computeFinalScore(ledger({ deficitOrSurplus: 0, reserves: 15 }), priority(true), 1);
      expect(score.total).toBe(score.balanced.points + score.priorityFunded.points + score.reserves.points + score.publicTrust.points);
      expect(score.total).toBe(4);
    });

    it("every dimension carries a human-readable reason", () => {
      const score = computeFinalScore(ledger({ reserves: 9 }), priority(false), -3);
      expect(score.balanced.reason).toMatch(/\S/);
      expect(score.priorityFunded.reason).toMatch(/\S/);
      expect(score.reserves.reason).toMatch(/\S/);
      expect(score.publicTrust.reason).toMatch(/\S/);
    });

    // Worked example from the spec round: Revenue $105 / Expenditures $105
    // (balanced), Priority funded, Reserves $12, Public Trust tally +2 ->
    // 1 + 1 + (-1) + 1 = 2.
    it("worked example: balanced + funded + reserves $12 + trust +2 -> total 2", () => {
      const score = computeFinalScore(
        { revenue: 105, expenditures: 105, reserves: 12, deficitOrSurplus: 0 },
        priority(true),
        2,
      );
      expect(score.balanced.points).toBe(1);
      expect(score.priorityFunded.points).toBe(1);
      expect(score.reserves.points).toBe(-1);
      expect(score.publicTrust.points).toBe(1);
      expect(score.total).toBe(2);
    });
  });
});
