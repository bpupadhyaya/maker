/**
 * Turns a model's text reply into the files of a tool. The model emits fenced
 * code blocks; an optional `path=` in the info string names the file, otherwise
 * we infer from the language. Deliberately forgiving — small local models won't
 * always be tidy. (In later milestones this becomes the richer "synthesizer"
 * component; M0.5 is the minimal viable version.)
 */

const LANG_DEFAULTS: Readonly<Record<string, string>> = {
  html: "index.html",
  htm: "index.html",
  css: "styles.css",
  js: "app.js",
  javascript: "app.js",
  mjs: "app.js",
  ts: "app.ts",
  typescript: "app.ts",
  json: "data.json",
};

/** The system prompt that teaches the model Maker's tool-file format. */
export const MAKER_SYSTEM_PROMPT =
  "You are Maker, a collaborator that builds small, runnable web tools by " +
  "conversation. When you build or change a tool, output the COMPLETE files as " +
  "fenced code blocks, each tagged with its path, e.g. ```html path=index.html``` " +
  "or ```js path=app.js```. Always include an index.html. Keep it self-contained " +
  "and runnable with no build step.";

/** Extract a `path -> source` map from a model reply. Empty if it has no code. */
export function synthesizeFiles(modelText: string): Record<string, string> {
  const files: Record<string, string> = {};
  const fence = /```([^\n]*)\n([\s\S]*?)```/g;
  let usedIndex = false;

  for (let m = fence.exec(modelText); m !== null; m = fence.exec(modelText)) {
    const info = (m[1] ?? "").trim();
    const lang = info.split(/\s+/)[0]?.toLowerCase() ?? "";
    if (lang === "brief") continue; // reserved: the Brief block, not a tool file

    let body = m[2] ?? "";
    if (body.endsWith("\n")) body = body.slice(0, -1);

    const pathMatch = /path=(\S+)/.exec(info);
    let filename = pathMatch?.[1];
    if (filename === undefined) {
      filename =
        LANG_DEFAULTS[lang] ??
        (usedIndex ? `file-${Object.keys(files).length}.txt` : "index.html");
    }
    if (filename === "index.html") usedIndex = true;
    files[filename] = body;
  }

  return files;
}
