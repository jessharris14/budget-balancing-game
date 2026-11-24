// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import FacilitatorTableCard from "./FacilitatorTableCard";
import type { CardCatalog } from "../types/catalog";
import type { Commission, Session } from "../types/session";

const catalog: CardCatalog = {
  catalogVersion: "test",
  revenueCards: [],
  expenditureCards: [],
  challengeCards: [],
  priorityCards: [],
  budgetPicture: { currentBudget: 0, projectedRevenue: 0, projectedExpenditure: 0, shortfall: 0, narrative: "" },
  reservePolicy: { max: 20, minimum: 10 },
  promptBank: [],
};

function baseCommission(overrides: Partial<Commission> = {}): Commission {
  return {
    id: "c1",
    name: "Kent",
    members: { managerAdminId: "admin-1", chairId: "chair-1", commissionerIds: { c1: true, c2: true } },
    chairRoll: null,
    ledger: { revenue: 101, expenditures: 107, reserves: 20, deficitOrSurplus: -6 },
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

function baseSession(commission: Commission): Session {
  return {
    code: "TEST",
    facilitatorId: "fac-1",
    phase: "mainGame",
    settings: { debateTimerMinutes: 5 },
    clock: { phaseTimer: null, mainGameTimer: null, nextChallengeDue: null },
    catalogVersion: "test",
    createdAt: Date.now(),
    expiresAt: Date.now() + 100000,
    commissions: { c1: commission },
    publicHearingSpeakers: {},
    participants: {
      "admin-1": { uid: "admin-1", name: "Alice Admin", role: "managerAdmin", commissionId: "c1" },
      "chair-1": { uid: "chair-1", name: "Charlie Chair", role: "commissioner", commissionId: "c1" },
    },
    presence: { "admin-1": Date.now(), "chair-1": Date.now(), c1: Date.now(), c2: Date.now() },
  };
}

function renderCard(commission: Commission) {
  return render(
    <FacilitatorTableCard
      commissionId="c1"
      commission={commission}
      session={baseSession(commission)}
      catalog={catalog}
      speakers={[]}
      selectedChallengeId={null}
      pushing={false}
      pushNotice={null}
      onPushChallenge={() => {}}
      rerollingUid={null}
      onReroll={() => {}}
    />,
  );
}

describe("FacilitatorTableCard: sign-aware banner", () => {
  afterEach(cleanup);

  it("a deficit commission gets the 'def' top-edge modifier and shows 'Deficit $X'", () => {
    renderCard(baseCommission({ ledger: { revenue: 101, expenditures: 107, reserves: 20, deficitOrSurplus: -6 } }));
    expect(document.querySelector(".tc")).toHaveClass("def");
    expect(screen.getByText(/Deficit \$6/)).toBeInTheDocument();
  });

  it("a surplus commission has no 'def' modifier and shows 'Surplus $X'", () => {
    renderCard(baseCommission({ ledger: { revenue: 102, expenditures: 101, reserves: 16, deficitOrSurplus: 1 } }));
    expect(document.querySelector(".tc")).not.toHaveClass("def");
    expect(screen.getByText(/Surplus \$1/)).toBeInTheDocument();
  });

  it("a balanced commission ($0) has no 'def' modifier", () => {
    renderCard(baseCommission({ ledger: { revenue: 100, expenditures: 100, reserves: 16, deficitOrSurplus: 0 } }));
    expect(document.querySelector(".tc")).not.toHaveClass("def");
    expect(screen.getByText("Balanced")).toBeInTheDocument();
  });
});

describe("FacilitatorTableCard: seat chips", () => {
  afterEach(cleanup);

  it("shows a green check for every filled seat and an open dash for an empty one", () => {
    renderCard(baseCommission({ members: { managerAdminId: "admin-1", chairId: null, commissionerIds: { c1: true } } }));

    expect(screen.getByText("Alice Admin")).toBeInTheDocument();
    const adminSeat = screen.getByText("Alice Admin").closest(".seat");
    expect(adminSeat?.querySelector(".ok")).toBeInTheDocument();
    expect(adminSeat?.querySelector(".no")).not.toBeInTheDocument();

    expect(screen.getByText("Chair: open")).toBeInTheDocument();
    const chairSeat = screen.getByText("Chair: open").closest(".seat");
    expect(chairSeat?.querySelector(".no")).toBeInTheDocument();
    expect(chairSeat?.querySelector(".ok")).not.toBeInTheDocument();

    expect(screen.getByText("1 Commissioner")).toBeInTheDocument();
    expect(screen.getByText("0 Speakers")).toBeInTheDocument();
  });
});
