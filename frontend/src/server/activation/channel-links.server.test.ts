import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  getChannelBrandName,
  getChannelLink,
  readChannelLinks,
  resolveChannelLinksPath,
} from "./channel-links.server";

// [T-396b] 渠道链接读端单测(SPEC §5/§7,验收 §8-3)。
//
// 文件由 Rust 写端(src-tauri/src/license.rs write_channel_links_file)落盘,形状
// `{"version":1,"channel":{purchaseUrl,supportUrl,downloadUrl}|null}`;本测试按同一
// 契约造真实临时文件验读端。**红线锚点:任何异常路径都返回 null,绝不回退官方链接。**

let dir: string;
let env: Record<string, string | undefined>;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "creatoros-channel-links-"));
  env = { CREATOROS_LICENSE_FILE: join(dir, ".license") };
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function writeLinksFile(content: string): Promise<void> {
  await writeFile(join(dir, ".channel-links"), content, "utf8");
}

describe("channel-links 读端 —— 路径解析", () => {
  it("与 .license 同目录(appDataDir 根)", () => {
    expect(resolveChannelLinksPath(env)).toBe(join(dir, ".channel-links"));
  });

  it("无 CREATOROS_LICENSE_FILE 时回退 CREATOROS_DB_DIR 父目录", () => {
    expect(
      resolveChannelLinksPath({ CREATOROS_DB_DIR: join(dir, "db") }),
    ).toBe(join(dir, ".channel-links"));
  });

  it("web/dev(两个 env 都没有)→ null,中性降级", () => {
    expect(resolveChannelLinksPath({})).toBeNull();
  });
});

describe("channel-links 读端 —— 正常读取", () => {
  it("完整三键 → 原样返回", async () => {
    await writeLinksFile(
      JSON.stringify({
        version: 1,
        channel: {
          purchaseUrl: "https://agent.example.com/buy",
          supportUrl: "https://agent.example.com/contact",
          downloadUrl: "https://agent.example.com/dl",
        },
      }),
    );
    expect(await readChannelLinks(env)).toEqual({
      purchaseUrl: "https://agent.example.com/buy",
      supportUrl: "https://agent.example.com/contact",
      downloadUrl: "https://agent.example.com/dl",
      brandName: null, // [T-530] 无 brandName 键 = 未配置(老写端文件向后兼容)
    });
  });

  it("getChannelLink 按键取用", async () => {
    await writeLinksFile(
      JSON.stringify({
        version: 1,
        channel: { supportUrl: "https://agent.example.com/contact" },
      }),
    );
    expect(await getChannelLink("support", env)).toBe(
      "https://agent.example.com/contact",
    );
    expect(await getChannelLink("purchase", env)).toBeNull();
    expect(await getChannelLink("download", env)).toBeNull();
  });
});

