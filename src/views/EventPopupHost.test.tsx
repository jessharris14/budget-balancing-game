// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardCatalog } from "../types/catalog";
import type { Commission, Participant } from "../types/session";

vi.mock("../services/catalogService", () => ({
  getCatalog: vi.fn(),
}));

import { getCatalog } from "../services/catalogService";
import EventPopupHost from "./EventPopupHost";

const catalog: CardCatalog = {
  catalogVersion: "test",
  revenueCards: [],
  expenditureCards: [{ id: "E1", title: "Cut a Program", impactBullets: ["bullet"], amount: 1, direction: "decrease" }],
  challengeCards: [
    { id: "C5", title: "Major Fire", printedText: "A fire happened.", facilitatorNarrative: "...", amount: 1, target: "deficit", direction: "increase" },
  ],
  priorityCards: [],
  budgetPicture: { currentBudget: 0, projectedRevenue: 0, projectedExpenditure: 0, shortfall: 0, narrative: "" },
  reservePolicy: { max: 20, minimum: 10 },
  promptBank: [],
};

const participants: Record<string, Participant> = {
  mover: { uid: "mover", name: "Mo Mover", role: "commissioner", commissionId: "c1" },
  other: { uid: "other", name: "Other Commissioner", role: "commissioner", commissionId: "c1" },
};

