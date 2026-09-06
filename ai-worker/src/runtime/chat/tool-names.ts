// 工具名称只做供应商协议编码，内部业务名称保持原样。
export function sanitizeToolName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_");
}

/**
 * [T-439] 批量合规化「按工具名索引的 Record」的 key —— 泛型是刻意的:`tools`(ToolSet)与
 * `toolApproval`(Record<string, 判定器>)**必须用同一套换名**,否则 SDK 回传 tool_call 时授权门
 * 的键对不上 = HITL 形同虚设。故两者都走本函数。
 *
 * 调用时机:**只在发给模型的那一刻**(streamText 入参)换,装配层一律保持原名 —— 原名是内部真值
 * (错误信封登记 CHAT_TOOL_ERROR_ENVELOPES、白名单 toolWhitelist、深链 functionKey、审计日志
 * `[chat-tool] name=` 全按原名),在装配层换会连带打穿这些(实测打红 36 个既有用例)。
 *
 * 撞名 **fail-fast 抛错**——静默覆盖会让某个工具凭空消失(模型再也调不到它,且毫无征兆),比直接
 * 报错危险得多。当前 50 个带点工具名 sanitize 后无冲突,有测锚钉住。
 */
export function sanitizeToolNames<T>(rec: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [name, t] of Object.entries(rec)) {
    const safe = sanitizeToolName(name);
    if (safe in out) {
      throw new Error(
        `[chat-tool-gate][T-439] 工具名合规化撞名:「${name}」→「${safe}」已被占用 —— 请改工具命名避免冲突(禁止静默覆盖)`,
      );
    }
    out[safe] = t;
  }
  return out;
}

/**
 * [T-456] 把 system prompt 里出现的**每个原始工具名字面引用**替换成 sanitize 后的名。
 *
 * 背景(2026-07-21 用户 log(4) 真机):T-439 只 sanitize 了 tools 定义 key
 * (点号→下划线),Provider 400 拒绝已修;但 chat-runner 的 system prompt 里 8+ 处
 * 直接以字面量引用工具名(`context.projects` / `context.metrics` /
 * `context.artifact.text` / `context.positioning.detail` …)—— 模型看到 prompt 里
 * 的"要读文本调 context.artifact.text",**按字面吐 tool_call 带点号**,SDK 找的
 * 却是 sanitize 后的下划线名 → `AI_NoSuchToolError` → chat-turn 全 aborted。
 *
 * 修复策略:单点收口,不改 prompt 源码(T-439 已论证在装配层改会打红 36 个既有用例;
 * 装配层原名是错误信封/白名单/深链/审计日志的**内部真值**,改一次穿一片)。改法:
 * 在 chat-runner streamText 入参 `system` 那一行**套一层**;扫 tools 原始名 list,
 * 把 system 里每个原始名的完整词字面量替换成 sanitize 后的名。
 *
 * 只替换名字**恰好等于**原始名的完整 token(前后是非标识符字符),避免:
 *   · "context.projects.detail" 被误替 → "context_projects.detail"(应该整体重命
 *      名到 "context_projects_detail",但那是另一个已注册的工具,不是子串关系)
 *   · Markdown/code fence 里的裸文本被误伤
 * 用 `\b<original>\b` 词边界安全但不够(`.` 不是 \w,词边界包含点);故手写前后
 * lookaround:前面非 `[\w.]`(不接工具名字符/点)、后面非 `[\w.]`(同上)。
 *
 * 撞名 fail-fast(与 sanitizeToolNames 同):调用方必须保证 tools 的原始 keys 里
 * sanitize 后无重复,否则该抛错(通常上游 sanitizeToolNames 已抛过)。
 */
export function sanitizeSystemToolReferences(
  system: string,
  tools: Record<string, unknown>,
): string {
  // 提出所有"含非标识符字符(点/斜杠等)"的原始工具名——只有这些需要替换;纯合规名(全
  // 下划线/字母数字)不动,免得误伤业务文字。按长度倒序,长名先替(避免 "a.b.c" 里
  // "a.b" 被短名先替破坏结构)。
  const originals = Object.keys(tools)
    .filter((n) => sanitizeToolName(n) !== n)
    .sort((a, b) => b.length - a.length);
  if (originals.length === 0) return system;

  let result = system;
  for (const orig of originals) {
    const safe = sanitizeToolName(orig);
    // 转义正则元字符(尤其点号)。lookaround:前后不能是标识符字符或点,避免误替长名一部分。
    const escaped = orig.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(?<![\\w.])${escaped}(?![\\w.])`, "g");
    result = result.replace(re, safe);
  }
  return result;
}
