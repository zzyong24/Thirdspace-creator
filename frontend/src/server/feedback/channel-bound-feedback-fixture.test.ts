import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const CREATOR_FIXTURE = resolve(
  process.cwd(),
  "../docs/contracts/fixtures/channel-bound-feedback-v1.vector.json",
);
const GROWTH_FIXTURE =
  "/Users/zyongzhu/Workbase/Thirdspace-growth/docs/contracts/fixtures/channel-bound-feedback-v1.vector.json";

describe("T-538 三仓共享 feedback-context fixture", () => {
  it("与 Growth owner 文件逐字一致且 SHA-256 锁定", async () => {
    const [creator, growth] = await Promise.all([
      readFile(CREATOR_FIXTURE),
      readFile(GROWTH_FIXTURE),
    ]);
    expect(Buffer.compare(creator, growth)).toBe(0);
    expect(createHash("sha256").update(creator).digest("hex")).toBe(
      "1102c0e1c172938ed63f877a033bb169ab7b396575fa2e84547f30bcf0c24fab",
    );
  });
});
