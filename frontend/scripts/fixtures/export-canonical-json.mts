/**
 * Deterministic exporter: projects the canonical fixture dataset
 * (`src/fixtures/canonical.ts`) into a static JSON file under
 * `public/fixtures/` so it can be served as a mock API payload (SPEC §9,
 * IMPLEMENTATION-ARCHITECTURE §3). No randomness or wall-clock time is
 * introduced — the dataset carries a fixed clock.
 *
 * Run with: pnpm fixtures:export
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { canonicalDataset } from "@/fixtures/canonical";

const outDir = resolve(process.cwd(), "public/fixtures");
mkdirSync(outDir, { recursive: true });

const outFile = resolve(outDir, "canonical.json");
writeFileSync(outFile, `${JSON.stringify(canonicalDataset, null, 2)}\n`, "utf8");

// eslint-disable-next-line no-console
console.log(`Wrote ${outFile}`);
