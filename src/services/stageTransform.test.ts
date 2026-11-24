import { describe, expect, it } from "vitest";
import { computeStageTransform } from "./stageTransform";

const STAGE_W = 1920;
const STAGE_H = 1080;

describe("computeStageTransform", () => {
  it("exact 16:9 viewports (1280x720, 1920x1080, 3840x2160) scale to fill it exactly, no letterbox", () => {
    for (const [w, h] of [
      [1280, 720],
      [1920, 1080],
      [3840, 2160],
    ] as const) {
      const t = computeStageTransform(w, h, STAGE_W, STAGE_H);
      expect(t.scale).toBeCloseTo(w / STAGE_W, 10);
      expect(t.left).toBeCloseTo(0, 5);
      expect(t.top).toBeCloseTo(0, 5);
    }
  });

  it("1366x768 (very slightly wider than 16:9) is height-constrained -- scaled to fit height, centered with a thin horizontal letterbox", () => {
    const t = computeStageTransform(1366, 768, STAGE_W, STAGE_H);
    expect(t.scale).toBeCloseTo(768 / STAGE_H, 10);
    expect(t.top).toBeCloseTo(0, 5);
    expect(t.left).toBeGreaterThan(0);
    // The scaled stage must fit exactly within the viewport width.
    expect(STAGE_W * t.scale + t.left * 2).toBeCloseTo(1366, 5);
  });

  it("a 4:3 viewport (1024x768) is width-constrained -- scaled to fit width, centered with a vertical letterbox (top and bottom bars)", () => {
    const t = computeStageTransform(1024, 768, STAGE_W, STAGE_H);
    expect(t.scale).toBeCloseTo(1024 / STAGE_W, 10);
    expect(t.left).toBeCloseTo(0, 5);
    expect(t.top).toBeGreaterThan(0);
    expect(STAGE_H * t.scale + t.top * 2).toBeCloseTo(768, 5);
  });

  it("a tall/portrait-ish viewport (900x1600) is width-constrained the same way", () => {
    const t = computeStageTransform(900, 1600, STAGE_W, STAGE_H);
    expect(t.scale).toBeCloseTo(900 / STAGE_W, 10);
    expect(t.top).toBeGreaterThan(0);
  });
});
