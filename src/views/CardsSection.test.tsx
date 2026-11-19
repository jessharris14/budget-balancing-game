// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import CardsSection from "./CardsSection";
import type { CardCatalog } from "../types/catalog";
import type { Commission } from "../types/session";

const catalog: CardCatalog = {
  catalogVersion: "test",
  revenueCards: [{ id: "R1", title: "Revenue One", impactBullets: ["Does a thing."], amount: 1, direction: "decrease" }],
  expenditureCards: [{ id: "E1", title: "Expenditure One", impactBullets: ["Does a thing."], amount: 1, direction: "increase" }],
  challengeCards: [],
  priorityCards: [],
  budgetPicture: { currentBudget: 0, projectedRevenue: 0, projectedExpenditure: 0, shortfall: 0, narrative: "" },
  reservePolicy: { max: 20, minimum: 10 },
  promptBank: [],
};

const commission: Commission = {
  id: "c1",
  name: "Kent",
  members: { managerAdminId: "admin-1", chairId: null, commissionerIds: {} },
  chairRoll: null,
  ledger: { revenue: 10, expenditures: 10, reserves: 20, deficitOrSurplus: 0 },
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
};

describe("CardsSection default view per role", () => {
  afterEach(cleanup);

  it("defaults to Swipe (Commissioner/Speaker) when asked for swipe", () => {
    render(<CardsSection catalog={catalog} commission={commission} defaultView="swipe" />);
    expect(screen.getByLabelText("Previous card")).toBeInTheDocument();
    expect(screen.queryByRole("rowheader")).not.toBeInTheDocument();
  });

  it("defaults to List (Manager/Administrator and Chair) when asked for list", () => {
    render(<CardsSection catalog={catalog} commission={commission} defaultView="list" />);
    expect(screen.queryByLabelText("Previous card")).not.toBeInTheDocument();
    expect(screen.getByText("Revenue One")).toBeInTheDocument();
  });

  it("still lets you switch views regardless of the default", () => {
    render(<CardsSection catalog={catalog} commission={commission} defaultView="list" />);
    fireEvent.click(screen.getByRole("button", { name: "Swipe" }));
    expect(screen.getByLabelText("Previous card")).toBeInTheDocument();
  });

  it("uses the real catalog counts in the Card type control, not hardcoded numbers", () => {
    render(<CardsSection catalog={catalog} commission={commission} defaultView="list" />);
    expect(screen.getByText("Revenue (1)")).toBeInTheDocument();
    expect(screen.getByText("Expenditure (1)")).toBeInTheDocument();
  });
});
