// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import RankPrioritiesGrid from "./RankPrioritiesGrid";
import type { PriorityCard } from "../types/catalog";

const priorityCards: PriorityCard[] = [
  { id: "P1", title: "Economic Development", description: "Incentive for a new employer", amount: 1, linkedCardId: "R1", linkedCardType: "revenue" },
  { id: "P2", title: "Human Services", description: "Outreach funding", amount: 1, linkedCardId: "E1", linkedCardType: "expenditure" },
  { id: "P3", title: "Cultural", description: "Museum funding", amount: 1, linkedCardId: "E2", linkedCardType: "expenditure" },
];

describe("RankPrioritiesGrid", () => {
  afterEach(cleanup);

  it("Chair (interactive): renders real radio inputs in one named group, and calls onSelect with the right cardId", () => {
    const onSelect = vi.fn();
    render(<RankPrioritiesGrid priorityCards={priorityCards} selectedCardId="P1" onSelect={onSelect} />);

    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(3);
    expect(radios[0]).toBeChecked();
    expect(radios[1]).not.toBeChecked();

    fireEvent.click(radios[1]);
    expect(onSelect).toHaveBeenCalledWith("P2");
  });

  it("Chair: the selected card shows the checkmark badge, others don't", () => {
    render(<RankPrioritiesGrid priorityCards={priorityCards} selectedCardId="P2" onSelect={() => {}} />);
    const humanServicesCard = screen.getByText("Human Services").closest(".prio-card");
    const culturalCard = screen.getByText("Cultural").closest(".prio-card");
    expect(humanServicesCard).toHaveClass("sel");
    expect(humanServicesCard?.querySelector(".prio-card__check")).toBeInTheDocument();
    expect(culturalCard).not.toHaveClass("sel");
    expect(culturalCard?.querySelector(".prio-card__check")).not.toBeInTheDocument();
  });

  it("read-only (no onSelect): renders no real radio inputs, nothing is clickable/tappable, but the Chair's pick is still highlighted", () => {
    render(<RankPrioritiesGrid priorityCards={priorityCards} selectedCardId="P2" />);

    // No real, focusable/tappable <input> -- the read-only cards use role="radio" on a plain div purely to convey aria-checked state to screen readers.
    expect(document.querySelector("input[type='radio']")).not.toBeInTheDocument();
    for (const radio of screen.getAllByRole("radio")) expect(radio.tagName).toBe("DIV");

    const humanServicesCard = screen.getByText("Human Services").closest(".prio-card");
    expect(humanServicesCard).toHaveClass("sel readonly");
    expect(humanServicesCard?.querySelector(".prio-card__check")).toBeInTheDocument();
  });

  it("disables selection while busy, for the Chair", () => {
    render(<RankPrioritiesGrid priorityCards={priorityCards} selectedCardId="P1" onSelect={() => {}} disabled />);
    const radios = screen.getAllByRole("radio");
    for (const radio of radios) expect(radio).toBeDisabled();
  });
});
