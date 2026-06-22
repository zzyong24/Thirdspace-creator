import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { fingerprintReferences } from "./visual-lifecycle";

const HERE = process.cwd();
const REFERENCE_BASELINES_DIR = resolve(
  HERE,
  "tests",
  "visual",
  "__screenshots__",
  "reference-images",
);
const ARTIFACT_DIR = resolve(HERE, "tests", "visual", "__artifacts__");
const FINGERPRINT_PATH = resolve(
  ARTIFACT_DIR,
  "baseline-fingerprint.json",
);

export default async function globalSetup() {
  const fingerprint = fingerprintReferences(REFERENCE_BASELINES_DIR);
  if (fingerprint.count !== 17) {
    throw new Error(
      `Expected 17 visual baselines, found ${fingerprint.count}.`,
    );
  }

  mkdirSync(ARTIFACT_DIR, { recursive: true });
  writeFileSync(
    FINGERPRINT_PATH,
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        ...fingerprint,
      },
      null,
      2,
    ),
    "utf8",
  );
}
