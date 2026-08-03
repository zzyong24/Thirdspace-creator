#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const preservedEvidence = path.join(
  root,
  "orchestrator/evidence/T-657-visible-copy.json",
);
const before = existsSync(preservedEvidence)
  ? readFileSync(preservedEvidence, "utf8")
  : null;
const preload = path.join(
  root,
  "frontend/tests/helpers/fixed-evidence-clock.cjs",
);

let result;
try {
  result = spawnSync(
    "/bin/bash",
    [
      "-lc",
      "CREATOROS_TEST_PORT=3432 CREATOROS_PLAYWRIGHT_BROWSER_CHANNEL=chrome pnpm --dir frontend exec playwright test tests/e2e/recent-data-safety.spec.ts --project=e2e",
    ],
    {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      env: {
        ...process.env,
        NODE_OPTIONS: [process.env.NODE_OPTIONS, `--require=${preload}`]
          .filter(Boolean)
          .join(" "),
      },
    },
  );
} finally {
  // T-657 already owns an accepted receipt. This combined journey must not
  // rewrite that immutable visible-copy artifact while verifying T-665/T-666.
  if (before !== null) writeFileSync(preservedEvidence, before);
}

process.stdout.write(result?.stdout ?? "");
process.stderr.write(result?.stderr ?? "");
if (result?.error) throw result.error;
process.exit(result?.status ?? 1);
