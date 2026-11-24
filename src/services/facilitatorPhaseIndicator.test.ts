import { describe, expect, it } from "vitest";
import { buildPhaseIndicator } from "./facilitatorPhaseIndicator";

describe("buildPhaseIndicator", () => {
  it("every pre-Rank-Priorities phase (lobby, overview, gameOverview, publicHearing, rollForChair) highlights the Lobby segment as 'now', with everything after it upcoming", () => {
    for (const phase of ["lobby", "overview", "gameOverview", "publicHearing", "rollForChair"] as const) {
      expect(buildPhaseIndicator(phase)).toEqual([
        { label: "Lobby", status: "now" },
        { label: "Rank Priorities", status: "upcoming" },
        { label: "Main Game", status: "upcoming" },
        { label: "Debrief", status: "upcoming" },
      ]);
    }
  });

  it("rankPriorities: Lobby done, Rank Priorities now, the rest upcoming", () => {
    expect(buildPhaseIndicator("rankPriorities")).toEqual([
      { label: "Lobby", status: "done" },
      { label: "Rank Priorities", status: "now" },
      { label: "Main Game", status: "upcoming" },
      { label: "Debrief", status: "upcoming" },
    ]);
  });

  it("mainGame: Lobby and Rank Priorities done, Main Game now, Debrief upcoming", () => {
    expect(buildPhaseIndicator("mainGame")).toEqual([
      { label: "Lobby", status: "done" },
      { label: "Rank Priorities", status: "done" },
      { label: "Main Game", status: "now" },
      { label: "Debrief", status: "upcoming" },
    ]);
  });

  it("debrief: everything else done, Debrief now", () => {
    expect(buildPhaseIndicator("debrief")).toEqual([
      { label: "Lobby", status: "done" },
      { label: "Rank Priorities", status: "done" },
      { label: "Main Game", status: "done" },
      { label: "Debrief", status: "now" },
    ]);
  });
});
