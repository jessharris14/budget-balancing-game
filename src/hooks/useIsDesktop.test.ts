// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useIsDesktop } from "./useIsDesktop";

function stubMatchMedia(initialMatches: boolean) {
  const listeners = new Set<() => void>();
  let matches = initialMatches;
  const mql = {
    get matches() {
      return matches;
    },
    media: "(min-width: 1024px)",
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
  };
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue(mql));
  return {
    setMatches(next: boolean) {
      matches = next;
      listeners.forEach((cb) => cb());
    },
  };
}

describe("useIsDesktop", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults to false when matchMedia isn't available (this project's test environment)", () => {
    // No stub installed -- matches this repo's actual jsdom, which has no matchMedia at all.
    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(false);
  });

  it("reflects a true match from matchMedia", () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(true);
  });

  it("reflects a false match from matchMedia", () => {
    stubMatchMedia(false);
    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(false);
  });

  it("updates live when the viewport crosses the breakpoint", () => {
    const control = stubMatchMedia(false);
    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(false);

    act(() => control.setMatches(true));
    expect(result.current).toBe(true);

    act(() => control.setMatches(false));
    expect(result.current).toBe(false);
  });
});
