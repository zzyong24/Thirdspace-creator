import { describe, it, expect } from "vitest";
import { createStore, nextId, FIXED_NOW_ISO } from "./store";
import { canonicalDataset } from "@/fixtures/canonical";

describe("mock-backend store", () => {
  it("clones the canonical dataset (independent copy)", () => {
    const a = createStore();
    expect(a.projects.length).toBe(canonicalDataset.projects.length);
    a.projects.push({ ...a.projects[0]!, id: "x" });
    // mutating the store must not touch the shared fixtures
    expect(canonicalDataset.projects.some((p) => p.id === "x")).toBe(false);
  });

  it("two fresh stores are value-equal (deterministic seed)", () => {
    expect(JSON.stringify(createStore().projects)).toBe(
      JSON.stringify(createStore().projects),
    );
  });

  it("generates deterministic ids and a fixed clock", () => {
    const s = createStore();
    expect(nextId(s, "project")).toBe("project-mock-1");
    expect(nextId(s, "project")).toBe("project-mock-2");
    expect(FIXED_NOW_ISO).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
  });
});
