import { describe, expect, it } from "vitest";

import { parseRange } from "./route";

describe("execution preview byte ranges", () => {
  it("支持完整读取、普通范围和开放末端范围", () => {
    expect(parseRange(null, 100)).toBeNull();
    expect(parseRange("bytes=10-19", 100)).toEqual([10, 19]);
    expect(parseRange("bytes=90-", 100)).toEqual([90, 99]);
    expect(parseRange("bytes=-10", 100)).toEqual([90, 99]);
  });

  it("非法或越界范围返回 416 哨兵", () => {
    expect(parseRange("bytes=100-101", 100)).toEqual([-1, -1]);
    expect(parseRange("bytes=20-10", 100)).toEqual([-1, -1]);
    expect(parseRange("items=0-1", 100)).toEqual([-1, -1]);
    expect(parseRange("bytes=-0", 100)).toEqual([-1, -1]);
  });
});
