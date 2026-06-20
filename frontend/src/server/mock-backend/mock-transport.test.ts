import { describe, it, expect, beforeEach } from "vitest";
import { resetStore } from "./index";
import { client } from "@/lib/contract-client";

describe("mock transport", () => {
  beforeEach(() => resetStore());

  // The projects.list handler is registered in Task 6; until then the read
  // path throws "not implemented". Kept as todo so the assertion is not lost.
  it.todo("serves a registered read through the typed client", async () => {
    // The contract's ClientMethod return type infers the item type for list
    // endpoints; at runtime the listEnvelope yields an array. Cast to assert
    // the runtime shape without depending on that typing gap.
    const projects = (await client.listProjects({
      params: undefined,
      query: { page: 1, pageSize: 20 },
      body: undefined,
    })) as unknown as unknown[];
    expect(Array.isArray(projects)).toBe(true);
    expect(projects.length).toBeGreaterThan(0);
  });

  it("throws a typed error for an unimplemented operation", async () => {
    await expect(
      client.listLearnings?.({ params: undefined, query: undefined as never, body: undefined }),
    ).rejects.toThrow(/not implemented/i);
  });
});
