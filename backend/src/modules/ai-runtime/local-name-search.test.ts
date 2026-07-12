import { describe, it, expect } from "vitest";
import {
  searchLocalByBasename,
  shouldSkipSearchDir,
  localBasename,
  defaultSearchRoots,
  dedupeRoots,
  LOCAL_SEARCH_MAX_DEPTH,
  LOCAL_SEARCH_MAX_RESULTS,
  LOCAL_SEARCH_MAX_NODES,
  type LocalSearchFs,
  type LocalSearchDirent,
} from "./local-name-search";
import { sensitivePathReason } from "./local-read-security";

// [T-262] 文件名搜索兜底单测 —— scoped 不越界 / 守 denylist / 唯一命中 / 多命中 / 零命中 /
// 深度上限 / 数量上限 / 节点上限 / 软链跳过。fs 由内存假树注入(本模块零 IO 可单测)。

// ── 内存假 fs:tree[dir] = 该目录下的目录项(name + 三态布尔 + 可选 size)。
interface FakeEntry {
  name: string;
  isDir?: boolean;
  isFile?: boolean;
  isSymlink?: boolean;
  size?: number;
}
function makeFakeFs(tree: Record<string, FakeEntry[]>): LocalSearchFs & {
  readCount: () => number;
} {
  let reads = 0;
  return {
    readCount: () => reads,
    async readdir(dir: string): Promise<LocalSearchDirent[]> {
      reads += 1;
      const entries = tree[dir];
      if (!entries) throw new Error(`ENOENT: ${dir}`);
      return entries.map((e) => ({
        name: e.name,
        isDir: !!e.isDir,
        isFile: !!e.isFile,
        isSymlink: !!e.isSymlink,
      }));
    },
    async fileSize(p: string): Promise<number | null> {
      const idx = p.lastIndexOf("/");
      const dir = p.slice(0, idx);
      const base = p.slice(idx + 1);
      const found = (tree[dir] ?? []).find((e) => e.name === base);
      return found?.size ?? null;
    },
  };
}

const isSensitive = (p: string) => sensitivePathReason(p) != null;

describe("[T-262] localBasename / defaultSearchRoots / dedupeRoots / shouldSkipSearchDir", () => {
  it("localBasename 取最后一段(相对/绝对/反斜杠)", () => {
    expect(localBasename("scripts/xxx.md")).toBe("xxx.md");
    expect(localBasename("/Users/u/Desktop/稿子.md")).toBe("稿子.md");
    expect(localBasename("a\\b\\c.txt")).toBe("c.txt");
    expect(localBasename("just.md")).toBe("just.md");
    expect(localBasename("")).toBe("");
  });

  it("defaultSearchRoots = 桌面/文档/ThirdSpace", () => {
    expect(defaultSearchRoots("/Users/u")).toEqual([
      "/Users/u/Desktop",
      "/Users/u/Documents",
      "/Users/u/ThirdSpace",
    ]);
    expect(defaultSearchRoots("")).toEqual([]);
  });

  it("dedupeRoots 去重 + 前缀去重(被更浅 root 覆盖的子目录丢弃)", () => {
    expect(
      dedupeRoots(["/a", "/a", "/a/b", "/c/", "/c"]).sort(),
    ).toEqual(["/a", "/c"]);
  });

  it("shouldSkipSearchDir 跳过 dotdir 与重目录黑名单", () => {
    expect(shouldSkipSearchDir(".ssh")).toBe(true);
    expect(shouldSkipSearchDir(".git")).toBe(true);
    expect(shouldSkipSearchDir("node_modules")).toBe(true);
    expect(shouldSkipSearchDir("Library")).toBe(true);
    expect(shouldSkipSearchDir("projects")).toBe(false);
    expect(shouldSkipSearchDir("Desktop")).toBe(false);
  });
});

