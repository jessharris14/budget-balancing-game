import { describe, expect, it } from "vitest";
import { budgetEffectTone } from "./budgetEffectTone";

describe("budgetEffectTone", () => {
  it("classifies every real label from the shared vocabulary correctly", () => {
    expect(budgetEffectTone("Gain $1 revenue")).toBe("help");
    expect(budgetEffectTone("Save $1")).toBe("help");
    expect(budgetEffectTone("Spend $1")).toBe("hard");
    expect(budgetEffectTone("Lose $2 revenue")).toBe("hard");
    expect(budgetEffectTone("Spend $4 from reserves")).toBe("hard");
  });

  it("falls back to 'hard' for an unrecognized label rather than throwing", () => {
    expect(budgetEffectTone("Budget impact: $3")).toBe("hard");
    expect(budgetEffectTone("")).toBe("hard");
  });
});
