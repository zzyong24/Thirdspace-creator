import { describe, it, expect } from "vitest";
import { readUrl } from "./web-reader";
describe("live readUrl smoke (temp, real browser)", () => {
  it("real chatgpt share → ssr full turns", async () => {
    const res = await readUrl(
      "https://chatgpt.com/share/6a210394-72c0-83a9-92b5-d53617d6d1ce",
      { authDir: "/private/tmp/claude-501/-Users-zyongzhu-Workbase-Thirdspace-creator/1fcf59bf-668c-4f47-8a45-dfcfafece06e/scratchpad/throwaway-auth" },
    );
    console.log("extractor:", res.extractor, "path:", res.extractPath, "turnCount:", res.turnCount, "textLen:", res.text.length, "title:", res.title);
    expect(res.extractor).toBe("chatgpt-share");
    expect(res.turnCount).toBeGreaterThan(10);
    expect(res.text.includes("<div")).toBe(false);
  }, 120000);
});
