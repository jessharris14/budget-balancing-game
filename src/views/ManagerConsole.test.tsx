// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardCatalog } from "../types/catalog";
import type { Commission, Session } from "../types/session";

vi.mock("../services/catalogService", () => ({
  getCatalog: vi.fn(),
}));
vi.mock("../services/ballotService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/ballotService")>();
  return { ...actual, createBallotMeasure: vi.fn() };
});
vi.mock("../services/chairService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/chairService")>();
  return { ...actual, stopDebateTimer: vi.fn().mockResolvedValue(undefined) };
});
vi.mock("../services/ledgerService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/ledgerService")>();
  return {
    ...actual,
    applyCard: vi.fn(),
    reconsiderCard: vi.fn(),
    applyChairFreeCard: vi.fn(),
    resolveMotionFails: vi.fn(),
  };
});

import { getCatalog } from "../services/catalogService";
import { resolveMotionFails } from "../services/ledgerService";
import ManagerConsole from "./ManagerConsole";

const CARD_ID = "E1";

const catalog: CardCatalog = {
  catalogVersion: "test",
  revenueCards: [],
  expenditureCards: [{ id: CARD_ID, title: "Test Expenditure", impactBullets: ["Does a thing"], amount: 1, direction: "increase" }],
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
    chairHighlightedCardId: CARD_ID,
    debateTimerEndsAt: null,
    cardsInPlay: {},
    cardsLockedOut: {},
    decisionsLog: {},
    failedMotionsLog: {},
    challengesApplied: {},
    activeChallenge: null,
    activeMotion: { cardId: CARD_ID, cardType: "expenditure", movedBy: "comm-1", movedAt: 1, secondedBy: "chair-1", secondedAt: 2 },
    challengeLedgerAppliedAt: null,
    publicTrustTally: 0,
    finalScore: null,
    activeBallotId: null,
    ballotMeasures: {},
    ...overrides,
  };
}

function baseSession(): Session {
  return {
    code: "TEST",
    facilitatorId: "fac-1",
    phase: "mainGame",
    settings: { debateTimerMinutes: 5 },
    clock: { phaseTimer: null, mainGameTimer: null, nextChallengeDue: null },
    catalogVersion: "test",
    createdAt: Date.now(),
    expiresAt: Date.now() + 100000,
    commissions: { c1: baseCommission() },
    publicHearingSpeakers: {},
    participants: {
      "admin-1": { uid: "admin-1", name: "Alice Admin", role: "managerAdmin", commissionId: "c1" },
      "chair-1": { uid: "chair-1", name: "Charlie Chair", role: "commissioner", commissionId: "c1" },
      "comm-1": { uid: "comm-1", name: "Cara Commissioner", role: "commissioner", commissionId: "c1" },
    },
  };
}

describe("ManagerConsole: Motion Fails", () => {
  beforeEach(() => {
    vi.mocked(getCatalog).mockResolvedValue(catalog);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("a single click resolves the motion exactly once", async () => {
    const commission = baseCommission();
    let resolveWrite: () => void = () => {};
    vi.mocked(resolveMotionFails).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveWrite = () => resolve({ ok: true });
        }),
    );

    render(<ManagerConsole code="TEST" session={baseSession()} commissionId="c1" commission={commission} />);

    const failButton = await screen.findByRole("button", { name: "Motion Fails" });
    fireEvent.click(failButton);

    // The one real press must register immediately -- no second click needed.
    expect(resolveMotionFails).toHaveBeenCalledTimes(1);
    expect(resolveMotionFails).toHaveBeenCalledWith("TEST", "c1", CARD_ID, "expenditure");

    // While the write is in flight, the button stays visible, disabled, and
    // says so -- this is the fix for "the first press appears to do
    // nothing": there's no moment where the panel (and the button) has
    // already vanished but the action hasn't actually finished yet.
    await waitFor(() => expect(failButton).toHaveTextContent("Working…"));
    expect(failButton).toBeDisabled();

    await act(async () => {
      resolveWrite();
      await Promise.resolve();
    });

    // Once genuinely done, resolveMotionFails was still only ever called once.
    expect(resolveMotionFails).toHaveBeenCalledTimes(1);
  });

  it("a rapid double-click resolves the motion only once (double-tap protection survives the fix)", async () => {
    const commission = baseCommission();
    let resolveWrite: () => void = () => {};
    vi.mocked(resolveMotionFails).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveWrite = () => resolve({ ok: true });
        }),
    );

    render(<ManagerConsole code="TEST" session={baseSession()} commissionId="c1" commission={commission} />);

    const failButton = await screen.findByRole("button", { name: "Motion Fails" });
    fireEvent.click(failButton);
    // Second, rapid click on the SAME element -- now disabled and reading
    // "Working…" -- the realistic "double tap" scenario. A real browser
    // never fires onClick on a disabled button at all; fireEvent bypasses
    // that, so this is the stricter check that the guard itself still
    // holds even if a click somehow got through.
    await waitFor(() => expect(failButton).toBeDisabled());
    fireEvent.click(failButton);

    expect(resolveMotionFails).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveWrite();
      await Promise.resolve();
    });

    expect(resolveMotionFails).toHaveBeenCalledTimes(1);
  });

  it("the panel is pinned to the resolving card even once chairHighlightedCardId has already cleared live", async () => {
    let resolveWrite: () => void = () => {};
    vi.mocked(resolveMotionFails).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveWrite = () => resolve({ ok: true });
        }),
    );

    const commission = baseCommission();
    const { rerender } = render(
      <ManagerConsole code="TEST" session={baseSession()} commissionId="c1" commission={commission} />,
    );

    const failButton = await screen.findByRole("button", { name: "Motion Fails" });
    fireEvent.click(failButton);

    // Simulate the live RTDB listener already reporting chairHighlightedCardId
    // (and activeMotion) cleared -- the first write of the old, unbatched
    // sequence landing -- while the action is still "in flight" client-side.
    const clearedCommission = { ...commission, chairHighlightedCardId: null, activeMotion: null };
    const sessionWithCleared = { ...baseSession(), commissions: { c1: clearedCommission } };
    rerender(<ManagerConsole code="TEST" session={sessionWithCleared} commissionId="c1" commission={clearedCommission} />);

    // The panel -- and its disabled, still-"Working…" button -- must still
    // be on screen: this is exactly the window where the old code made the
    // panel disappear, which is what made a single real press look like it
    // needed a second one.
    expect(screen.getByText("Card Under Debate")).toBeInTheDocument();
    expect(failButton).toBeDisabled();
    expect(failButton).toHaveTextContent("Working…");

    await act(async () => {
      resolveWrite();
      await Promise.resolve();
    });
  });
});
