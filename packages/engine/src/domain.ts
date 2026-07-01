/**
 * Domain abstraction (DESIGN.md -> H4 "beyond software"). Maker builds in more
 * than one domain. Software (web/TS tools) is realized today; robotics is the
 * first non-software domain — Maker emits a robot program, but *executing* it
 * needs a real robot (needs-user). Keeping the domain a first-class seam is what
 * lets new backends (robotics, and later others) slot in behind the same
 * conversation + Brief without recompromising the software path.
 */

export type DomainKind = "software" | "robotics";

export interface Domain {
  readonly name: string;
  readonly kind: DomainKind;
  /** Reserved code-fence language this domain's artifacts use. */
  readonly artifactLang: string;
  readonly description: string;
  /** True when running an artifact needs external hardware/toolchain (needs-user). */
  readonly executionNeedsUser: boolean;
}

export const SOFTWARE_DOMAIN: Domain = {
  name: "software",
  kind: "software",
  artifactLang: "html",
  description: "web/TS tools that build and run locally in the runtime",
  executionNeedsUser: false,
};

export const ROBOTICS_DOMAIN: Domain = {
  name: "robotics",
  kind: "robotics",
  artifactLang: "robot",
  description: "robot programs — an action/movement plan (real execution needs a robot)",
  executionNeedsUser: true,
};

export const DOMAINS: readonly Domain[] = [SOFTWARE_DOMAIN, ROBOTICS_DOMAIN];

export function domainFor(name: string): Domain | undefined {
  return DOMAINS.find((d) => d.name === name);
}

/** Understand which domain a request targets (software by default). */
export function classifyDomain(request: string): Domain {
  const r = request.toLowerCase();
  if (
    /\b(robot|robotic|arm|motor|servo|gripper|actuator|drone|drive|ros|pick up|grasp)\b/.test(r)
  ) {
    return ROBOTICS_DOMAIN;
  }
  return SOFTWARE_DOMAIN;
}
