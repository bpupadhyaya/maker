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

/** The system prompt that steers the model to BUILD runnable web tools. */
export const MAKER_SYSTEM_PROMPT =
  "You are Maker — a collaborator that BUILDS small, runnable web tools through " +
  "conversation. You are not a chatbot, a search engine, or a tutor: your job is to " +
  "turn what the user wants into a working tool they can use right now.\n" +
  "Rules:\n" +
  "- When the user describes something to build (or asks to change the current tool), " +
  "reply with the COMPLETE files as fenced code blocks tagged with a path — ALWAYS an " +
  "```html path=index.html``` block, plus optional ```css path=styles.css``` and " +
  "```js path=app.js```.\n" +
  "- Use plain HTML/CSS/JavaScript only — no frameworks, no build step, no servers, no " +
  "network calls. It must run offline as a single static page; persist data with " +
  "localStorage.\n" +
  "- Never output backend or other-language code (Python, etc.) as the tool — web files only.\n" +
  "- Keep prose to one short sentence before the code; let the running tool speak.\n" +
  "- The Maker runtime AUTOMATICALLY saves your files and runs the tool live in the " +
  "user's workshop. So NEVER say you 'can't save files', never tell the user to create " +
  "folders, copy-paste code into files, or open index.html manually, and never invent " +
  "file paths like 'Downloads/…'. The tool is already built and running — just say what " +
  "it does or what changed.\n" +
  "- If the user asks a general/trivia question (facts, weather), don't answer like a " +
  "search engine — say you're a maker that builds tools and offer to build them " +
  "something useful instead.";

const WEB_LANGS = new Set([
  "html", "htm", "css", "js", "javascript", "mjs", "ts", "typescript", "json",
]);
const RESERVED = new Set(["brief", "checks", "contract", "robot", "pack"]);

/** A fenced block with no language but obvious HTML markup is still a tool page. */
function looksLikeHtml(s: string): boolean {
  return /<!doctype html|<html|<body|<head|<div|<h[1-6]\b|<script|<style|<button|<ul\b|<form/i.test(s);
}

/** Extract a `path -> source` map from a model reply. Empty if it has no code. */
export function synthesizeFiles(modelText: string): Record<string, string> {
  const files: Record<string, string> = {};
  const fence = /```([^\n]*)\n([\s\S]*?)```/g;
  let usedIndex = false;

  for (let m = fence.exec(modelText); m !== null; m = fence.exec(modelText)) {
    const info = (m[1] ?? "").trim();
    const lang = info.split(/\s+/)[0]?.toLowerCase() ?? "";
    if (RESERVED.has(lang)) continue; // brief/checks/contract/robot/pack aren't files

    let body = m[2] ?? "";
    if (body.endsWith("\n")) body = body.slice(0, -1);

    const pathMatch = /path=(\S+)/.exec(info);
    let filename = pathMatch?.[1];
    if (filename === undefined) {
      // Only infer a filename for WEB code — otherwise a stray Python/bash block
      // would get served as the tool. A bare block that's clearly HTML counts.
      if (WEB_LANGS.has(lang)) {
        filename =
          LANG_DEFAULTS[lang] ??
          (usedIndex ? `file-${Object.keys(files).length}.txt` : "index.html");
      } else if (lang === "" && looksLikeHtml(body)) {
        filename = usedIndex ? `page-${Object.keys(files).length}.html` : "index.html";
      } else {
        continue; // non-web code with no explicit path — not a tool file
      }
    }
    if (filename === "index.html") usedIndex = true;
    files[filename] = body;
  }

  return files;
}