describe("[T-262] searchLocalByBasename — scoped 按名搜同名", () => {
  it("唯一命中:目标名只在一个 scoped 目录里 → items 长度 1(带 size/type)", async () => {
    const fs = makeFakeFs({
      "/Users/u/Desktop": [
        { name: "稿子.md", isFile: true, size: 1234 },
        { name: "sub", isDir: true },
      ],
      "/Users/u/Desktop/sub": [{ name: "别的.txt", isFile: true, size: 10 }],
      "/Users/u/Documents": [{ name: "readme.txt", isFile: true, size: 5 }],
    });
    const res = await searchLocalByBasename({
      roots: ["/Users/u/Desktop", "/Users/u/Documents"],
      targetName: "稿子.md",
      fs,
      isSensitive,
    });
    expect(res.items).toHaveLength(1);
    expect(res.items[0]).toEqual({
      path: "/Users/u/Desktop/稿子.md",
      size: 1234,
      type: "md",
    });
    expect(res.truncated).toBe(false);
  });

  it("大小写不敏感匹配(macOS 默认)", async () => {
    const fs = makeFakeFs({
      "/root": [{ name: "Notes.MD", isFile: true, size: 3 }],
    });
    const res = await searchLocalByBasename({
      roots: ["/root"],
      targetName: "notes.md",
      fs,
      isSensitive,
    });
    expect(res.items).toHaveLength(1);
    expect(res.items[0]!.path).toBe("/root/Notes.MD");
  });

  it("多命中:多个 scoped 目录都有同名 → items 全列", async () => {
    const fs = makeFakeFs({
      "/a": [
        { name: "plan.md", isFile: true, size: 1 },
        { name: "deep", isDir: true },
      ],
      "/a/deep": [{ name: "plan.md", isFile: true, size: 2 }],
      "/b": [{ name: "plan.md", isFile: true, size: 3 }],
    });
    const res = await searchLocalByBasename({
      roots: ["/a", "/b"],
      targetName: "plan.md",
      fs,
      isSensitive,
    });
    expect(res.items.map((i) => i.path).sort()).toEqual([
      "/a/deep/plan.md",
      "/a/plan.md",
      "/b/plan.md",
    ]);
  });

  it("零命中:目标名不在任何 scoped 目录 → 空", async () => {
    const fs = makeFakeFs({
      "/a": [{ name: "other.md", isFile: true, size: 1 }],
    });
    const res = await searchLocalByBasename({
      roots: ["/a"],
      targetName: "missing.md",
      fs,
      isSensitive,
    });
    expect(res.items).toHaveLength(0);
    expect(res.truncated).toBe(false);
  });

  it("scoped 不越界:只从 roots 出发,不上溯根盘、不进未列 root", async () => {
    const fs = makeFakeFs({
      "/Users/u/Desktop": [{ name: "target.md", isFile: true, size: 1 }],
      // /Users/u/Secret 存在同名,但不在 roots → 不该被搜到
      "/Users/u/Secret": [{ name: "target.md", isFile: true, size: 9 }],
    });
    const res = await searchLocalByBasename({
      roots: ["/Users/u/Desktop"],
      targetName: "target.md",
      fs,
      isSensitive,
    });
    expect(res.items.map((i) => i.path)).toEqual(["/Users/u/Desktop/target.md"]);
  });

  it("守 denylist:命中敏感文件(*key*/.env)一律跳过,敏感目录(.ssh)不进", async () => {
    const fs = makeFakeFs({
      "/root": [
        { name: "api_key.md", isFile: true, size: 1 }, // 敏感名 → 跳过
        { name: ".env", isFile: true, size: 1 }, // 敏感 → 跳过
        { name: ".ssh", isDir: true }, // dotdir + 敏感 → 不进
        { name: "notes.md", isFile: true, size: 2 },
      ],
      "/root/.ssh": [{ name: "notes.md", isFile: true, size: 99 }], // 不该被搜到
    });
    // 搜 notes.md:只应命中 /root/notes.md,不进 .ssh。
    const res = await searchLocalByBasename({
      roots: ["/root"],
      targetName: "notes.md",
      fs,
      isSensitive,
    });
    expect(res.items.map((i) => i.path)).toEqual(["/root/notes.md"]);

    // 直接搜敏感名 → 空(denylist 硬拒)。
    const resKey = await searchLocalByBasename({
      roots: ["/root"],
      targetName: "api_key.md",
      fs,
      isSensitive,
    });
    expect(resKey.items).toHaveLength(0);
  });

  it("敏感 root 本身被剔除(不从 Keychains 起搜)", async () => {
    const fs = makeFakeFs({
      "/Users/u/Library/Keychains": [{ name: "x.md", isFile: true, size: 1 }],
    });
    const res = await searchLocalByBasename({
      roots: ["/Users/u/Library/Keychains"],
      targetName: "x.md",
      fs,
      isSensitive,
    });
    expect(res.items).toHaveLength(0);
  });

  it("软链一律跳过(防环 + 防指向敏感区)", async () => {
    const fs = makeFakeFs({
      "/root": [
        { name: "link.md", isFile: true, isSymlink: true, size: 1 }, // 软链文件 → 跳过
        { name: "linkdir", isDir: true, isSymlink: true }, // 软链目录 → 不进
        { name: "real.md", isFile: true, size: 2 },
      ],
      "/root/linkdir": [{ name: "link.md", isFile: true, size: 9 }],
    });
    const res = await searchLocalByBasename({
      roots: ["/root"],
      targetName: "link.md",
      fs,
      isSensitive,
    });
    expect(res.items).toHaveLength(0);
  });

  it("深度上限:超过 maxDepth 的同名文件不搜(root=0)", async () => {
    // /r → d1 → d2 → d3;target 只在 d3(深度 3)。maxDepth=2 → 搜不到;maxDepth=3 → 搜到。
    const fs = makeFakeFs({
      "/r": [{ name: "d1", isDir: true }],
      "/r/d1": [{ name: "d2", isDir: true }],
      "/r/d1/d2": [{ name: "d3", isDir: true }],
      "/r/d1/d2/d3": [{ name: "deep.md", isFile: true, size: 1 }],
    });
    const shallow = await searchLocalByBasename({
      roots: ["/r"],
      targetName: "deep.md",
      fs,
      isSensitive,
      maxDepth: 2,
    });
    expect(shallow.items).toHaveLength(0);
    const deep = await searchLocalByBasename({
      roots: ["/r"],
      targetName: "deep.md",
      fs: makeFakeFs({
        "/r": [{ name: "d1", isDir: true }],
        "/r/d1": [{ name: "d2", isDir: true }],
        "/r/d1/d2": [{ name: "d3", isDir: true }],
        "/r/d1/d2/d3": [{ name: "deep.md", isFile: true, size: 1 }],
      }),
      isSensitive,
      maxDepth: 3,
    });
    expect(deep.items).toHaveLength(1);
  });

  it("结果数上限:超过 maxResults 截断,truncated=true", async () => {
    const entries: FakeEntry[] = [];
    for (let i = 0; i < 10; i += 1) entries.push({ name: "dir" + i, isDir: true });
    const tree: Record<string, FakeEntry[]> = { "/r": entries };
    for (let i = 0; i < 10; i += 1) {
      tree["/r/dir" + i] = [{ name: "hit.md", isFile: true, size: 1 }];
    }
    const res = await searchLocalByBasename({
      roots: ["/r"],
      targetName: "hit.md",
      fs: makeFakeFs(tree),
      isSensitive,
      maxResults: 3,
    });
    expect(res.items).toHaveLength(3);
    expect(res.truncated).toBe(true);
  });

  it("节点数上限:访问节点超 maxNodes 提前停,truncated=true", async () => {
    const entries: FakeEntry[] = [];
    for (let i = 0; i < 50; i += 1) entries.push({ name: "f" + i, isFile: true, size: 1 });
    const res = await searchLocalByBasename({
      roots: ["/r"],
      targetName: "nomatch.md",
      fs: makeFakeFs({ "/r": entries }),
      isSensitive,
      maxNodes: 10,
    });
    expect(res.items).toHaveLength(0);
    expect(res.truncated).toBe(true);
  });

  it("root 不存在(readdir 抛)→ 静默跳过、不炸", async () => {
    const fs = makeFakeFs({ "/exists": [{ name: "a.md", isFile: true, size: 1 }] });
    const res = await searchLocalByBasename({
      roots: ["/nope", "/exists"],
      targetName: "a.md",
      fs,
      isSensitive,
    });
    expect(res.items.map((i) => i.path)).toEqual(["/exists/a.md"]);
  });

  it("默认上限常量已导出(深度/结果/节点)", () => {
    expect(LOCAL_SEARCH_MAX_DEPTH).toBeGreaterThan(0);
    expect(LOCAL_SEARCH_MAX_RESULTS).toBeGreaterThan(0);
    expect(LOCAL_SEARCH_MAX_NODES).toBeGreaterThan(0);
  });
});
