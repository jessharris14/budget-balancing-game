import { describe, expect, it } from "vitest";
import { challengeLedgerDelta, getChallengeLedgerEffect, labelFor } from "./challengeLedgerEffect";
import type { ChallengeCard, EffectDirection } from "../types/catalog";

/**
 * Mirrors scripts/seed/countyBudgetSim_v1.json's challengeCards exactly
 * (id, amount, target, direction) -- the fields getChallengeLedgerEffect
 * actually reads. title/printedText/facilitatorNarrative are irrelevant to
 * the ledger math tested here, so they're left blank rather than
 * duplicated from the real catalog text.
 */
function card(id: string, amount: number, target: "deficit" | "reserves", direction: EffectDirection): ChallengeCard {
  return { id, title: id, printedText: "", facilitatorNarrative: "", amount, target, direction };
}

const CATALOG_CHALLENGES: Record<string, ChallengeCard> = {
  C1: card("C1", 4, "reserves", "decrease"),
  C2: card("C2", 1, "deficit", "increase"),
  C3: card("C3", 1, "deficit", "decrease"),
  C4: card("C4", 2, "deficit", "increase"),
  C5: card("C5", 1, "deficit", "increase"),
  C6: card("C6", 2, "deficit", "increase"),
  C7: card("C7", 1, "deficit", "increase"),
  C8: card("C8", 1, "deficit", "increase"),
  C9: card("C9", 1, "deficit", "increase"),
  C10: card("C10", 1, "deficit", "increase"),
  C11: card("C11", 1, "deficit", "increase"),
};

const SAMPLE_LEDGER = { revenue: 101, expenditures: 106, reserves: 20 };

function applyToSampleLedger(c: ChallengeCard) {
  const delta = challengeLedgerDelta(getChallengeLedgerEffect(c));
  const revenue = SAMPLE_LEDGER.revenue + delta.revenueDelta;
  const expenditures = SAMPLE_LEDGER.expenditures + delta.expenditureDelta;
  const reserves = SAMPLE_LEDGER.reserves + delta.reservesDelta;
  return { revenue, expenditures, reserves, deficitOrSurplus: revenue - expenditures };
}

describe("getChallengeLedgerEffect: every seeded challenge", () => {
  it("C1 Natural Disaster -- Reserves -$4, Revenue/Expenditures untouched", () => {
    const result = applyToSampleLedger(CATALOG_CHALLENGES.C1);
    expect(result).toEqual({ revenue: 101, expenditures: 106, reserves: 16, deficitOrSurplus: -5 });
    expect(getChallengeLedgerEffect(CATALOG_CHALLENGES.C1).label).toBe("Spend $4 from reserves");
  });

  it("C2 Mandated State Payments -- Expenditures +$1 (Spend $1)", () => {
    const result = applyToSampleLedger(CATALOG_CHALLENGES.C2);
    expect(result).toEqual({ revenue: 101, expenditures: 107, reserves: 20, deficitOrSurplus: -6 });
    expect(getChallengeLedgerEffect(CATALOG_CHALLENGES.C2).label).toBe("Spend $1");
  });

  it("C3 Eliminate Waste, Fraud and Abuse -- Expenditures -$1 (Save $1)", () => {
    const result = applyToSampleLedger(CATALOG_CHALLENGES.C3);
    expect(result).toEqual({ revenue: 101, expenditures: 105, reserves: 20, deficitOrSurplus: -4 });
    expect(getChallengeLedgerEffect(CATALOG_CHALLENGES.C3).label).toBe("Save $1");
  });

  it("C4 Reduction in Final Property Values -- Revenue -$2 (Lose $2 revenue)", () => {
    const result = applyToSampleLedger(CATALOG_CHALLENGES.C4);
    expect(result).toEqual({ revenue: 99, expenditures: 106, reserves: 20, deficitOrSurplus: -7 });
    expect(getChallengeLedgerEffect(CATALOG_CHALLENGES.C4).label).toBe("Lose $2 revenue");
  });

  it("C5 Major Fire -- Expenditures +$1 (Spend $1)", () => {
    const result = applyToSampleLedger(CATALOG_CHALLENGES.C5);
    expect(result).toEqual({ revenue: 101, expenditures: 107, reserves: 20, deficitOrSurplus: -6 });
    expect(getChallengeLedgerEffect(CATALOG_CHALLENGES.C5).label).toBe("Spend $1");
  });

  it("C6 Increased Healthcare Costs -- Expenditures +$2 (Spend $2)", () => {
    const result = applyToSampleLedger(CATALOG_CHALLENGES.C6);
    expect(result).toEqual({ revenue: 101, expenditures: 108, reserves: 20, deficitOrSurplus: -7 });
    expect(getChallengeLedgerEffect(CATALOG_CHALLENGES.C6).label).toBe("Spend $2");
  });

  it("C7 Emergency Road Repair -- Expenditures +$1 (Spend $1)", () => {
    const result = applyToSampleLedger(CATALOG_CHALLENGES.C7);
    expect(result).toEqual({ revenue: 101, expenditures: 107, reserves: 20, deficitOrSurplus: -6 });
    expect(getChallengeLedgerEffect(CATALOG_CHALLENGES.C7).label).toBe("Spend $1");
  });

  it("C8 Decrease in State Shared Revenue -- Revenue -$1 (Lose $1 revenue)", () => {
    const result = applyToSampleLedger(CATALOG_CHALLENGES.C8);
    expect(result).toEqual({ revenue: 100, expenditures: 106, reserves: 20, deficitOrSurplus: -6 });
    expect(getChallengeLedgerEffect(CATALOG_CHALLENGES.C8).label).toBe("Lose $1 revenue");
  });

  it("C9 Fuel/Utility Increase -- Expenditures +$1 (Spend $1)", () => {
    const result = applyToSampleLedger(CATALOG_CHALLENGES.C9);
    expect(result).toEqual({ revenue: 101, expenditures: 107, reserves: 20, deficitOrSurplus: -6 });
    expect(getChallengeLedgerEffect(CATALOG_CHALLENGES.C9).label).toBe("Spend $1");
  });

  it("C10 Economic Opportunity -- Expenditures +$1 (Spend $1)", () => {
    const result = applyToSampleLedger(CATALOG_CHALLENGES.C10);
    expect(result).toEqual({ revenue: 101, expenditures: 107, reserves: 20, deficitOrSurplus: -6 });
    expect(getChallengeLedgerEffect(CATALOG_CHALLENGES.C10).label).toBe("Spend $1");
  });

  it("C11 Replace Supervisor of Election Equipment -- Expenditures +$1 (Spend $1)", () => {
    const result = applyToSampleLedger(CATALOG_CHALLENGES.C11);
    expect(result).toEqual({ revenue: 101, expenditures: 107, reserves: 20, deficitOrSurplus: -6 });
    expect(getChallengeLedgerEffect(CATALOG_CHALLENGES.C11).label).toBe("Spend $1");
  });

  it("every seeded challenge's result always reconciles: deficitOrSurplus === revenue - expenditures", () => {
    for (const c of Object.values(CATALOG_CHALLENGES)) {
      const result = applyToSampleLedger(c);
      expect(result.deficitOrSurplus).toBe(result.revenue - result.expenditures);
    }
  });
});

