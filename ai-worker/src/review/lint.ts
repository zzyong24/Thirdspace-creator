// L1 违禁词/模式 lint 引擎(T-086,SPEC §1)—— 纯函数、毫秒级、零 IO、可解释。
// 消费 review_rules 的 active 行(word 全文子串 / regex 谨慎白名单),对一段脚本文本
// 产出确定性命中项 LintFinding[]。单测可直接喂词表(无需 DB)。
//
// 设计约束:
//   - quote 必须是原文子串(offset 定位命中处),前端可高亮、报告可复核。
//   - word 匹配 = 大小写不敏感的全文包含扫描(中文无大小写,英文词如 QQ/Nobel 归一处理);
//   - regex 匹配 = 用规则自带的 pattern 编译(全局扫描取所有命中);非法 regex 跳过该规则
//     (不因一条坏规则整体崩,诚实降级)。
//   - 同一规则多次命中 → 多条 finding(每处独立 offset),前端逐处高亮。

/** lint 消费的规则形状(review_rules active 行的最小投影)。 */
export interface LintRule {
  id: string;
  tier: "official_hard" | "empirical" | "doudplus";
  category: string;
  matchType: "word" | "regex";
  pattern: string;
  replacement: string | null;
  note: string;
}

/** L1 命中项(确定性;quote 为原文子串,offset 为其在文本中的起始下标)。 */
export interface LintFinding {
  ruleId: string;
  quote: string;
  offset: number;
  tier: "official_hard" | "empirical" | "doudplus";
  category: string;
  replacement: string | null;
  note: string;
}

// word 全文子串扫描(大小写不敏感)。返回所有命中的 offset。
function scanWord(haystack: string, needle: string): number[] {
  if (!needle) return [];
  const hits: number[] = [];
  const lowerHay = haystack.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  let from = 0;
  for (;;) {
    const idx = lowerHay.indexOf(lowerNeedle, from);
    if (idx < 0) break;
    hits.push(idx);
    from = idx + lowerNeedle.length; // 不重叠推进
  }
  return hits;
}

// regex 全局扫描。非法 pattern → 返回 []( 调用方跳过该规则,不崩)。
function scanRegex(
  haystack: string,
  pattern: string,
): { offset: number; quote: string }[] {
  let re: RegExp;
  try {
    re = new RegExp(pattern, "g");
  } catch {
    return []; // 坏规则跳过(诚实降级,不因一条崩全局)
  }
  const hits: { offset: number; quote: string }[] = [];
  for (const m of haystack.matchAll(re)) {
    if (m.index === undefined) continue;
    const quote = m[0];
    if (!quote) continue; // 空匹配防死循环
    hits.push({ offset: m.index, quote });
  }
  return hits;
}

/**
 * 对 text 跑一批 active 规则,返回全部命中项(按 offset 升序)。
 * 纯函数:同输入同输出,零 IO。
 */
export function lintScript(text: string, rules: LintRule[]): LintFinding[] {
  const findings: LintFinding[] = [];
  for (const rule of rules) {
    if (rule.matchType === "word") {
      for (const offset of scanWord(text, rule.pattern)) {
        findings.push({
          ruleId: rule.id,
          quote: text.slice(offset, offset + rule.pattern.length),
          offset,
          tier: rule.tier,
          category: rule.category,
          replacement: rule.replacement,
          note: rule.note,
        });
      }
    } else {
      for (const { offset, quote } of scanRegex(text, rule.pattern)) {
        findings.push({
          ruleId: rule.id,
          quote,
          offset,
          tier: rule.tier,
          category: rule.category,
          replacement: rule.replacement,
          note: rule.note,
        });
      }
    }
  }
  return findings.sort((a, b) => a.offset - b.offset);
}
