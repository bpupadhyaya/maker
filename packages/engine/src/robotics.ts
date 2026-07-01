/**
 * The robotics domain's artifact + a local simulator (H4). Maker emits a robot
 * action plan (a reserved ```robot``` block); simulateRobot "runs" it against a
 * virtual arm so the plan is verifiable offline — the always-runnable invariant
 * extended to robotics. Driving a REAL robot (ROS/serial/hardware) is needs-user.
 */

export type RobotAction =
  | { readonly op: "move"; readonly x: number; readonly y: number }
  | { readonly op: "grip" }
  | { readonly op: "release" }
  | { readonly op: "wait"; readonly ms: number };

export interface RobotState {
  readonly x: number;
  readonly y: number;
  readonly gripping: boolean;
}

export interface SimResult {
  readonly trace: readonly string[];
  readonly state: RobotState;
}

/** Parse a reserved ```robot``` JSON block into an action plan. */
export function parseRobotPlan(text: string): RobotAction[] {
  const m = /```robot[^\n]*\n([\s\S]*?)```/.exec(text);
  if (!m) return [];
  try {
    const arr: unknown = JSON.parse(m[1] ?? "");
    if (!Array.isArray(arr)) return [];
    const plan: RobotAction[] = [];
    for (const it of arr) {
      if (it === null || typeof it !== "object") continue;
      const o = it as Record<string, unknown>;
      if (o["op"] === "move" && typeof o["x"] === "number" && typeof o["y"] === "number") {
        plan.push({ op: "move", x: o["x"], y: o["y"] });
      } else if (o["op"] === "grip") {
        plan.push({ op: "grip" });
      } else if (o["op"] === "release") {
        plan.push({ op: "release" });
      } else if (o["op"] === "wait" && typeof o["ms"] === "number") {
        plan.push({ op: "wait", ms: o["ms"] });
      }
    }
    return plan;
  } catch {
    return [];
  }
}

/** Execute a plan against a virtual arm; returns a trace + final state. */
export function simulateRobot(
  plan: readonly RobotAction[],
  start: RobotState = { x: 0, y: 0, gripping: false },
): SimResult {
  let s = start;
  const trace: string[] = [];
  for (const a of plan) {
    switch (a.op) {
      case "move":
        s = { ...s, x: a.x, y: a.y };
        trace.push(`move → (${a.x}, ${a.y})`);
        break;
      case "grip":
        s = { ...s, gripping: true };
        trace.push("grip (closed)");
        break;
      case "release":
        s = { ...s, gripping: false };
        trace.push("release (open)");
        break;
      case "wait":
        trace.push(`wait ${a.ms}ms`);
        break;
    }
  }
  return { trace, state: s };
}
