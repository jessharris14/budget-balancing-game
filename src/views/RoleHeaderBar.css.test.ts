/// <reference types="node" />
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "RoleHeaderBar.css"), "utf-8");

/**
 * Fix 1's root cause was exactly this: bar 2's background was
 * `rgba(74, 42, 138, 0.06)` -- 94% see-through, so scrolled table rows
 * behind it read right through it. jsdom doesn't run real CSS layout, so
 * this checks the source directly: both sticky bars' `background` must be
 * a solid color (a hex value, never an rgba()/hsla() with any alpha), and
 * neither may use backdrop-filter/opacity, which would reintroduce the
 * same see-through effect a different way.
 */
function ruleBodyFor(selector: string): string {
  const ruleMatch = css.match(new RegExp(`${selector.replace(/[.#]/g, "\\$&")}\\s*{([^}]*)}`));
  expect(ruleMatch, `expected a ${selector} rule in RoleHeaderBar.css`).toBeTruthy();
  return ruleMatch![1];
}

function backgroundFor(selector: string): string {
  const bgMatch = ruleBodyFor(selector).match(/background:\s*([^;]+);/);
  expect(bgMatch, `expected a background declaration in ${selector}`).toBeTruthy();
  return bgMatch![1].trim();
}

describe("RoleHeaderBar.css: opaque sticky bars (Fix 1)", () => {
  it("bar 1 (.role-header-bar) has a solid hex background, no alpha", () => {
    const bg = backgroundFor(".role-header-bar");
    expect(bg).toMatch(/^#[0-9a-fA-F]{3,8}$/);
    expect(bg.toLowerCase()).not.toBe("transparent");
  });

  it("bar 2 (.debate-bar) has a solid hex background, no alpha", () => {
    const bg = backgroundFor(".debate-bar");
    expect(bg).toMatch(/^#[0-9a-fA-F]{3,8}$/);
  });

  it("neither bar uses backdrop-filter or a non-opaque CSS opacity", () => {
    for (const selector of [".role-header-bar", ".debate-bar"]) {
      const body = ruleBodyFor(selector);
      expect(body).not.toMatch(/backdrop-filter/);
      expect(body).not.toMatch(/opacity:\s*0?\.\d/);
    }
  });

  it("bar 2 sits below bar 1 but above ordinary page content (z-index ordering)", () => {
    const zIndexFor = (selector: string) => {
      const match = ruleBodyFor(selector).match(/z-index:\s*(\d+);/);
      return Number(match![1]);
    };
    const bar1Z = zIndexFor(".role-header-bar");
    const bar2Z = zIndexFor(".debate-bar");
    // Ordinary page content never sets z-index at all (stacking level 0),
    // so anything with an explicit z-index already paints above it.
    expect(bar1Z).toBeGreaterThan(0);
    expect(bar2Z).toBeGreaterThan(0);
    expect(bar1Z).toBeGreaterThan(bar2Z);
  });
});
