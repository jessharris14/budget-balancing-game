import { describe, expect, it } from "vitest";
import { computeFinalScore } from "./scoringService";
import { deriveLedger, getBalanceStatus, getCardStatus, shouldApplyChallengeTrigger } from "./ledgerService";
import type { Commission, CommissionLedger } from "../types/session";

function baseCommission(overrides: Partial<Commission> = {}): Commission {
  return {
    id: "c1",
    name: "Table 1",
    members: { managerAdminId: null, chairId: null, commissionerIds: {} },
    chairRoll: null,
    ledger: { revenue: 100, expenditures: 100, reserves: 15, deficitOrSurplus: 0 },
    priority: { selectedCardId: null, funded: false },
    chairFreeCardUsed: false,
    chairHighlightedCardId: null,
    debateTimerEndsAt: null,
    cardsInPlay: {},
    cardsLockedOut: {},
    decisionsLog: {},
    failedMotionsLog: {},
    challengesApplied: {},
    activeChallenge: null,
    activeMotion: null,
    challengeLedgerAppliedAt: null,
    publicTrustTally: 0,
    finalScore: null,
    activeBallotId: null,
    ballotMeasures: {},
    ...overrides,
  };
}

describe("getCardStatus", () => {
  it("returns available for a card with no history", () => {
    const commission = baseCommission();
    expect(getCardStatus(commission, "R1", "revenue")).toEqual({ status: "available", label: "Available" });
  });

  it("returns applied for a card currently in cardsInPlay", () => {
    const commission = baseCommission({
      cardsInPlay: { R1: { cardId: "R1", cardType: "revenue", appliedAmount: 1, playedAt: 1, logEntryId: "e1" } },
    });
    expect(getCardStatus(commission, "R1", "revenue")).toEqual({ status: "applied", label: "Applied" });
  });

  it("returns lockedOut for a card locked out by an exclusivity group, when not played", () => {
    const commission = baseCommission({ cardsLockedOut: { R3: true } });
    expect(getCardStatus(commission, "R3", "revenue")).toEqual({ status: "lockedOut", label: "Locked out" });
  });

  it("applied wins over locked out (defensive -- shouldn't both be true in practice)", () => {
    const commission = baseCommission({
      cardsInPlay: { R1: { cardId: "R1", cardType: "revenue", appliedAmount: 1, playedAt: 1, logEntryId: "e1" } },
      cardsLockedOut: { R1: true },
    });
    expect(getCardStatus(commission, "R1", "revenue").status).toBe("applied");
  });

  it("returns didNotPass / Did not pass for a card whose motion failed and was never applied since", () => {
    const commission = baseCommission({
      failedMotionsLog: { f1: { cardId: "E1", cardType: "expenditure", failedAt: 100 } },
    });
    expect(getCardStatus(commission, "E1", "expenditure")).toEqual({ status: "didNotPass", label: "Did not pass" });
  });

  it("returns didNotPass / Failed ballot for a card whose Ballot Measure failed", () => {
    const commission = baseCommission({
      ballotMeasures: {
        b1: { id: "b1", cardId: "R2", cardType: "revenue", openedAt: 1, closedAt: 100, outcome: "failed", yesCount: 1, noCount: 2 },
      },
    });
    expect(getCardStatus(commission, "R2", "revenue")).toEqual({ status: "didNotPass", label: "Failed ballot" });
  });

  it("does NOT mark a card yellow for a Chair reset-for-no-second (no failedMotionsLog entry is ever written for that case)", () => {
    const commission = baseCommission();
    expect(getCardStatus(commission, "R1", "revenue").status).toBe("available");
  });

  it("a card that failed, was later moved again and applied, shows applied (cardsInPlay wins over any older failure)", () => {
    const commission = baseCommission({
      failedMotionsLog: { f1: { cardId: "E1", cardType: "expenditure", failedAt: 100 } },
      cardsInPlay: { E1: { cardId: "E1", cardType: "expenditure", appliedAmount: 2, playedAt: 200, logEntryId: "e1" } },
    });
    expect(getCardStatus(commission, "E1", "expenditure")).toEqual({ status: "applied", label: "Applied" });
  });

  it("a card applied then reconsidered returns to available, even with an older failure on record", () => {
    const commission = baseCommission({
      failedMotionsLog: { f1: { cardId: "E1", cardType: "expenditure", failedAt: 100 } },
      decisionsLog: {
        e1: { cardId: "E1", cardType: "expenditure", appliedAmount: 2, appliedAt: 200, reconsideredAt: 300 },
      },
    });
    expect(getCardStatus(commission, "E1", "expenditure")).toEqual({ status: "available", label: "Available" });
  });

  it("a card applied, reconsidered, then fails again later shows didNotPass (failure more recent than the reconsideration)", () => {
    const commission = baseCommission({
      decisionsLog: {
        e1: { cardId: "E1", cardType: "expenditure", appliedAmount: 2, appliedAt: 100, reconsideredAt: 200 },
      },
      failedMotionsLog: { f1: { cardId: "E1", cardType: "expenditure", failedAt: 300 } },
    });
    expect(getCardStatus(commission, "E1", "expenditure")).toEqual({ status: "didNotPass", label: "Did not pass" });
  });

  it("is scoped by cardType -- a revenue and expenditure card sharing an id string don't bleed into each other", () => {
    const commission = baseCommission({
      failedMotionsLog: { f1: { cardId: "1", cardType: "revenue", failedAt: 100 } },
    });
    expect(getCardStatus(commission, "1", "expenditure").status).toBe("available");
    expect(getCardStatus(commission, "1", "revenue").status).toBe("didNotPass");
  });
});

