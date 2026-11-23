// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardCatalog } from "../types/catalog";
import type { Commission, Session, Speaker } from "../types/session";

vi.mock("../services/catalogService", () => ({
  getCatalog: vi.fn(),
}));

import { getCatalog } from "../services/catalogService";
import SpeakerView from "./SpeakerView";

const catalog: CardCatalog = {
  catalogVersion: "test",
  revenueCards: [],
  expenditureCards: [],
  challengeCards: [],
  priorityCards: [],
  budgetPicture: { currentBudget: 0, projectedRevenue: 0, projectedExpenditure: 0, shortfall: 0, narrative: "" },
  reservePolicy: { max: 20, minimum: 10 },
  promptBank: [{ id: "p1", theme: "general-devils-advocate", text: "Why should we trust this number?" }],
};

function baseCommission(): Commission {
  return {
    id: "c1",
    name: "Table 1",
    members: { managerAdminId: "admin-1", chairId: "chair-1", commissionerIds: {} },
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
  };
}

const speaker: Speaker = { id: "speaker-1", name: "Sam Speaker", commissionId: "c1", assignedPrompts: ["p1"], endorsementsUsed: {}, rerollCount: 0 };

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

describe("SpeakerView: Your Prompts renders exactly once", () => {
  beforeEach(() => {
    vi.mocked(getCatalog).mockResolvedValue(catalog);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders Your Prompt(s) exactly once at desktop width, inside the right column below Endorse/Oppose", async () => {
    stubDesktopMatchMedia();
    const commission = baseCommission();
    render(<SpeakerView code="TEST" session={baseSession(commission)} speaker={speaker} />);

    const prompt = await screen.findByText("Why should we trust this number?");
    expect(screen.getAllByText("Why should we trust this number?")).toHaveLength(1);

    // There's no separate full-width panel above the two-column body on desktop.
    const dbody = document.querySelector(".dbody");
    expect(dbody).not.toBeNull();
    expect(dbody!.contains(prompt)).toBe(true);

    // Inside the right (non-sticky) column, after the Endorse/Oppose panel.
    const rightCol = document.querySelector(".dcol:not(.sticky)");
    expect(rightCol).not.toBeNull();
    const panels = Array.from(rightCol!.querySelectorAll(":scope > .panel"));
    const endorseIdx = panels.findIndex((p) => p.textContent?.includes("Endorse / Oppose"));
    const promptsIdx = panels.findIndex((p) => p.textContent?.includes("Your Prompt"));
    expect(endorseIdx).toBeGreaterThanOrEqual(0);
    expect(promptsIdx).toBeGreaterThan(endorseIdx);
  });

  it("renders Your Prompt(s) exactly once at phone width, in its original top position", async () => {
    const commission = baseCommission();
    render(<SpeakerView code="TEST" session={baseSession(commission)} speaker={speaker} />);

    await screen.findByText("Why should we trust this number?");
    expect(screen.getAllByText("Why should we trust this number?")).toHaveLength(1);
    expect(document.querySelector(".dbody")).not.toBeInTheDocument();
  });
});
