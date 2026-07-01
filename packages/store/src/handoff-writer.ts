import * as fs from "node:fs/promises";
import * as path from "node:path";

/**
 * Writes an ejectable hand-off bundle to disk: the tool files + a generated
 * README + a maker.json manifest (Brief + checks). The result is self-contained
 * and portable — "take the code and leave" is real.
 */
export interface HandoffBundle {
  readonly name: string;
  readonly files: Readonly<Record<string, string>>;
  readonly readme: string;
  readonly manifest: unknown;
}

export async function writeHandoff(
  targetDir: string,
  bundle: HandoffBundle,
): Promise<string[]> {
  await fs.mkdir(targetDir, { recursive: true });
  const written: string[] = [];

  for (const [rel, content] of Object.entries(bundle.files)) {
    const p = path.join(targetDir, rel);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, content, "utf8");
    written.push(rel);
  }
  await fs.writeFile(path.join(targetDir, "README.md"), bundle.readme, "utf8");
  written.push("README.md");
  await fs.writeFile(
    path.join(targetDir, "maker.json"),
    JSON.stringify(bundle.manifest, null, 2),
    "utf8",
  );
  written.push("maker.json");

  return written;
}
