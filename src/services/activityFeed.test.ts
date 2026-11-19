import { describe, expect, it } from "vitest";
import { buildCommissionActivity, buildFacilitatorActivity, countNewSince, latestTimestamp } from "./activityFeed";
import type { CardCatalog } from "../types/catalog";
import type { Commission, Participant } from "../types/session";

const catalog: CardCatalog = {
  catalogVersion: "test",
  revenueCards: [{ id: "R1", title: "Raise a Fee", impactBullets: ["bullet"], amount: 2, direction: "decrease" }],
  expenditureCards: [{ id: "E1", title: "Cut a Program", impactBullets: ["bullet"], amount: 1, direction: "decrease" }],
  challengeCards: [
    { id: "C5", title: "Major Fire", printedText: "...", facilitatorNarrative: "...", amount: 1, target: "deficit", direction: "increase" },
  ],
  priorityCards: [{ id: "P1", title: "Fix the Roads", description: "...", amount: 2, linkedCardId: "E1", linkedCardType: "expenditure" }],
  budgetPicture: { currentBudget: 0, projectedRevenue: 0, projectedExpenditure: 0, shortfall: 0, narrative: "" },
  reservePolicy: { max: 20, minimum: 10 },
  promptBank: [],
};

const participants: Record<string, Participant> = {
  mover: { uid: "mover", name: "Mo Mover", role: "commissioner", commissionId: "c1" },
  seconder: { uid: "seconder", name: "Sam Seconder", role: "commissioner", commissionId: "c1" },
};

