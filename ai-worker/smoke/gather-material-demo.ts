/**
 * 「素材搜集 agent」真跑 demo — 证明 CreatorOS 是个 agent 运行时。
 * 给一个选题 + 创作者定位 → agent 真用 WebSearch/WebFetch 去找相关素材 → 返回候选。
 * 跑: cd ai-worker && env CLAUDE_CODE_OAUTH_TOKEN="$(cat ~/.creatoros-oauth-token)" npx tsx smoke/gather-material-demo.ts "选题"
 */
import { query } from "@anthropic-ai/claude-agent-sdk";

const TOPIC = process.argv[2] ?? "AI 浏览器(AI Native Browser)的机会与趋势";

// 这段未来会变成一个版本化的「素材搜集」Skill;现在内联演示能力。
const POSITIONING =
  "面向『想用 AI 但不会动手的普通人/老板/职场人』的变现型自媒体;已有产品:1v1 咨询、工作流定制、知识星球;看转化率不只看播放量。";

const SKILL = `你是这位创作者的"素材搜集 agent"。
【创作者定位】${POSITIONING}
【任务】为给定选题,主动联网搜集"相关、可信、对这个定位有用"的素材(文章/数据/案例/对标)。
【相关性判据】① 跟选题强相关 ② 跟创作者定位+变现目标对齐(能支撑信任/转化,不是纯流量噱头) ③ 源可信。
【做法】用 WebSearch 多角度搜(趋势/数据/反面/案例/对标),挑 5-8 条最有价值的;拿不准就 WebFetch 看一眼确认。
【输出】最后只输出一个 JSON 数组,每条 {title, url, source, why_relevant(为什么对这个定位+选题有用,一句中文)}。不要任何多余文字。`;

console.error(`\n选题:${TOPIC}\n--- agent 开始干活(真联网) ---`);
let out = "";
for await (const m of query({
  prompt: `选题:${TOPIC}\n\n${SKILL}`,
  options: {
    allowedTools: ["WebSearch", "WebFetch"],
    permissionMode: "bypassPermissions",
  },
})) {
  const msg = m as {
    type?: string;
    subtype?: string;
    result?: string;
    total_cost_usd?: number;
    message?: { content?: Array<{ type: string; name?: string; input?: unknown }> };
  };
  if (msg.type === "assistant") {
    for (const b of msg.message?.content ?? []) {
      if (b.type === "tool_use") {
        console.error(`  · agent 调用 ${b.name}: ${JSON.stringify(b.input).slice(0, 100)}`);
      }
    }
  }
  if (msg.type === "result") {
    out = msg.result ?? "";
    console.error(`--- 完成 (${msg.subtype}, 用量≈$${msg.total_cost_usd}) ---`);
  }
}
console.log("\n=== agent 找到的素材候选 ===\n" + out);