describe("deriveLedger", () => {
  const base: CommissionLedger = { revenue: 101, expenditures: 106, reserves: 20, deficitOrSurplus: -5 };

  it("always recomputes deficitOrSurplus as revenue - expenditures, never tracking its own delta", () => {
    const result = deriveLedger(base, { expenditureDelta: 1 });
    expect(result).toEqual({ revenue: 101, expenditures: 107, reserves: 20, deficitOrSurplus: -6 });
  });

  it("a revenue-only delta moves deficitOrSurplus the other way", () => {
    const result = deriveLedger(base, { revenueDelta: -2 });
    expect(result).toEqual({ revenue: 99, expenditures: 106, reserves: 20, deficitOrSurplus: -7 });
  });

  it("a reserves-only delta never touches revenue, expenditures, or deficitOrSurplus", () => {
    const result = deriveLedger(base, { reservesDelta: -4 });
    expect(result).toEqual({ revenue: 101, expenditures: 106, reserves: 16, deficitOrSurplus: -5 });
  });

  it("an incoming (possibly stale/wrong) deficitOrSurplus on `current` is ignored, not propagated", () => {
    const stale: CommissionLedger = { revenue: 101, expenditures: 106, reserves: 20, deficitOrSurplus: 999 };
    const result = deriveLedger(stale, { expenditureDelta: 1 });
    expect(result.deficitOrSurplus).toBe(-6);
  });

  it("a zero delta leaves every figure, including deficitOrSurplus, unchanged", () => {
    expect(deriveLedger(base, {})).toEqual(base);
  });
});

describe("shouldApplyChallengeTrigger", () => {
  it("applies the first time a trigger is seen (nothing claimed yet)", () => {
    expect(shouldApplyChallengeTrigger(null, 1000)).toBe(true);
  });

  it("refuses a retry of the exact same trigger (same triggeredAt already claimed)", () => {
    expect(shouldApplyChallengeTrigger(1000, 1000)).toBe(false);
  });

  it("applies the SAME card triggered again later, a genuinely new triggeredAt", () => {
    expect(shouldApplyChallengeTrigger(1000, 2000)).toBe(true);
  });
});

describe("getBalanceStatus", () => {
  it("zero is Balanced, with amount 0", () => {
    expect(getBalanceStatus(0)).toEqual({ sign: "balanced", label: "Balanced", amount: 0 });
  });

  it("a negative deficitOrSurplus is a Deficit, amount as a positive magnitude", () => {
    expect(getBalanceStatus(-7)).toEqual({ sign: "deficit", label: "Deficit", amount: 7 });
  });

  it("a positive deficitOrSurplus is a Surplus, amount as-is", () => {
    expect(getBalanceStatus(5)).toEqual({ sign: "surplus", label: "Surplus", amount: 5 });
  });

  it("a table in surplus is reachable from real ledger math: Revenue > Expenditures", () => {
    // e.g. a Commission that gained more revenue than it spent.
    const ledger: CommissionLedger = { revenue: 105, expenditures: 100, reserves: 15, deficitOrSurplus: 5 };
    expect(getBalanceStatus(ledger.deficitOrSurplus)).toEqual({ sign: "surplus", label: "Surplus", amount: 5 });
  });

  it("agrees with computeFinalScore's own Balanced check: both treat exactly 0 as balanced, nothing else", () => {
    const funded = { selectedCardId: null, funded: true };
    const balancedLedger: CommissionLedger = { revenue: 100, expenditures: 100, reserves: 15, deficitOrSurplus: 0 };
    const surplusLedger: CommissionLedger = { revenue: 101, expenditures: 100, reserves: 15, deficitOrSurplus: 1 };

    expect(getBalanceStatus(balancedLedger.deficitOrSurplus).sign).toBe("balanced");
    expect(computeFinalScore(balancedLedger, funded, 0).balanced.points).toBe(1);

    expect(getBalanceStatus(surplusLedger.deficitOrSurplus).sign).toBe("surplus");
    expect(computeFinalScore(surplusLedger, funded, 0).balanced.points).toBe(0);
  });
});
