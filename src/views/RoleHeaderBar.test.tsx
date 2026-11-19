// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import RoleHeaderBar from "./RoleHeaderBar";

afterEach(cleanup);

/**
 * Fix 2: the role name and session code must never be the things that get
 * cut off on a phone. jsdom doesn't run real CSS layout/media queries, so
 * this can't measure actual rendered width at 320px/375px -- instead it
 * asserts the contract the CSS relies on: the short role label and the
 * code chip are always rendered as their own, complete, untruncated text
 * nodes (no slicing, no ellipsis applied in script), even with the
 * longest names in the app. The 320px/375px screenshots in the delivery
 * report are the actual visual check.
 */
describe("RoleHeaderBar: role name and code are never truncated (Fix 2)", () => {
  it("renders the full short role label and the full code, verbatim, for the longest role", () => {
    render(
      <RoleHeaderBar
        viewLabel="Manager/Administrator View"
        shortRoleLabel="Administrator"
        tableName="Ottawa-Kalamazoo Regional Joint Commission"
        code="YMKLWXQZ"
        phaseLabel="Main Game"
        activityEntries={[]}
        activityStorageKey="test-key"
      />,
    );

    expect(screen.getByText("Administrator")).toBeInTheDocument();
    expect(screen.getByText("YMKLWXQZ")).toBeInTheDocument();
  });

  it("renders every short role label exactly as given for each role", () => {
    for (const short of ["Commissioner", "Chair", "Administrator", "Speaker"]) {
      const { unmount } = render(
        <RoleHeaderBar
          viewLabel="Some View"
          shortRoleLabel={short}
          tableName="Table"
          code="ABCD"
          phaseLabel="Main Game"
          activityEntries={[]}
          activityStorageKey={`test-key-${short}`}
        />,
      );
      expect(screen.getByText(short)).toBeInTheDocument();
      unmount();
    }
  });

  it("also keeps the full view label and table name available (for laptop widths)", () => {
    render(
      <RoleHeaderBar
        viewLabel="Public Hearing Speaker View"
        shortRoleLabel="Speaker"
        tableName="Kent County"
        code="TEST"
        phaseLabel="Main Game"
        activityEntries={[]}
        activityStorageKey="test-key"
      />,
    );
    expect(screen.getByText("Public Hearing Speaker View — Kent County")).toBeInTheDocument();
  });

  it("the Activity button keeps its accessible name even when its visible label is hidden on phone", () => {
    render(
      <RoleHeaderBar
        viewLabel="Commissioner View"
        shortRoleLabel="Commissioner"
        tableName="Kent County"
        code="TEST"
        phaseLabel="Main Game"
        activityEntries={[]}
        activityStorageKey="test-key"
      />,
    );
    expect(screen.getByRole("button", { name: "Activity" })).toBeInTheDocument();
  });
});
