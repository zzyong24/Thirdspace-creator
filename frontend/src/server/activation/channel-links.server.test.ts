import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
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
