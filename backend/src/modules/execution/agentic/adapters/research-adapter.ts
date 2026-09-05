// [T-256c] 调研领域工具适配器(SPEC §3:选题调研 = 最纯自主循环、安全风险低 → 引擎放开跑)。
// 工具 = web 搜索端口 + web.read 分窗(T-251)+ 知识写入门。**agent 拿领域工具不拿 raw 浏览器**:
// 登录态/抽取/限流烤在端口(persistence-client 绑真端口:search resolve + web-reader + knowledgeService)。
//
// 复用锚:web.search / web.read / knowledge.write 端口形状照 chat-tools ChatToolDeps 同名端口(T-217c/
// T-251/T-094),不重造端口逻辑;本适配器只把它们包成引擎认的 AgenticTool(白名单 agentic.research)。
import { z } from "zod";
import type { AgenticTool } from "../engine";

/** web.read 分窗上限(T-251:web.read 窗口 12000 chars,与 chat 侧 WEB_READ_WINDOW_MAX_CHARS 同口径)。 */
export const RESEARCH_WEB_READ_WINDOW_CHARS = 12000;

/** 调研端口(ctx-free 窄接口;persistence-client 绑用户域真端口,测试注 fake)。 */
export interface ResearchPorts {
  /** 真联网检索(端口内 resolveSearchSpec + searchWeb;未配 → 诚实空结果 + note)。 */
  webSearch(
    input: { query: string },
    signal: AbortSignal,
  ): Promise<{
    grounding: "web" | "model_memory";
    results: Array<{ title: string; url: string; snippet: string }>;
  }>;
  /** 带登录态读一个 URL 正文(T-217c);needLogin → 引导登录不抓;端口回全文,适配器分窗。 */
  webRead(
    input: { url: string },
    signal: AbortSignal,
  ): Promise<
    | { needLogin: false; title: string; fullText: string; sourceUrl: string }
    | { needLogin: true; domain: string }
  >;
  /**
   * 知识写入门(T-094 语义):**pending** 落库(铁律②:AI 写入需人确认,端口只落 pending,
   * 人在知识库确认卡采纳才 active)。返回 pending 条目 id。
   */
  knowledgeWrite(
    input: { title: string; note: string; sourceNote: string },
    signal: AbortSignal,
  ): Promise<{ pendingId: string }>;
}

const webSearchParams = z.object({ query: z.string().min(1) });
const webReadParams = z.object({ url: z.string().min(1) });
const knowledgeWriteParams = z.object({
  title: z.string().min(1),
  note: z.string().min(1),
  sourceNote: z.string().default(""),
});

/** 把调研端口包成三个引擎工具(agentic.research 白名单)。 */
export function createResearchTools(ports: ResearchPorts): AgenticTool[] {
  return [
    {
      name: "web.search",
      label: "联网检索",
      description:
        "按 query 真实联网检索,返回带来源 URL 的结果条目(用于选题调研的『搜』步)。",
      effect: "none",
      parameters: webSearchParams,
      planInput: (goal) => ({ query: goal }),
      async execute(input, { signal }) {
        const { query } = webSearchParams.parse(input);
        const res = await ports.webSearch({ query }, signal);
        const note =
          res.grounding === "web"
            ? `联网检索到 ${res.results.length} 条`
            : `未配联网检索,降级模型记忆(需核实),${res.results.length} 条`;
        return {
          hasEvidence: res.grounding === "web" && res.results.some(row => Boolean(row.url.trim())),
          summary: note,
          data: { grounding: res.grounding, results: res.results },
        };
      },
    },
    {
      name: "web.read",
      label: "读网页正文",
      description:
        "带登录态读一个 URL 的正文全文(比截图准),用于调研的『读』步;需登录的站点会返回登录引导。",
      effect: "none",
      parameters: webReadParams,
      // 确定性引擎:读上一步搜到的第一个 URL(串起 搜→读 链路)。
      planInput: (_goal, outputs) => {
        const search = outputs["web.search"] as
          | { results?: Array<{ url?: string }> }
          | undefined;
        const url = search?.results?.[0]?.url;
        return url ? { url } : { url: "" };
      },
      async execute(input, { signal }) {
        const { url } = webReadParams.parse(input);
        if (!url) return { summary: "无可读 URL(上一步无检索结果)" };
        const res = await ports.webRead({ url }, signal);
        if (res.needLogin) {
          return {
            summary: `需登录 ${res.domain},已跳过(引导用户去保管库登录)`,
            data: { needLogin: true, domain: res.domain },
          };
        }
        // T-251 分窗:端口回全文,适配器截到窗口上限(引擎上下文预算,诚实标截断)。
        const windowed = res.fullText.slice(0, RESEARCH_WEB_READ_WINDOW_CHARS);
        const truncated = res.fullText.length > RESEARCH_WEB_READ_WINDOW_CHARS;
        return {
          hasEvidence: Boolean(res.sourceUrl.trim() && windowed.trim()),
          summary: `读到《${res.title}》正文 ${windowed.length} 字${truncated ? "(已分窗截断)" : ""}`,
          data: {
            title: res.title,
            sourceUrl: res.sourceUrl,
            text: windowed,
            truncated,
          },
        };
      },
    },
    {
      name: "knowledge.write",
      label: "写入知识库(待确认)",
      description:
        "把调研综合出的一条知识原子写入知识库。落 pending,需用户在知识库确认卡采纳才生效(铁律②)。",
      effect: "writeback",
      parameters: knowledgeWriteParams,
      planInput: (goal, outputs) => {
        const read = outputs["web.read"] as
          | { title?: string; sourceUrl?: string }
          | undefined;
        return {
          title: read?.title ? `调研:${read.title}` : `调研:${goal}`,
          note: `围绕「${goal}」的调研综合(自主循环产出,采纳前请核对)。`,
          sourceNote: read?.sourceUrl ?? "",
        };
      },
      async execute(input, { signal, dryRun }) {
        const p = knowledgeWriteParams.parse(input);
        if (dryRun) {
          // 干跑:只出计划预告,不落 pending(SPEC §4.4)。
          return {
            summary: `[计划] 拟写入知识库:${p.title}`,
            plan: `将写入 pending 知识原子「${p.title}」,来源:${p.sourceNote || "(无)"}`,
          };
        }
        const { pendingId } = await ports.knowledgeWrite(p, signal);
        return {
          hasEvidence: Boolean(pendingId.trim()),
          summary: `已写入 pending 知识原子「${p.title}」(待确认门采纳)`,
          data: { pendingId, title: p.title },
        };
      },
    },
  ];
}
