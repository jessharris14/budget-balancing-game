// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CardUnderDebateBar from "./CardUnderDebateBar";

describe("CardUnderDebateBar", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("shows the card title, Budget effect label, and a normal-style countdown", () => {
    render(<CardUnderDebateBar cardTitle="Cut a Program" budgetEffectLabel="Save $1" debateTimerEndsAt={5 * 60 * 1000} />);
    expect(screen.getByText("Cut a Program")).toBeInTheDocument();
    expect(screen.getByText("Save $1")).toBeInTheDocument();
    const timer = screen.getByText(/⏱ 5:00/);
    expect(timer).not.toHaveClass("debate-bar__timer--urgent");
  });

  it("switches to the urgent style in the last 10 seconds", () => {
    render(<CardUnderDebateBar cardTitle="Cut a Program" budgetEffectLabel="Save $1" debateTimerEndsAt={8000} />);
    const timer = screen.getByText(/⏱ 0:08/);
    expect(timer).toHaveClass("debate-bar__timer--urgent");
  });

  it("shows 'Time is up' once the deadline passes, and keeps showing the bar", () => {
    vi.setSystemTime(10_000);
    render(<CardUnderDebateBar cardTitle="Cut a Program" budgetEffectLabel="Save $1" debateTimerEndsAt={1000} />);
    expect(screen.getByText(/Time is up/)).toBeInTheDocument();
    expect(screen.getByText("Cut a Program")).toBeInTheDocument();
  });

  it("shows a neutral 'Waiting for Chair' pill (not a blank or NaN timer) when debateTimerEndsAt is null", () => {
    render(<CardUnderDebateBar cardTitle="Cut a Program" budgetEffectLabel="Save $1" debateTimerEndsAt={null} />);
    expect(screen.queryByText(/⏱|Time is up|NaN/)).not.toBeInTheDocument();
    const pill = screen.getByText("Waiting for Chair");
    expect(pill).toHaveClass("debate-bar__timer--waiting");
    expect(pill).not.toHaveClass("debate-bar__timer--urgent");
  });

  // The actual live-app bug: a motion seconded before the Chair starts the
  // debate timer means this prop is undefined at runtime (RTDB prunes an
  // unset field to "key absent"), not the null its declared type promises
  // -- this must behave identically to the null case above, not "NaN:NaN".
  it("shows the same 'Waiting for Chair' pill when debateTimerEndsAt is undefined (seconded but timer not started)", () => {
    render(<CardUnderDebateBar cardTitle="Cut a Program" budgetEffectLabel="Save $1" debateTimerEndsAt={undefined} />);
    expect(screen.queryByText(/⏱|Time is up|NaN/)).not.toBeInTheDocument();
    expect(screen.getByText("Waiting for Chair")).toBeInTheDocument();
  });
});