function baseCommission(overrides: Partial<Commission> = {}): Commission {
  return {
    id: "c1",
    name: "Kent County",
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

describe("buildCommissionActivity", () => {
  it("includes a live pending motion (made, not yet seconded)", () => {
    const commission = baseCommission({
      activeMotion: { cardId: "E1", cardType: "expenditure", movedBy: "mover", movedAt: 1000, secondedBy: null, secondedAt: null },
    });
    const entries = buildCommissionActivity(commission, catalog, participants);
    expect(entries).toEqual([{ id: "motion-made:E1:1000", timestamp: 1000, text: "Mo Mover moved to adopt Cut a Program" }]);
  });

  it("includes both the made and seconded entries once seconded", () => {
    const commission = baseCommission({
      activeMotion: { cardId: "E1", cardType: "expenditure", movedBy: "mover", movedAt: 1000, secondedBy: "seconder", secondedAt: 2000 },
    });
    const entries = buildCommissionActivity(commission, catalog, participants);
    expect(entries).toEqual([
      { id: "motion-seconded:E1:2000", timestamp: 2000, text: "Sam Seconder seconded Cut a Program" },
      { id: "motion-made:E1:1000", timestamp: 1000, text: "Mo Mover moved to adopt Cut a Program" },
    ]);
  });

  it("builds a Motion Passes (Applied) entry from a decisionsLog entry", () => {
    const commission = baseCommission({
      decisionsLog: { log1: { cardId: "E1", cardType: "expenditure", appliedAmount: -1, appliedAt: 3000, reconsideredAt: null } },
    });
    const entries = buildCommissionActivity(commission, catalog, participants);
    expect(entries).toEqual([{ id: "applied:E1:3000", timestamp: 3000, text: "Applied: Save $1 — Cut a Program" }]);
  });

  it("adds a Reconsider entry alongside the original Applied entry", () => {
    const commission = baseCommission({
      decisionsLog: { log1: { cardId: "E1", cardType: "expenditure", appliedAmount: -1, appliedAt: 3000, reconsideredAt: 3500 } },
    });
    const entries = buildCommissionActivity(commission, catalog, participants);
    expect(entries).toEqual([
      { id: "reconsidered:E1:3500", timestamp: 3500, text: "Reconsidered: Cut a Program" },
      { id: "applied:E1:3000", timestamp: 3000, text: "Applied: Save $1 — Cut a Program" },
    ]);
  });

  it("adds a Priority funded entry when the applied card is the Priority's linked card and funded is true", () => {
    const commission = baseCommission({
      priority: { selectedCardId: "P1", funded: true },
      decisionsLog: { log1: { cardId: "E1", cardType: "expenditure", appliedAmount: -1, appliedAt: 3000, reconsideredAt: null } },
    });
    const entries = buildCommissionActivity(commission, catalog, participants);
    expect(entries).toContainEqual({ id: "priority-funded:E1:3000", timestamp: 3000, text: "Priority funded: Cut a Program" });
  });

  it("does not add a Priority funded entry once that entry has been reconsidered", () => {
    const commission = baseCommission({
      priority: { selectedCardId: "P1", funded: false },
      decisionsLog: { log1: { cardId: "E1", cardType: "expenditure", appliedAmount: -1, appliedAt: 3000, reconsideredAt: 3500 } },
    });
    const entries = buildCommissionActivity(commission, catalog, participants);
    expect(entries.some((e) => e.text.startsWith("Priority funded"))).toBe(false);
  });

  it("builds a Motion failed entry with the card's Budget effect label", () => {
    const commission = baseCommission({
      failedMotionsLog: { f1: { cardId: "E1", cardType: "expenditure", failedAt: 4000 } },
    });
    const entries = buildCommissionActivity(commission, catalog, participants);
    expect(entries).toEqual([{ id: "failed:E1:4000", timestamp: 4000, text: "Motion failed: Cut a Program (Save $1)" }]);
  });

  it("builds a Challenge applied entry with its Budget effect label", () => {
    const commission = baseCommission({ challengesApplied: { C5: 5000 } });
    const entries = buildCommissionActivity(commission, catalog, participants);
    expect(entries).toEqual([{ id: "challenge:C5:5000", timestamp: 5000, text: "Challenge applied: Major Fire — Spend $1" }]);
  });

  it("builds a resolved Ballot Measure entry from aggregate totals only -- no individual votes", () => {
    const commission = baseCommission({
      ballotMeasures: {
        b1: { id: "b1", cardId: "R1", cardType: "revenue", openedAt: 100, closedAt: 6000, outcome: "passed", yesCount: 5, noCount: 2 },
      },
    });
    const entries = buildCommissionActivity(commission, catalog, participants);
    // Only ever reads the ballot's aggregate yesCount/noCount -- there is no
    // per-voter field anywhere on Commission for this function to read, so
    // an individual vote can never leak into the feed even by mistake.
    expect(entries).toEqual([{ id: "ballot:b1", timestamp: 6000, text: "Ballot Measure: Raise a Fee — Passed (Yes 5, No 2)" }]);
  });

  it("does not include an open, unresolved Ballot Measure", () => {
    const commission = baseCommission({
      ballotMeasures: { b1: { id: "b1", cardId: "R1", cardType: "revenue", openedAt: 100, closedAt: null, outcome: null, yesCount: 1, noCount: 0 } },
    });
    expect(buildCommissionActivity(commission, catalog, participants)).toEqual([]);
  });

  it("sorts every entry newest first", () => {
    const commission = baseCommission({
      challengesApplied: { C5: 1000 },
      decisionsLog: { log1: { cardId: "E1", cardType: "expenditure", appliedAmount: -1, appliedAt: 5000, reconsideredAt: null } },
    });
    const entries = buildCommissionActivity(commission, catalog, participants);
    expect(entries.map((e) => e.timestamp)).toEqual([5000, 1000]);
  });
});

describe("buildFacilitatorActivity", () => {
  it("merges every table's entries, newest first, each tagged with its table name", () => {
    const commissions: Record<string, Commission> = {
      c1: baseCommission({ name: "Kent County", challengesApplied: { C5: 1000 } }),
      c2: baseCommission({ name: "Ottawa County", challengesApplied: { C5: 2000 } }),
    };
    const entries = buildFacilitatorActivity(commissions, catalog, participants);
    expect(entries).toEqual([
      { id: "c2:challenge:C5:2000", timestamp: 2000, tableName: "Ottawa County", text: "Challenge applied: Major Fire — Spend $1" },
      { id: "c1:challenge:C5:1000", timestamp: 1000, tableName: "Kent County", text: "Challenge applied: Major Fire — Spend $1" },
    ]);
  });
});

describe("countNewSince / latestTimestamp", () => {
  it("counts only entries strictly newer than lastSeen", () => {
    const entries = [
      { id: "a", timestamp: 100, text: "a" },
      { id: "b", timestamp: 200, text: "b" },
      { id: "c", timestamp: 300, text: "c" },
    ];
    expect(countNewSince(entries, 150)).toBe(2);
    expect(countNewSince(entries, 300)).toBe(0);
    expect(countNewSince(entries, 0)).toBe(3);
  });

  it("latestTimestamp is 0 for an empty feed and the max timestamp otherwise", () => {
    expect(latestTimestamp([])).toBe(0);
    expect(
      latestTimestamp([
        { id: "a", timestamp: 100, text: "a" },
        { id: "b", timestamp: 300, text: "b" },
      ]),
    ).toBe(300);
  });
});
