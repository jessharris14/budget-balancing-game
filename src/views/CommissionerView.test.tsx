// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardCatalog } from "../types/catalog";
import type { Commission, Session } from "../types/session";

vi.mock("../services/catalogService", () => ({
  getCatalog: vi.fn(),
}));
vi.mock("../services/chairService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/chairService")>();
  return { ...actual, recordCommissionPriority: vi.fn().mockResolvedValue(undefined) };
});

import { getCatalog } from "../services/catalogService";
import { recordCommissionPriority } from "../services/chairService";
import CommissionerView from "./CommissionerView";

const catalog: CardCatalog = {
  catalogVersion: "test",
  revenueCards: [],
  expenditureCards: [{ id: "E1", title: "Test Expenditure", impactBullets: ["Does a thing"], amount: 1, direction: "increase" }],
  challengeCards: [],
  priorityCards: [
    { id: "P1", title: "Economic Development", description: "Incentive for a new employer", amount: 1, linkedCardId: "R1", linkedCardType: "revenue" },
    { id: "P2", title: "Human Services", description: "Outreach funding", amount: 1, linkedCardId: "E1", linkedCardType: "expenditure" },
  ],
  budgetPicture: { currentBudget: 0, projectedRevenue: 0, projectedExpenditure: 0, shortfall: 0, narrative: "" },
  reservePolicy: { max: 20, minimum: 10 },
  promptBank: [],
};

function baseCommission(overrides: Partial<Commission> = {}): Commission {
  return {
    id: "c1",
    name: "Table 1",
    members: { managerAdminId: "admin-1", chairId: "chair-1", commissionerIds: { "comm-1": true } },
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
      "comm-1": { uid: "comm-1", name: "Cara Commissioner", role: "commissioner", commissionId: "c1" },
    },
  };
}

describe("CommissionerView: Card Under Debate wording", () => {
  beforeEach(() => {
    vi.mocked(getCatalog).mockResolvedValue(catalog);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows 'No card under debate.' (not the old 'No card currently highlighted by the Chair.') for a non-Chair Commissioner with nothing highlighted", async () => {
    const commission = baseCommission({ chairHighlightedCardId: null });
    render(
      <CommissionerView code="TEST" session={baseSession(commission)} commissionId="c1" commission={commission} isMyChair={false} myUid="comm-1" />,
    );

    expect(await screen.findByText("No card under debate.")).toBeInTheDocument();
    expect(screen.queryByText("No card currently highlighted by the Chair.")).not.toBeInTheDocument();
  });
});

describe("CommissionerView: Rank Priorities card grid", () => {
  beforeEach(() => {
    vi.mocked(getCatalog).mockResolvedValue(catalog);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("the Chair can select a priority card, which calls the exact same recordCommissionPriority write as before", async () => {
    const commission = baseCommission({ priority: { selectedCardId: null, funded: false } });
    const session: Session = { ...baseSession(commission), phase: "rankPriorities" };
    render(<CommissionerView code="TEST" session={session} commissionId="c1" commission={commission} isMyChair={true} myUid="chair-1" />);

    const humanServicesCard = await screen.findByText("Human Services");
    const radio = humanServicesCard.closest(".prio-card")!.querySelector("input[type='radio']")!;
    fireEvent.click(radio);

    expect(recordCommissionPriority).toHaveBeenCalledTimes(1);
    expect(recordCommissionPriority).toHaveBeenCalledWith("TEST", "c1", "P2");
  });

  it("a non-Chair Commissioner sees the same cards read-only (not tappable), with the Chair's pick highlighted", async () => {
    const commission = baseCommission({ priority: { selectedCardId: "P2", funded: false } });
    const session: Session = { ...baseSession(commission), phase: "rankPriorities" };
    render(<CommissionerView code="TEST" session={session} commissionId="c1" commission={commission} isMyChair={false} myUid="comm-1" />);

    await screen.findByText("Human Services");
    expect(document.querySelector("input[type='radio']")).not.toBeInTheDocument();
    const humanServicesCard = screen.getByText("Human Services").closest(".prio-card");
    expect(humanServicesCard).toHaveClass("sel");
  });

  it("renders no old-style list markup (<ul>/<li>) for the priorities screen, for either role", async () => {
    const commission = baseCommission({ priority: { selectedCardId: "P2", funded: false } });
    const session: Session = { ...baseSession(commission), phase: "rankPriorities" };
    render(<CommissionerView code="TEST" session={session} commissionId="c1" commission={commission} isMyChair={false} myUid="comm-1" />);

    await screen.findByText("Human Services");
    expect(document.querySelectorAll(".prio-card")).toHaveLength(2);
    expect(document.querySelector("ul")).not.toBeInTheDocument();
    expect(document.querySelector("li")).not.toBeInTheDocument();
  });
});

describe("CommissionerView: debate timer never shows NaN, for either role", () => {
  beforeEach(() => {
    vi.mocked(getCatalog).mockResolvedValue(catalog);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it.each([
    ["Chair", true],
    ["Commissioner", false],
  ])("%s: shows 'Waiting for Chair' (never NaN) once a motion is seconded but the debate timer hasn't started", async (_label, isMyChair) => {
    const commission = baseCommission({
      chairHighlightedCardId: "E1",
      activeMotion: { cardId: "E1", cardType: "expenditure", movedBy: "comm-1", movedAt: 1, secondedBy: "chair-1", secondedAt: 2 },
      debateTimerEndsAt: null,
    });
    render(
      <CommissionerView
        code="TEST"
        session={baseSession(commission)}
        commissionId="c1"
        commission={commission}
        isMyChair={isMyChair}
        myUid={isMyChair ? "chair-1" : "comm-1"}
      />,
    );

    expect(await screen.findByText("Waiting for Chair")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/NaN/);
  });
});
