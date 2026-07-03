/**
 * Model routing (H9.3 → H9.8): decide which local model should answer a request.
 * Pure + tiny so it's trivially verifiable; the caller does the actual serving.
 */
export type VisionRoute = "primary" | "route-vision" | "warn-no-vision";

/**
 * Vision routing: an image request needs a model that can see.
 * - no images, or the active model already has vision → use the primary model.
 * - active is text-only but a vision model is installed → route to the vision model.
 * - active is text-only and none installed → warn (can't see the image).
 */
export function decideVisionRoute(opts: {
  hasImages: boolean;
  activeHasVision: boolean;
  installedVisionIds: readonly string[];
}): VisionRoute {
  if (!opts.hasImages || opts.activeHasVision) return "primary";
  return opts.installedVisionIds.length > 0 ? "route-vision" : "warn-no-vision";
}
