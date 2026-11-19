// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import CardIcon from "./CardIcon";
import { CARD_TYPE_FALLBACK_ICON, cardIconUrl } from "../services/icons";

describe("CardIcon", () => {
  afterEach(cleanup);

  it("renders the catalog icon for the card id by default", () => {
    const { container } = render(<CardIcon cardId="E14" cardType="expenditure" />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe(cardIconUrl("E14"));
  });

  it("falls back to the expenditure type icon when a card id has no icon file (e.g. E14/E15/E16)", () => {
    const { container } = render(<CardIcon cardId="E14" cardType="expenditure" />);
    const img = container.querySelector("img")!;
    fireEvent.error(img);
    expect(img.getAttribute("src")).toBe(CARD_TYPE_FALLBACK_ICON.expenditure);
  });

  it("falls back to the matching type icon for revenue/challenge/priority too", () => {
    const cases: Array<["revenue" | "challenge" | "priority", string]> = [
      ["revenue", "Rzz"],
      ["challenge", "Czz"],
      ["priority", "Pzz"],
    ];
    for (const [cardType, cardId] of cases) {
      const { container, unmount } = render(<CardIcon cardId={cardId} cardType={cardType} />);
      const img = container.querySelector("img")!;
      fireEvent.error(img);
      expect(img.getAttribute("src")).toBe(CARD_TYPE_FALLBACK_ICON[cardType]);
      unmount();
    }
  });

  it("never leaves the broken src in place after an error -- it always lands on a defined fallback", () => {
    const { container } = render(<CardIcon cardId="missing-id" cardType="revenue" />);
    const img = container.querySelector("img")!;
    fireEvent.error(img);
    expect(img.getAttribute("src")).toBeTruthy();
    expect(img.getAttribute("src")).not.toBe(cardIconUrl("missing-id"));
  });
});
