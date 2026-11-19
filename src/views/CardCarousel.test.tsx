// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import CardCarousel from "./CardCarousel";
import type { CardDisplayItem } from "../services/cardDisplay";

function item(overrides: Partial<CardDisplayItem>): CardDisplayItem {
  return {
    cardId: "R1",
    cardType: "revenue",
    title: "Card",
    impactBullets: ["Does a thing."],
    effectLabel: "Gain revenue",
    effectTone: "help",
    status: "available",
    statusLabel: "Available",
    isPriority: false,
    ...overrides,
  };
}

const revenueItems: CardDisplayItem[] = [
  item({ cardId: "R1", title: "Revenue One" }),
  item({ cardId: "R2", title: "Revenue Two" }),
  item({ cardId: "R3", title: "Revenue Three" }),
];

describe("CardCarousel", () => {
  afterEach(cleanup);

  it("moves to the next slide on the Next arrow", () => {
    render(<CardCarousel items={revenueItems} />);
    expect(screen.getByText("1 of 3")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Next card"));
    expect(screen.getByText("2 of 3")).toBeInTheDocument();
  });

  it("keeps the current position when only card statuses change, not which cards exist", () => {
    const { rerender } = render(<CardCarousel items={revenueItems} />);
    fireEvent.click(screen.getByLabelText("Next card"));
    expect(screen.getByText("2 of 3")).toBeInTheDocument();

    const updatedItems = revenueItems.map((it) => (it.cardId === "R2" ? { ...it, status: "applied" as const, statusLabel: "Applied" } : it));
    rerender(<CardCarousel items={updatedItems} />);

    expect(screen.getByText("2 of 3")).toBeInTheDocument();
  });

  it("remembers a separate position per card type and restores it when switching back", () => {
    const expenditureItems: CardDisplayItem[] = [
      item({ cardId: "E1", cardType: "expenditure", title: "Expenditure One" }),
      item({ cardId: "E2", cardType: "expenditure", title: "Expenditure Two" }),
    ];

    const { rerender } = render(<CardCarousel items={revenueItems} />);
    fireEvent.click(screen.getByLabelText("Next card"));
    expect(screen.getByText("2 of 3")).toBeInTheDocument();

    rerender(<CardCarousel items={expenditureItems} />);
    expect(screen.getByText("1 of 2")).toBeInTheDocument();

    rerender(<CardCarousel items={revenueItems} />);
    expect(screen.getByText("2 of 3")).toBeInTheDocument();
  });
});
