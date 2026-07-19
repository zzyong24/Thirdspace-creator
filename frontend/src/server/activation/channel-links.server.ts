import "server-only";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { resolveLicenseFilePath } from "./license-file.server";

// [T-396b] 渠道链接读端(SPEC §5「channel-links 模块」)。
//
// 写者唯一 = Rust 壳(src-tauri/src/license.rs):决策链接受的响应(强验签 = 签名/date/
// nonce 全过)携带 `channelConfig` 时,把渠道三链接落 `<appDataDir>/.channel-links`
// (明文 JSON,链接本就展示给用户非机密;schema `version` 不匹配即丢弃走心跳重取)。
//
// **白标红线(SPEC §5/§7,验收 §8-1/§8-3)**:
//   · 本模块是前端唯一取链接口 —— 包内不再有任何官方链接硬编码(原 activate 页
//     CONTACT_URL / settings PURCHASE_URL 已删);
//   · 读不到 / null / 坏文件 / 版本不匹配 → 一律 null,**绝不回退官方链接**
//     (防代理码用户看到官方定价);调用方按中性降级渲染(无链接无按钮)。

export interface ChannelLinks {
  readonly purchaseUrl: string | null;
  readonly supportUrl: string | null;
  readonly downloadUrl: string | null;
}

export type ChannelLinkKind = "purchase" | "support" | "download";

/** 与 Rust 写端(CHANNEL_LINKS_SCHEMA_VERSION)对齐的 schema 版本。 */
const CHANNEL_LINKS_SCHEMA_VERSION = 1;

/**
 * `.channel-links` 路径解析:与 `.license` 同目录(appDataDir 根)。
 * 解析不出(web/dev 无注入)→ null(中性降级)。
 */
export function resolveChannelLinksPath(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const licensePath = resolveLicenseFilePath(env);
  if (!licensePath) return null;
  return join(dirname(licensePath), ".channel-links");
}

/** 协议头白名单:只认 `https://`(Rust 写端已滤,这里读端防线纵深再滤一次)。 */
function sanitizeUrl(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.startsWith("https://") ? s : null;
}

/**
 * 读渠道链接缓存。任何异常路径(文件缺失/坏 JSON/版本不匹配/channel=null)→ null,
 * 绝不 throw、绝不回退默认链接。
 */
export async function readChannelLinks(
  env: Record<string, string | undefined> = process.env,
): Promise<ChannelLinks | null> {
  const path = resolveChannelLinksPath(env);
  if (!path) return null;
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return null; // 文件缺失(未激活/从未联网)→ 中性降级
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const file = parsed as { version?: unknown; channel?: unknown };
  if (file.version !== CHANNEL_LINKS_SCHEMA_VERSION) {
    // schema 版本不匹配 → 丢弃,等激活/心跳路径重取(向前兼容零迁移)。
    return null;
  }
  if (typeof file.channel !== "object" || file.channel === null) {
    return null; // 服务端显式 null(码无渠道/渠道未配)→ 中性降级
  }
  const ch = file.channel as Record<string, unknown>;
  return {
    purchaseUrl: sanitizeUrl(ch.purchaseUrl),
    supportUrl: sanitizeUrl(ch.supportUrl),
    downloadUrl: sanitizeUrl(ch.downloadUrl),
  };
}

/**
 * 单键取用口(SPEC §5 `getChannelLink(kind)`)。null = 该键未配置/未激活,
 * 调用方走中性降级(无链接无按钮),不回退任何默认值。
 */
export async function getChannelLink(
  kind: ChannelLinkKind,
  env: Record<string, string | undefined> = process.env,
): Promise<string | null> {
  const links = await readChannelLinks(env);
  if (!links) return null;
  switch (kind) {
    case "purchase":
      return links.purchaseUrl;
    case "support":
      return links.supportUrl;
    case "download":
      return links.downloadUrl;
  }
}