describe("channel-links 读端 —— 红线:异常一律 null,绝不回退官方链接", () => {
  it("文件缺失(未激活/从未联网)→ null", async () => {
    expect(await readChannelLinks(env)).toBeNull();
  });

  it("channel 显式 null(码无渠道/渠道未配)→ null", async () => {
    await writeLinksFile(JSON.stringify({ version: 1, channel: null }));
    expect(await readChannelLinks(env)).toBeNull();
  });

  it("schema 版本不匹配 → 丢弃返回 null(向前兼容零迁移)", async () => {
    await writeLinksFile(
      JSON.stringify({
        version: 99,
        channel: { purchaseUrl: "https://agent.example.com/buy" },
      }),
    );
    expect(await readChannelLinks(env)).toBeNull();
  });

  it("坏 JSON → null 不 throw", async () => {
    await writeLinksFile("not-json{{{");
    expect(await readChannelLinks(env)).toBeNull();
  });

  it("非 https 协议头被滤掉(读端防线纵深)", async () => {
    await writeLinksFile(
      JSON.stringify({
        version: 1,
        channel: {
          purchaseUrl: "http://insecure.example.com/buy",
          supportUrl: "javascript:alert(1)",
          downloadUrl: "https://ok.example.com/dl",
        },
      }),
    );
    expect(await readChannelLinks(env)).toEqual({
      purchaseUrl: null,
      supportUrl: null,
      downloadUrl: "https://ok.example.com/dl",
      brandName: null,
    });
  });

  it("返回值任何路径都不含官方链接(#buy 零命中锚)", async () => {
    // 穷举本测试造过的所有异常态,断言绝无 creatoros.aitongban.cloud 回退。
    await writeLinksFile(JSON.stringify({ version: 1, channel: null }));
    const results = [
      await readChannelLinks(env),
      await getChannelLink("purchase", env),
      await getChannelLink("support", env),
      await getChannelLink("download", env),
    ];
    expect(JSON.stringify(results)).not.toContain("aitongban");
    expect(JSON.stringify(results)).not.toContain("#buy");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// [T-530] 品牌显示名 brandName(轻贴牌)—— 读端各态
// ─────────────────────────────────────────────────────────────────────────────
// 统一契约:纯文本;去控制字符 → trim → 非空且 ≤30 个 Unicode 字符才有效;
// 无效/缺失/null 一律等价「未配置」→ getChannelBrandName 返回 null,UI 层回
// 官方名「CreatorOS」(品牌名回退不涉密,与链接「null 不回退」红线不同)。

describe("channel-links 读端 —— [T-530] brandName", () => {
  it("合法品牌名 → 原样返回(与三链接同文件同 channel 对象)", async () => {
    await writeLinksFile(
      JSON.stringify({
        version: 1,
        channel: {
          purchaseUrl: "https://agent.example.com/buy",
          brandName: "星辰传媒",
        },
      }),
    );
    expect(await getChannelBrandName(env)).toBe("星辰传媒");
    expect((await readChannelLinks(env))?.brandName).toBe("星辰传媒");
  });

  it("trim + 去控制字符(读端防线纵深,与 Rust 写端同规则)", async () => {
    await writeLinksFile(
      JSON.stringify({
        version: 1,
        channel: { brandName: "  星辰传媒 " },
      }),
    );
    expect(await getChannelBrandName(env)).toBe("星辰传媒");
  });

  it("30 个 Unicode 字符恰好合法;31 字符整体弃用 → null(不截断)", async () => {
    const thirty = "星".repeat(30);
    await writeLinksFile(
      JSON.stringify({ version: 1, channel: { brandName: thirty } }),
    );
    expect(await getChannelBrandName(env)).toBe(thirty);

    await writeLinksFile(
      JSON.stringify({ version: 1, channel: { brandName: "星".repeat(31) } }),
    );
    expect(await getChannelBrandName(env)).toBeNull();
  });

  it("无效态穷举:纯空白/显式 null/非字符串/键缺失 → 一律 null(= 未配置)", async () => {
    for (const brandName of ["   ", null, 42, undefined]) {
      await writeLinksFile(
        JSON.stringify({
          version: 1,
          channel: { purchaseUrl: "https://agent.example.com/buy", brandName },
        }),
      );
      expect(await getChannelBrandName(env)).toBeNull();
    }
  });

  it("文件缺失(未激活)/channel 显式 null(官方码) → null,读端不兜「CreatorOS」默认值", async () => {
    // 未激活:无缓存文件。
    expect(await getChannelBrandName(env)).toBeNull();
    // 官方码/渠道未配:channel 显式 null。
    await writeLinksFile(JSON.stringify({ version: 1, channel: null }));
    expect(await getChannelBrandName(env)).toBeNull();
    // 回退官方名发生在 UI 层(sidebar),读端保持诚实 null。
  });

  it("读端零兜底锚:异常态返回值绝不含「CreatorOS」字样(回退只在 UI 层)", async () => {
    await writeLinksFile(JSON.stringify({ version: 1, channel: null }));
    const results = [await readChannelLinks(env), await getChannelBrandName(env)];
    expect(JSON.stringify(results)).not.toContain("CreatorOS");
  });
});
