import { describe, expect, it } from "vitest";
import { getCardStatus } from "./ledgerService";
import type { Commission } from "../types/session";

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
        b1: { id: "b1", cardId: "R2", cardType: "revenue", openedAt: 1, closedAt: 100, outcome: "failed", votes: {} },
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
