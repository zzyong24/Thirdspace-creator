import { canonicalDataset, FIXED_NOW } from "@/fixtures/canonical";

// FIXED clock — never Date.now(); mirrors the fixtures' deterministic time.
export const FIXED_NOW_ISO = new Date(FIXED_NOW.getTime()).toISOString();

// A MockStore is a deep, mutable copy of the canonical dataset plus per-prefix
// id counters. Structurally identical to `canonicalDataset` so selectors read it.
export type MockStore = typeof canonicalDataset extends infer T
  ? { -readonly [K in keyof T]: T[K] } & { __counters: Record<string, number> }
  : never;

export function createStore(): MockStore {
  const clone = structuredClone(canonicalDataset) as Record<string, unknown>;
  clone.__counters = {};
  return clone as MockStore;
}

export function nextId(store: MockStore, prefix: string): string {
  const n = (store.__counters[prefix] ?? 0) + 1;
  store.__counters[prefix] = n;
  return `${prefix}-mock-${n}`;
}
