// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardCatalog } from "../types/catalog";
import type { Commission, Session } from "../types/session";

vi.mock("../services/catalogService", () => ({
  getCatalog: vi.fn(),
}));
vi.mock("../services/ledgerService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/ledgerService")>();
  return { ...actual, reconsiderCard: vi.fn(), resolveMotionFails: vi.fn(), applyCard: vi.fn() };
});
vi.mock("../services/chairService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/chairService")>();
  return { ...actual, stopDebateTimer: vi.fn().mockResolvedValue(undefined) };
});

import { getCatalog } from "../services/catalogService";
import { applyCard } from "../services/ledgerService";
import ManagerConsole from "./ManagerConsole";

const DEBATE_CARD = "R1";
const APPLIED_CARD = "E1";

const catalog: CardCatalog = {
  catalogVersion: "test",
  revenueCards: [{ id: DEBATE_CARD, title: "Under Debate Card", impactBullets: ["Does a thing."], amount: 1, direction: "decrease" }],
  expenditureCards: [{ id: APPLIED_CARD, title: "Applied Card", impactBullets: ["Does another thing."], amount: 1, direction: "increase" }],
  challengeCards: [],
  priorityCards: [],
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
    chairHighlightedCardId: DEBATE_CARD,
    debateTimerEndsAt: null,
    cardsInPlay: { [APPLIED_CARD]: { cardId: APPLIED_CARD, cardType: "expenditure", appliedAmount: 1, playedAt: 1, logEntryId: "l1" } },
    cardsLockedOut: {},
    decisionsLog: {},
    failedMotionsLog: {},
    challengesApplied: {},
    activeChallenge: null,
    activeMotion: { cardId: DEBATE_CARD, cardType: "revenue", movedBy: "comm-1", movedAt: 1, secondedBy: "chair-1", secondedAt: 2 },
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

function stubDesktopMatchMedia() {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: true,
      media: "(min-width: 1024px)",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
}

describe("ManagerConsole desktop table (screen 12)", () => {
  beforeEach(() => {
    vi.mocked(getCatalog).mockResolvedValue(catalog);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  function findRow(titleText: string): HTMLElement {
    const matches = screen.getAllByText(titleText).map((el) => el.closest(".dtr")).filter((el): el is HTMLElement => el !== null);
    expect(matches).toHaveLength(1);
    return matches[0];
  }

  it("shows the catalog as a table, not the phone compact list, at desktop width", async () => {
    stubDesktopMatchMedia();
    const commission = baseCommission();
    render(<ManagerConsole code="TEST" session={baseSession(commission)} commissionId="c1" commission={commission} />);

    await screen.findByText("Impact"); // the table's own header cell, unambiguous
    expect(screen.getByText("Actions")).toBeInTheDocument(); // the table header cell
    expect(document.querySelector(".dtable")).toBeInTheDocument();
    expect(document.querySelector(".rows")).not.toBeInTheDocument();
  });

  it("puts Motion Passes/Motion Fails in the under-debate row's Actions column, not a separate panel", async () => {
    stubDesktopMatchMedia();
    const commission = baseCommission();
    render(<ManagerConsole code="TEST" session={baseSession(commission)} commissionId="c1" commission={commission} />);

    await screen.findByText("Impact");
    const debateRow = findRow("Under Debate Card");
    expect(debateRow).toHaveClass("sel");
    const actions = debateRow.querySelector(".acts");
    expect(actions).toHaveTextContent("Motion Passes");
    expect(actions).toHaveTextContent("Motion Fails");

    // The phone-only standalone debate panel (with its own buttons) is gone on desktop.
    expect(screen.queryByText("Debate in progress")).not.toBeInTheDocument();
    // Replaced by the compact "Motion in progress" panel instead.
    expect(screen.getByText("Motion in progress")).toBeInTheDocument();
  });

  it("still shows Reconsider on an Applied row, same as phone", async () => {
    stubDesktopMatchMedia();
    const commission = baseCommission();
    render(<ManagerConsole code="TEST" session={baseSession(commission)} commissionId="c1" commission={commission} />);

    await screen.findByText("Impact");
    fireEvent.click(screen.getByRole("button", { name: /Expenditure/ }));
    const appliedRow = findRow("Applied Card");
    expect(appliedRow.querySelector(".acts")).toHaveTextContent("Reconsider");
  });

  it("falls back to the phone compact list when matchMedia reports non-desktop", async () => {
    const commission = baseCommission();
    render(<ManagerConsole code="TEST" session={baseSession(commission)} commissionId="c1" commission={commission} />);

    await screen.findAllByText("Under Debate Card");
    expect(document.querySelector(".rows")).toBeInTheDocument();
    expect(document.querySelector(".dtable")).not.toBeInTheDocument();
    // Phone keeps the standalone Card Under Debate panel with its own buttons -- the eyebrow text is unambiguous (unlike the title, which also appears in the bar/row).
    expect(screen.getAllByText("Card Under Debate").length).toBeGreaterThan(0);
    const failButtons = screen.getAllByRole("button", { name: "Motion Fails" });
    expect(failButtons).toHaveLength(1);
  });

  it("clicking Motion Passes in the table row disables both row buttons while it resolves", async () => {
    stubDesktopMatchMedia();
    let resolveApply: () => void = () => {};
    vi.mocked(applyCard).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveApply = () => resolve({ ok: true });
        }),
    );

    const commission = baseCommission();
    render(<ManagerConsole code="TEST" session={baseSession(commission)} commissionId="c1" commission={commission} />);

    const passButton = await screen.findByRole("button", { name: "Motion Passes" });
    const failButton = screen.getByRole("button", { name: "Motion Fails" });
    fireEvent.click(passButton);

    await waitFor(() => expect(passButton).toBeDisabled());
    expect(failButton).toBeDisabled();

    await act(async () => {
      resolveApply();
      await Promise.resolve();
    });
  });
});
