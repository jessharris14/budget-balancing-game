// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Commission, Session } from "../types/session";

vi.mock("../hooks/useAnonymousAuth", () => ({
  useAnonymousAuth: vi.fn(),
}));
vi.mock("../services/sessionService", () => ({
  subscribeToSession: vi.fn(),
}));

import { useAnonymousAuth } from "../hooks/useAnonymousAuth";
import { subscribeToSession } from "../services/sessionService";
import PublicView from "./PublicView";

const FACILITATOR_UID = "fac-1";

function baseCommission(overrides: Partial<Commission> = {}): Commission {
  return {
    id: "c1",
    name: "Kent",
    members: { managerAdminId: "admin-1", chairId: "chair-1", commissionerIds: { c1: true } },
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

function sessionWithTables(count: number): Session {
  const commissions: Record<string, Commission> = {};
  for (let i = 1; i <= count; i++) {
    commissions[`c${i}`] = baseCommission({
      id: `c${i}`,
      name: `Table ${i}`,
      members: { managerAdminId: `admin-${i}`, chairId: `chair-${i}`, commissionerIds: {} },
      ledger: { revenue: 100, expenditures: 100, reserves: 15, deficitOrSurplus: i % 2 === 0 ? 1 : -1 },
    });
  }
  return {
    code: "TEST",
    facilitatorId: FACILITATOR_UID,
    phase: "mainGame",
    settings: { debateTimerMinutes: 5 },
    clock: { phaseTimer: null, mainGameTimer: null, nextChallengeDue: null },
    catalogVersion: "test",
    createdAt: Date.now(),
    expiresAt: Date.now() + 100000,
    commissions,
    publicHearingSpeakers: {},
    participants: {},
  };
}

function renderPublicView() {
  return render(
    <MemoryRouter initialEntries={["/display/TEST"]}>
      <Routes>
        <Route path="/display/:code" element={<PublicView />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PublicView: table-count layouts", () => {
  beforeEach(() => {
    vi.mocked(useAnonymousAuth).mockReturnValue({ user: { uid: FACILITATOR_UID } as never, status: "signed-in", error: null });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it.each([1, 2, 3, 4])("renders exactly %i table card(s) with the matching 'pg count-%i' layout class", async (count) => {
    const session = sessionWithTables(count);
    vi.mocked(subscribeToSession).mockImplementation((_code, cb) => {
      cb(session);
      return () => {};
    });

    renderPublicView();

    await screen.findByText("Table 1");
    expect(document.querySelectorAll(".pc")).toHaveLength(count);
    expect(document.querySelector(`.pg.count-${count}`)).toBeInTheDocument();
  });

  it("sign-aware: a deficit table gets the 'def' modifier class and shows 'Deficit $X'; a surplus table does not", async () => {
    const session = sessionWithTables(2);
    vi.mocked(subscribeToSession).mockImplementation((_code, cb) => {
      cb(session);
      return () => {};
    });

    renderPublicView();

    const deficitCard = (await screen.findByText("Table 1")).closest(".pc");
    const surplusCard = screen.getByText("Table 2").closest(".pc");
    expect(deficitCard).toHaveClass("def");
    expect(deficitCard?.textContent).toMatch(/Deficit \$1/);
    expect(surplusCard).not.toHaveClass("def");
    expect(surplusCard?.textContent).toMatch(/Surplus \$1/);
  });
});
