#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sampleRoot = path.join(ROOT, "output/content-samples/composable-scene-graph-loop");
const hyperframes = path.join(ROOT, "backend/node_modules/.bin/hyperframes");
const candidates = JSON.parse(readFileSync(path.join(sampleRoot, "candidates.json"), "utf8"));
const rendered = [];
const selectedResults = process.env.T802_CASE_ID
  ? candidates.results.filter((result) => result.id === process.env.T802_CASE_ID)
  : candidates.results;
if (selectedResults.length === 0) throw new Error(`Unknown T802_CASE_ID:${process.env.T802_CASE_ID}`);
for (const result of selectedResults) {
  for (const orientation of ["landscape", "portrait"]) {
    const source = path.join(sampleRoot, `${result.id}.${orientation}.html`);
    const output = path.join(sampleRoot, `${result.id}.${orientation}.mp4`);
    const work = mkdtempSync(path.join(tmpdir(), `t802-${result.id}-${orientation}-`));
    try {
      cpSync(source, path.join(work, "index.html"));
      execFileSync(
        hyperframes,
        ["render", work, "-o", output, "-q", "draft", "-f", "24", "-w", "2", "--quiet"],
        { cwd: ROOT, stdio: "ignore", timeout: 180_000 },
      );
      rendered.push({ id: result.id, orientation, output: path.relative(ROOT, output) });
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  }
}
const renderedIndex = path.join(sampleRoot, "rendered-samples.json");
const priorRendered = process.env.T802_CASE_ID && existsSync(renderedIndex)
  ? JSON.parse(readFileSync(renderedIndex, "utf8"))
  : [];
const finalRendered = process.env.T802_CASE_ID
  ? [...priorRendered.filter((item) => item.id !== process.env.T802_CASE_ID), ...rendered]
      .sort((a, b) => a.id.localeCompare(b.id) || a.orientation.localeCompare(b.orientation))
  : rendered;
writeFileSync(renderedIndex, `${JSON.stringify(finalRendered, null, 2)}\n`);
console.log(JSON.stringify({ status: "rendered", count: rendered.length }));
