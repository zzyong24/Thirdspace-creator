import { describe, it, expect } from "vitest";
import { buildDashboardViewModel } from "@/fixtures/selectors";
import { canonicalDataset } from "@/fixtures/canonical";

describe("buildDashboardViewModel(dataset)", () => {
  it("defaults to the canonical dataset (back-compat)", () => {
    expect(JSON.stringify(buildDashboardViewModel())).toBe(
      JSON.stringify(buildDashboardViewModel(canonicalDataset)),
    );
  });
});
