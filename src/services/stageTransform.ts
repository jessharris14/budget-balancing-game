export interface StageTransform {
  scale: number;
  left: number;
  top: number;
}

/**
 * Pure "scale a fixed stage to fit any viewport, centered, letterboxed on
 * whichever axis has room to spare" math behind the Public View's 16:9
 * projector stage (PublicView.tsx's useStageTransform) -- the single CSS
 * scale transform the design brief calls for, so the page itself never
 * scrolls or clips at any resolution. Pulled out so the arithmetic is
 * directly testable without a real browser viewport.
 */
export function computeStageTransform(
  viewportWidth: number,
  viewportHeight: number,
  stageWidth: number,
  stageHeight: number,
): StageTransform {
  const scale = Math.min(viewportWidth / stageWidth, viewportHeight / stageHeight);
  const left = (viewportWidth - stageWidth * scale) / 2;
  const top = (viewportHeight - stageHeight * scale) / 2;
  return { scale, left, top };
}
