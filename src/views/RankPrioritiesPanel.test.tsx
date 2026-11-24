// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import RankPrioritiesPanel from "./RankPrioritiesPanel";
import type { PriorityCard } from "../types/catalog";

const priorityCards: PriorityCard[] = [
  { id: "P1", title: "Economic Development", description: "Incentive for a new employer", amount: 1, linkedCardId: "R1", linkedCardType: "revenue" },
  { id: "P2", title: "Human Services", description: "Outreach funding", amount: 1, linkedCardId: "E1", linkedCardType: "expenditure" },
];

describe("RankPrioritiesPanel", () => {
  afterEach(cleanup);

  it("left-aligns the heading/countdown/status line and shows the countdown when a phase timer is running", () => {
    render(<RankPrioritiesPanel priorityCards={priorityCards} selectedCardId="P1" phaseTimerMs={134000} onSelect={vi.fn()} />);

    const panel = screen.getByText("Rank Priorities").closest(".panel") as HTMLElement;
    expect(panel).toHaveStyle({ textAlign: "left" });
    expect(screen.getByText("Time remaining: 2:14")).toBeInTheDocument();
    expect(screen.getByText("Selected: Economic Development")).toBeInTheDocument();
  });

  it("omits the countdown line entirely (not '--:--') when there is no phase timer", () => {
    render(<RankPrioritiesPanel priorityCards={priorityCards} selectedCardId={null} phaseTimerMs={null} />);

    expect(screen.queryByText(/Time remaining/)).not.toBeInTheDocument();
    expect(screen.getByText("Selected: not yet recorded by the Chair")).toBeInTheDocument();
  });

  it("is read-only (no onSelect) and still highlights the Chair's pick", () => {
    render(<RankPrioritiesPanel priorityCards={priorityCards} selectedCardId="P2" phaseTimerMs={null} />);

    expect(document.querySelector("input[type='radio']")).not.toBeInTheDocument();
    expect(screen.getByText("Human Services").closest(".prio-card")).toHaveClass("sel");
  });
});
