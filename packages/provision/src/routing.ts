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

// --- Capability router (H9.8): pick the best AVAILABLE model per task ---
export type TaskKind = "vision" | "code" | "chat";

const CODE_HINT = /\b(build|make|create|code|app|tool|website|web app|page|form|dashboard|tracker|calculator|timer|game|component|function|script|ui|button|add (a|an)|generate)\b/i;
const CODER_ID = /(coder|[-_]code|deepseek.*coder|qwen.*coder)/i;

/** Cheap, deterministic task classification from the request + whether images are attached. */
export function classifyTask(request: string, hasImages: boolean): TaskKind {
  if (hasImages) return "vision";
  return CODE_HINT.test(request) ? "code" : "chat";
}

export function isCoderModel(id: string): boolean {
  return CODER_ID.test(id);
}

/**
 * Route a task to the best INSTALLED model — a generalization of vision routing:
 * - vision task → a vision model (if one is installed), else the active model.
 * - code task → a coder model (if one is installed and the active isn't already a coder),
 *   else the active model.
 * - chat → the active model.
 * Never requires a non-installed model; falls back to `activeId` cleanly.
 */
export function routeModel(opts: {
  task: TaskKind;
  activeId: string | null;
  installedIds: readonly string[];
  visionIds: readonly string[];
}): { modelId: string | null; reason: string } {
  const active = opts.activeId;
  if (opts.task === "vision") {
    if (active && opts.visionIds.includes(active)) return { modelId: active, reason: "active model can see" };
    const v = opts.visionIds[0];
    if (v) return { modelId: v, reason: "vision task → vision model" };
    return { modelId: active, reason: "no vision model installed" };
  }
  if (opts.task === "code") {
    if (active && isCoderModel(active)) return { modelId: active, reason: "active model is a coder" };
    const coder = opts.installedIds.find(isCoderModel);
    if (coder) return { modelId: coder, reason: "code task → coder model" };
    return { modelId: active, reason: "no coder installed" };
  }
  return { modelId: active, reason: "chat → active model" };
}
