import { describe, it, expect, beforeEach } from "vitest";
import { resetStore } from "../index";
import { client } from "@/lib/contract-client";

describe("dashboard via the client", () => {
  beforeEach(() => resetStore());
  it("returns a dashboard DTO composed from the store", async () => {
    const dto = await client.getDashboard({
      params: undefined,
      query: undefined,
      body: undefined,
    });
    // structural sanity: it carries the dashboard sections
    expect(dto).toHaveProperty("metrics");
  });
});
