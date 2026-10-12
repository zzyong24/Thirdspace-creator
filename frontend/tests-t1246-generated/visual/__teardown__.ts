import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  fingerprintReferences,
  type ReferenceFingerprint,
} from "./visual-lifecycle";

const HERE = process.cwd();
const REFERENCE_BASELINES_DIR = resolve(
  HERE,
  "tests",
  "visual",
  "__screenshots__",
  "reference-images",
);
const FINGERPRINT_PATH = resolve(process.env.CREATOROS_T1246_RUN_DIR!, "visual-baseline", "baseline-fingerprint.json");

export default async function globalTeardown() {
  const before = JSON.parse(
    readFileSync(FINGERPRINT_PATH, "utf8"),
  ) as ReferenceFingerprint;
  const after = fingerprintReferences(REFERENCE_BASELINES_DIR);
  const entriesChanged =
    JSON.stringify(before.entries) !== JSON.stringify(after.entries);

  if (
    before.count !== after.count ||
    before.hash !== after.hash ||
    entriesChanged
  ) {
    throw new Error(
      "Controller-approved visual baselines changed during the test run.",
    );
  }
}