function baseCommission(overrides: Partial<Commission> = {}): Commission {
  return {
    id: "c1",
    name: "Kent County",
    members: { managerAdminId: null, chairId: null, commissionerIds: { mover: true, other: true } },
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

describe("EventPopupHost", () => {
  beforeEach(() => {
    vi.mocked(getCatalog).mockResolvedValue(catalog);
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows a Motion pop-up to a Commissioner other than the mover, with a Second button", async () => {
    const commission = baseCommission({
      activeMotion: { cardId: "E1", cardType: "expenditure", movedBy: "mover", movedAt: 1000, secondedBy: null, secondedAt: null },
    });
    render(
      <EventPopupHost
        code="TEST"
        commissionId="c1"
        commission={commission}
        catalogVersion="test"
        phase="mainGame"
        myUid="other"
        participants={participants}
        canSecond={true}
      />,
    );
    expect(await screen.findByText("Motion on the floor")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Second this motion" })).toBeInTheDocument();
  });

  it("shows no pop-up to the mover themself", async () => {
    const commission = baseCommission({
      activeMotion: { cardId: "E1", cardType: "expenditure", movedBy: "mover", movedAt: 1000, secondedBy: null, secondedAt: null },
    });
    render(
      <EventPopupHost
        code="TEST"
        commissionId="c1"
        commission={commission}
        catalogVersion="test"
        phase="mainGame"
        myUid="mover"
        participants={participants}
        canSecond={true}
      />,
    );
    await vi.waitFor(() => expect(getCatalog).toHaveBeenCalled());
    expect(screen.queryByText("Motion on the floor")).not.toBeInTheDocument();
  });

  it("dismissing with X does not reappear on a rerender with the same motion, but a different motion shows again", async () => {
    const commission = baseCommission({
      activeMotion: { cardId: "E1", cardType: "expenditure", movedBy: "mover", movedAt: 1000, secondedBy: null, secondedAt: null },
    });
    const { rerender } = render(
      <EventPopupHost
        code="TEST"
        commissionId="c1"
        commission={commission}
        catalogVersion="test"
        phase="mainGame"
        myUid="other"
        participants={participants}
        canSecond={true}
      />,
    );
    await screen.findByText("Motion on the floor");
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.queryByText("Motion on the floor")).not.toBeInTheDocument();

    // Same motion, re-rendered (e.g. an unrelated session update) -- still dismissed.
    rerender(
      <EventPopupHost
        code="TEST"
        commissionId="c1"
        commission={{ ...commission }}
        catalogVersion="test"
        phase="mainGame"
        myUid="other"
        participants={participants}
        canSecond={true}
      />,
    );
    expect(screen.queryByText("Motion on the floor")).not.toBeInTheDocument();

    // A genuinely different motion (new cardId/movedAt) shows up fresh.
    const newMotionCommission = baseCommission({
      activeMotion: { cardId: "E1", cardType: "expenditure", movedBy: "mover", movedAt: 2000, secondedBy: null, secondedAt: null },
    });
    rerender(
      <EventPopupHost
        code="TEST"
        commissionId="c1"
        commission={newMotionCommission}
        catalogVersion="test"
        phase="mainGame"
        myUid="other"
        participants={participants}
        canSecond={true}
      />,
    );
    expect(await screen.findByText("Motion on the floor")).toBeInTheDocument();
  });

  it("closes itself the instant the motion is seconded (by anyone), without needing the X", async () => {
    const commission = baseCommission({
      activeMotion: { cardId: "E1", cardType: "expenditure", movedBy: "mover", movedAt: 1000, secondedBy: null, secondedAt: null },
    });
    const { rerender } = render(
      <EventPopupHost
        code="TEST"
        commissionId="c1"
        commission={commission}
        catalogVersion="test"
        phase="mainGame"
        myUid="other"
        participants={participants}
        canSecond={true}
      />,
    );
    await screen.findByText("Motion on the floor");

    const secondedCommission = baseCommission({
      activeMotion: { cardId: "E1", cardType: "expenditure", movedBy: "mover", movedAt: 1000, secondedBy: "mover", secondedAt: 1500 },
    });
    rerender(
      <EventPopupHost
        code="TEST"
        commissionId="c1"
        commission={secondedCommission}
        catalogVersion="test"
        phase="mainGame"
        myUid="other"
        participants={participants}
        canSecond={true}
      />,
    );
    expect(screen.queryByText("Motion on the floor")).not.toBeInTheDocument();
  });

  it("closes itself once the motion is reset/withdrawn (activeMotion goes back to null)", async () => {
    const commission = baseCommission({
      activeMotion: { cardId: "E1", cardType: "expenditure", movedBy: "mover", movedAt: 1000, secondedBy: null, secondedAt: null },
    });
    const { rerender } = render(
      <EventPopupHost
        code="TEST"
        commissionId="c1"
        commission={commission}
        catalogVersion="test"
        phase="mainGame"
        myUid="other"
        participants={participants}
        canSecond={true}
      />,
    );
    await screen.findByText("Motion on the floor");

    rerender(
      <EventPopupHost
        code="TEST"
        commissionId="c1"
        commission={baseCommission({ activeMotion: null })}
        catalogVersion="test"
        phase="mainGame"
        myUid="other"
        participants={participants}
        canSecond={true}
      />,
    );
    expect(screen.queryByText("Motion on the floor")).not.toBeInTheDocument();
  });

  it("a Challenge pop-up and a waiting Motion arriving together: the Challenge shows first, then the Motion once dismissed", async () => {
    const commission = baseCommission({
      activeMotion: { cardId: "E1", cardType: "expenditure", movedBy: "mover", movedAt: 1000, secondedBy: null, secondedAt: null },
      challengesApplied: { C5: Date.now() },
    });
    render(
      <EventPopupHost
        code="TEST"
        commissionId="c1"
        commission={commission}
        catalogVersion="test"
        phase="mainGame"
        myUid="other"
        participants={participants}
        canSecond={true}
      />,
    );

    expect(await screen.findByText("Challenge")).toBeInTheDocument();
    expect(screen.queryByText("Motion on the floor")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(await screen.findByText("Motion on the floor")).toBeInTheDocument();
  });
});

describe("EventPopupHost: Chair's free card pop-up", () => {
  beforeEach(() => {
    vi.mocked(getCatalog).mockResolvedValue(catalog);
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows the pop-up with the card name, Budget effect chip, and Impact bullets, with a single Got it button", async () => {
    const commission = baseCommission({
      chairFreeCardUsed: true,
      chairFreeCardApplication: { cardId: "E1", cardType: "expenditure", appliedAt: Date.now() },
    });
    render(
      <EventPopupHost
        code="TEST"
        commissionId="c1"
        commission={commission}
        catalogVersion="test"
        phase="mainGame"
        myUid="other"
        participants={participants}
        canSecond={true}
      />,
    );

    expect(await screen.findByText("Chair's free card applied")).toBeInTheDocument();
    expect(screen.getByText("Cut a Program")).toBeInTheDocument();
    expect(screen.getByText("bullet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Got it" })).toBeInTheDocument();
  });

  it("queue order: Challenge, then Motion, then the Chair's free card, in that order", async () => {
    const commission = baseCommission({
      activeMotion: { cardId: "E1", cardType: "expenditure", movedBy: "mover", movedAt: 1000, secondedBy: null, secondedAt: null },
      challengesApplied: { C5: Date.now() },
      chairFreeCardUsed: true,
      chairFreeCardApplication: { cardId: "E1", cardType: "expenditure", appliedAt: Date.now() },
    });
    render(
      <EventPopupHost
        code="TEST"
        commissionId="c1"
        commission={commission}
        catalogVersion="test"
        phase="mainGame"
        myUid="other"
        participants={participants}
        canSecond={true}
      />,
    );

    expect(await screen.findByText("Challenge")).toBeInTheDocument();
    expect(screen.queryByText("Motion on the floor")).not.toBeInTheDocument();
    expect(screen.queryByText("Chair's free card applied")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));

    expect(await screen.findByText("Motion on the floor")).toBeInTheDocument();
    expect(screen.queryByText("Chair's free card applied")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));

    expect(await screen.findByText("Chair's free card applied")).toBeInTheDocument();
  });

  it("dismissing with Got it does not reappear on a refresh (a fresh mount with the same appliedAt)", async () => {
    const commission = baseCommission({
      chairFreeCardUsed: true,
      chairFreeCardApplication: { cardId: "E1", cardType: "expenditure", appliedAt: Date.now() },
    });
    const { unmount } = render(
      <EventPopupHost
        code="TEST"
        commissionId="c1"
        commission={commission}
        catalogVersion="test"
        phase="mainGame"
        myUid="other"
        participants={participants}
        canSecond={true}
      />,
    );
    expect(await screen.findByText("Chair's free card applied")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(screen.queryByText("Chair's free card applied")).not.toBeInTheDocument();
    unmount();

    render(
      <EventPopupHost
        code="TEST"
        commissionId="c1"
        commission={commission}
        catalogVersion="test"
        phase="mainGame"
        myUid="other"
        participants={participants}
        canSecond={true}
      />,
    );
    await vi.waitFor(() => expect(getCatalog).toHaveBeenCalled());
    expect(screen.queryByText("Chair's free card applied")).not.toBeInTheDocument();
  });

  it("a late joiner does not get a stale pop-up for an application that happened long ago", async () => {
    const commission = baseCommission({
      chairFreeCardUsed: true,
      chairFreeCardApplication: { cardId: "E1", cardType: "expenditure", appliedAt: Date.now() - 10 * 60 * 1000 },
    });
    render(
      <EventPopupHost
        code="TEST"
        commissionId="c1"
        commission={commission}
        catalogVersion="test"
        phase="mainGame"
        myUid="other"
        participants={participants}
        canSecond={true}
      />,
    );
    await vi.waitFor(() => expect(getCatalog).toHaveBeenCalled());
    expect(screen.queryByText("Chair's free card applied")).not.toBeInTheDocument();
  });
});
