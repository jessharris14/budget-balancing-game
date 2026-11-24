import { describe, expect, it } from "vitest";
import { formatClock } from "./useCountdown";

describe("formatClock", () => {
  it("formats a normal duration as M:SS", () => {
    expect(formatClock(5 * 60 * 1000)).toBe("5:00");
    expect(formatClock(74 * 1000)).toBe("1:14");
  });

  it("formats exactly 0 as a real, valid countdown value, not a missing one", () => {
    expect(formatClock(0)).toBe("0:00");
  });

  it("shows the neutral placeholder for undefined (RTDB-pruned 'unset' field)", () => {
    expect(formatClock(undefined)).toBe("--:--");
  });

  it("shows the neutral placeholder for null", () => {
    expect(formatClock(null)).toBe("--:--");
  });

  it("shows the neutral placeholder for NaN -- never 'NaN:NaN'", () => {
    expect(formatClock(NaN)).toBe("--:--");
  });

  it("shows the neutral placeholder for a negative value", () => {
    expect(formatClock(-1000)).toBe("--:--");
  });
});
