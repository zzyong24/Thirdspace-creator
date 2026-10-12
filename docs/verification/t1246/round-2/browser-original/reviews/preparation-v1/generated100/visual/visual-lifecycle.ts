import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const IGNORED_REFERENCE_FILES = new Set([
  "README.md",
  "INSTALL-MANIFEST.json",
]);

export interface ReferenceFingerprint {
  readonly count: number;
  readonly entries: ReadonlyArray<string>;
  readonly hash: string;
}

export function fingerprintReferences(directory: string): ReferenceFingerprint {
  if (!existsSync(directory)) {
    return { count: 0, entries: [], hash: "empty" };
  }

  const entries = readdirSync(directory, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() && !IGNORED_REFERENCE_FILES.has(entry.name),
    )
    .map((entry) => entry.name)
    .sort();
  const hash = createHash("sha256");

  for (const name of entries) {
    hash.update(name);
    hash.update(readFileSync(join(directory, name)));
  }

  return {
    count: entries.length,
    entries,
    hash: hash.digest("hex"),
  };
}

export function resolvePlaywrightPort(value: string | undefined): number {
  if (value === undefined || value.trim() === "") {
    return 3201;
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`CREATOROS_TEST_PORT must be a valid TCP port: ${value}`);
  }

  return port;
}