describe("getChallengeLedgerEffect: unknown challenge id fallback", () => {
  it("routes an unmapped deficit-target, increase-direction card through Expenditures, reconciling", () => {
    const unknown = card("C99", 5, "deficit", "increase");
    const result = applyToSampleLedger(unknown);
    expect(result).toEqual({ revenue: 101, expenditures: 111, reserves: 20, deficitOrSurplus: -10 });
    expect(getChallengeLedgerEffect(unknown).label).toContain("Budget impact");
  });

  it("routes an unmapped deficit-target, decrease-direction card through Expenditures the other way", () => {
    const unknown = card("C99", 3, "deficit", "decrease");
    const effect = getChallengeLedgerEffect(unknown);
    expect(effect.line).toBe("expenditures");
    expect(effect.amount).toBe(-3);
  });

  it("an unmapped reserves-target card still only touches Reserves", () => {
    const unknown = card("C99", 7, "reserves", "decrease");
    const effect = getChallengeLedgerEffect(unknown);
    expect(effect.line).toBe("reserves");
    expect(effect.amount).toBe(-7);
    const result = applyToSampleLedger(unknown);
    expect(result.revenue).toBe(101);
    expect(result.expenditures).toBe(106);
  });
});

describe("labelFor: the not-yet-seeded 'revenue increases' case", () => {
  it("produces a 'Gain $X revenue' label, ready for a future challenge that raises revenue", () => {
    expect(labelFor("revenue", "increase", 1)).toBe("Gain $1 revenue");
  });
});

describe("several challenges applied together stay reconciled", () => {
  it("Major Fire, then Property Values, then Eliminate Waste, then Natural Disaster", () => {
    let ledger = { revenue: 101, expenditures: 106, reserves: 20 };
    const apply = (c: ChallengeCard) => {
      const delta = challengeLedgerDelta(getChallengeLedgerEffect(c));
      ledger = {
        revenue: ledger.revenue + delta.revenueDelta,
        expenditures: ledger.expenditures + delta.expenditureDelta,
        reserves: ledger.reserves + delta.reservesDelta,
      };
    };

    apply(CATALOG_CHALLENGES.C5); // Major Fire: Expenditures +1
    expect(ledger).toEqual({ revenue: 101, expenditures: 107, reserves: 20 });
    expect(ledger.revenue - ledger.expenditures).toBe(-6);

    apply(CATALOG_CHALLENGES.C4); // Property Values: Revenue -2
    expect(ledger).toEqual({ revenue: 99, expenditures: 107, reserves: 20 });
    expect(ledger.revenue - ledger.expenditures).toBe(-8);

    apply(CATALOG_CHALLENGES.C3); // Eliminate Waste: Expenditures -1
    expect(ledger).toEqual({ revenue: 99, expenditures: 106, reserves: 20 });
    expect(ledger.revenue - ledger.expenditures).toBe(-7);

    apply(CATALOG_CHALLENGES.C1); // Natural Disaster: Reserves -4
    expect(ledger).toEqual({ revenue: 99, expenditures: 106, reserves: 16 });
    expect(ledger.revenue - ledger.expenditures).toBe(-7);
  });
});
