// [T-166 / T-147 P3] 远程 prompt override 包 —— 拉取 + Ed25519 验签 + 解析。
//
// D1 降级后 P3 = 纯**远程可更新性**(产品方不发新版即迭代 prompt),非防泄漏(保护由 T-163+P6 达成)。
// 本模块只做客户端拉取侧:GET 已签的 bundle.json + .sig → 内置公钥验签 → 解析成 SkillConfigOverride[],
// 交 applySkillConfigOverridesFromDb 的 remoteOverrides 层套用(skill 粒度锁守 D1,见那里)。
//
// 验签基建(gate③ 坐实:P6 的 Ed25519 验签在 Tauri Rust 插件内、backend JS 无 verify 原语、仓内无
// tweetnacl/@noble):此处用 **node:crypto 原生 Ed25519**(零新依赖)。签名 = 对 bundle 字节的 detached
// Ed25519 签名(base64);公钥 = SPKI PEM,内置进 backend 配置(env PROMPT_BUNDLE_PUBLIC_KEY)。
// 打包签名脚本 scripts/desktop/prompt-bundle.mjs 用同款 node:crypto 私钥签(非复用 minisign 格式,
// 避 minisign .sig 解析——SPEC §3.1 允许「裸 Ed25519 简化」)。
//
// 诚实降级铁律:未配 URL/公钥、网络失败、验签失败、解析失败 —— 一律返回 []（远程层关,纯本地照常
// 生效、不崩、不套未签/验不过的包）。绝不静默套用未经验签的内容。

import { verify, createPublicKey } from "node:crypto";
import type { SkillConfigOverride } from "@creatoros/ai-worker";

export interface RemotePromptBundle {
  /** 包版本(产品方维护的语义版本,仅审计/日志用)。 */
  version: string;
  /** 签发时刻 ISO(审计用)。 */
  signedAt: string;
  /** skill override 集合(字段同 skill_config_overrides;id 必填,其余可选)。 */
  overrides: SkillConfigOverride[];
}

/** 收窄一条 override(仅保留合形字段;id 缺失/非串 → null 丢弃,诚实不塞脏值)。 */
function normOverride(raw: unknown): SkillConfigOverride | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || !o.id.trim()) return null;
  const str = (v: unknown): string | undefined =>
    typeof v === "string" && v.trim() ? v : undefined;
  const strArr = (v: unknown): string[] | undefined =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string")
      : undefined;
  const obj = (
    v: unknown,
  ): SkillConfigOverride["outputSchema"] | undefined =>
    v && typeof v === "object" && !Array.isArray(v)
      ? (v as SkillConfigOverride["outputSchema"])
      : undefined;
  return {
    id: o.id,
    version: str(o.version),
    system: str(o.system),
    template: str(o.template),
    tools: strArr(o.tools),
    requiredFacets: strArr(o.requiredFacets),
    outputSchema: obj(o.outputSchema),
  };
}

/** 解析 + 收窄 bundle;形状不对 → null。 */
export function parseBundle(raw: unknown): RemotePromptBundle | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  if (!Array.isArray(b.overrides)) return null;
  const overrides = b.overrides
    .map(normOverride)
    .filter((o): o is SkillConfigOverride => o !== null);
  return {
    version: typeof b.version === "string" ? b.version : "",
    signedAt: typeof b.signedAt === "string" ? b.signedAt : "",
    overrides,
  };
}

/**
 * Ed25519 detached 验签(node:crypto 原生)。任何异常(坏公钥/坏签/算法不符)→ false(诚实拒绝)。
 * bundleBytes = 被签的原始字节;signatureBase64 = detached 签名 base64;publicKeyPem = SPKI PEM。
 */
export function verifyBundleSignature(
  bundleBytes: Buffer,
  signatureBase64: string,
  publicKeyPem: string,
): boolean {
  try {
    const sig = Buffer.from(signatureBase64, "base64");
    if (sig.length === 0) return false;
    const pub = createPublicKey(publicKeyPem);
    // Ed25519 传 algorithm=null(数据本身即消息,SDK 内部 hash 语义由曲线定)。
    return verify(null, bundleBytes, pub, sig);
  } catch {
    return false;
  }
}

export interface FetchRemoteOverridesOptions {
  /** 已签 bundle 的 URL;.sig 默认取 `${url}.sig`。未配 → 远程层关。 */
  url?: string;
  /** 内置公钥(SPKI PEM)。未配 → 远程层关(不验签就绝不套用)。 */
  publicKey?: string;
  /** 注入 fetch(测试注 fake,不走网络)。默认全局 fetch。 */
  fetchImpl?: typeof fetch;
  /** 日志(默认 console.warn)。 */
  logger?: (message: string) => void;
}

/**
 * 拉取远程 prompt override(GET bundle + .sig → 验签 → 解析)。**任何失败 → []**(诚实降级:
 * 未配/网络失败/验签失败/解析失败,一律纯本地照常、不套未签内容)。返回的 overrides 交
 * applySkillConfigOverridesFromDb 的 remoteOverrides(那里 skill 粒度锁守 D1)。
 */
export async function fetchRemotePromptOverrides(
  opts: FetchRemoteOverridesOptions,
): Promise<SkillConfigOverride[]> {
  const log = opts.logger ?? ((m: string) => console.warn(m));
  if (!opts.url || !opts.publicKey) return []; // 未配 → 远程层关(零副作用)。
  const doFetch = opts.fetchImpl ?? fetch;
  try {
    const [bundleRes, sigRes] = await Promise.all([
      doFetch(opts.url),
      doFetch(`${opts.url}.sig`),
    ]);
    if (!bundleRes.ok || !sigRes.ok) {
      log(
        `[remote-prompt-bundle] 拉取失败(bundle ${bundleRes.status} / sig ${sigRes.status}),纯本地。`,
      );
      return [];
    }
    const bundleBytes = Buffer.from(await bundleRes.arrayBuffer());
    const sigBase64 = (await sigRes.text()).trim();
    if (!verifyBundleSignature(bundleBytes, sigBase64, opts.publicKey)) {
      log("[remote-prompt-bundle] 验签失败,丢弃远程包(不套未签/验不过内容),纯本地。");
      return [];
    }
    const parsed = parseBundle(
      JSON.parse(bundleBytes.toString("utf8")) as unknown,
    );
    return parsed?.overrides ?? [];
  } catch (err) {
    log(
      `[remote-prompt-bundle] 拉取/解析异常,纯本地降级: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return [];
  }
}
