// tests/visual/__setup__.ts
//
// CI-only global setup. Captures a fingerprint of the reference
// baseline directory at the *start* of the test run so that the
// post-run guard in playwright.config.ts can detect any mutation
// (a subagent running --update-snapshots, a hook replacing files,
// or a stray `cp` into the directory).
//
// The fingerprint is also written to disk under test-results/ so
// a failed post-run check still has evidence in the artifacts.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const REFERENCE_BASELINES_DIR = resolve(
  HERE,
  "tests",
  "visual",
  "__screenshots__",
  "reference-images",
);
const ARTIFACT_DIR = resolve(HERE, "tests", "visual", "__artifacts__");
const FINGERPRINT_PATH = join(ARTIFACT_DIR, "baseline-fingerprint.json");

const IGNORED = new Set(["README.md", "INSTALL-MANIFEST.json"]);

export default async function globalSetup() {
  mkdirSync(ARTIFACT_DIR, { recursive: true });

  const entries = existsSync(REFERENCE_BASELINES_DIR)
    ? readdirSync(REFERENCE_BASELINES_DIR, { withFileTypes: true })
        .filter((d) => d.isFile() && !IGNORED.has(d.name))
        .map((d) => d.name)
        .sort()
    : [];

  const hash = createHash("sha256");
  for (const name of entries) {
    hash.update(name);
    hash.update(readFileSync(join(REFERENCE_BASELINES_DIR, name)));
  }
  const digest = hash.digest("hex");

  const fingerprint = {
    capturedAt: new Date().toISOString(),
    count: entries.length,
    fingerprint: digest,
    entries,
  };
  writeFileSync(FINGERPRINT_PATH, JSON.stringify(fingerprint, null, 2), "utf8");

  // Expose the fingerprint via env so playwright.config.ts's
  // post-config guard can read it without re-walking the disk.
  process.env.PLAYWRIGHT_BASELINE_FINGERPRINT_BEFORE = digest;

  console.log(
    `[visual-setup] Captured baseline fingerprint ${digest.slice(0, 12)}… ` +
      `(${entries.length} files). Mutation during the run will fail CI.`,
  );
}
