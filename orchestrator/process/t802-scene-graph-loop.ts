#!/usr/bin/env tsx
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  decideCards,
  buildCardsDecisionSchema,
  type StructuredCall,
  type VideoDecisions,
  type VideoInfoCard,
  type VideoScene,
} from "../../backend/src/modules/ai-runtime/video-decisions-runner";
import { generateVideoRenderHtml } from "../../backend/src/modules/execution/video-render/template";
import {
  VIDEO_CARDS_TEMPLATE,
  bindPrompt,
  videoCardsSchema,
} from "../../ai-worker/src";
import { createAnthropicProvider } from "../../backend/src/modules/ai-runtime/llm/anthropic-adapter";
import { assembleVideoRenderProps } from "../../frontend/src/features/production/assemble-video-render-props";

type Orientation = "portrait" | "landscape";

interface EvalCase {
  id: string;
  domain: string;
  title: string;
  script: string;
  lines: Array<{ index: number; startSec: number; endSec: number; text: string }>;
}

const outputArg = process.argv.slice(2).find((argument) => !argument.startsWith("--"));
const outputRoot = resolve(
  outputArg ?? "output/content-samples/composable-scene-graph-loop",
);
mkdirSync(outputRoot, { recursive: true });

/**
 * 冻结集刻意让 4 题都含 cause_effect，检验同关系不会被渲染成同一机器；其余覆盖
 * replacement/sequence/statement。不是按关键词分派视觉，所有对象选择仍由 v4 Skill/模型完成。
 */
export const T802_CASES: readonly EvalCase[] = [
  {
    id: "feature-overload",
    domain: "产品思考",
    title: "功能越多，不等于产品越好",
    lines: [
      { index: 1, startSec: 0, endSec: 4, text: "功能越堆越多，用户完成任务反而更难。" },
      { index: 2, startSec: 4, endSec: 8, text: "用户购买的不是功能清单，而是一条更省力的路径。" },
      { index: 3, startSec: 8, endSec: 12, text: "删掉不影响结果的步骤，把验证过的路径留在主流程。" },
    ],
    script: "功能越堆越多，用户完成任务反而更难。用户购买的不是功能清单，而是一条更省力的路径。删掉不影响结果的步骤，把验证过的路径留在主流程。",
  },
  {
    id: "sleep-notifications",
    domain: "个人成长",
    title: "通知正在偷走你的睡眠",
    lines: [
      { index: 1, startSec: 0, endSec: 4, text: "睡前通知越多，真正留给睡眠的时间越短。" },
      { index: 2, startSec: 4, endSec: 8, text: "改变不是把计划表塞满，而是先移走一个高频干扰。" },
      { index: 3, startSec: 8, endSec: 12, text: "连续记录七天，再比较入睡时间和第二天状态。" },
    ],
    script: "睡前通知越多，真正留给睡眠的时间越短。改变不是把计划表塞满，而是先移走一个高频干扰。连续记录七天，再比较入睡时间和第二天状态。",
  },
  {
    id: "material-bottleneck",
    domain: "内容生产",
    title: "素材越多，发布反而越慢",
    lines: [
      { index: 1, startSec: 0, endSec: 4, text: "素材不断涌进收件箱，发布轨道却一直空着。" },
      { index: 2, startSec: 4, endSec: 8, text: "真正缺的不是更多素材，而是筛选和交付的标准。" },
      { index: 3, startSec: 8, endSec: 12, text: "先让素材经过同一把尺，再把合格内容送进发布日历。" },
    ],
    script: "素材不断涌进收件箱，发布轨道却一直空着。真正缺的不是更多素材，而是筛选和交付的标准。先让素材经过同一把尺，再把合格内容送进发布日历。",
  },
  {
    id: "meeting-overload",
    domain: "组织协作",
    title: "会议越多，决定不一定越快",
    lines: [
      { index: 1, startSec: 0, endSec: 4, text: "日历上的会议越叠越满，真正的决定反而被挤到最后。" },
      { index: 2, startSec: 4, endSec: 8, text: "同步信息和做决定不是同一件事。" },
      { index: 3, startSec: 8, endSec: 12, text: "先把信息放进共享文档，只把分歧带进会议。" },
    ],
    script: "日历上的会议越叠越满，真正的决定反而被挤到最后。同步信息和做决定不是同一件事。先把信息放进共享文档，只把分歧带进会议。",
  },
  {
    id: "archive-understanding",
    domain: "知识管理",
    title: "保存不等于理解",
    lines: [
      { index: 1, startSec: 0, endSec: 4, text: "资料全部进了档案库，不代表它们已经变成你的判断。" },
      { index: 2, startSec: 4, endSec: 8, text: "保存解决的是记录，理解需要建立连接。" },
      { index: 3, startSec: 8, endSec: 12, text: "让一条新资料连接旧结论，再决定它改变了什么。" },
    ],
    script: "资料全部进了档案库，不代表它们已经变成你的判断。保存解决的是记录，理解需要建立连接。让一条新资料连接旧结论，再决定它改变了什么。",
  },
  {
    id: "customer-evidence",
    domain: "经营",
    title: "客户说喜欢，不等于愿意购买",
    lines: [
      { index: 1, startSec: 0, endSec: 4, text: "客户说喜欢，只能证明表达让他舒服。" },
      { index: 2, startSec: 4, endSec: 8, text: "只有真实下单，才证明方案解决了值得付费的问题。" },
      { index: 3, startSec: 8, endSec: 12, text: "先用小订单验证，再把有效方案放大。" },
    ],
    script: "客户说喜欢，只能证明表达让他舒服。只有真实下单，才证明方案解决了值得付费的问题。先用小订单验证，再把有效方案放大。",
  },
];

function scenesFor(item: EvalCase): VideoScene[] {
  return [{ title: item.title, summary: item.script, startSec: 0, endSec: 12 }];
}

function srtFacet(item: EvalCase) {
  return item.lines
    .map((line) => `${line.index} | ${line.startSec}s-${line.endSec}s | ${line.text}`)
    .join("\n");
}

function sceneFacet(item: EvalCase) {
  return `0 | 0s-12s | ${item.title} | ${item.script}`;
}

function outputShape(): Record<string, unknown> {
  // 旧 provider 的 schema 文本负担较小，真正的协议仍由 videoCardsSchema + decideCards 双门校验。
  return {
    type: "object",
    properties: {
      cards: {
        type: "array",
        items: { type: "object" },
      },
    },
    required: ["cards"],
  };
}

function modelCall(item: EvalCase, candidateIndex: number): StructuredCall {
  const token = process.env.MINIMAX_API_KEY;
  if (!token) throw new Error("T-802 loop 需要 MINIMAX_API_KEY");
  const llm = createAnthropicProvider({
    apiFormat: "anthropic",
    baseUrl: process.env.CREATOROS_LLM_BASE_URL ?? "https://api.minimaxi.com/anthropic",
    model: process.env.CREATOROS_LLM_MODEL ?? "MiniMax-M3",
    authStyle: "bearer",
    token,
    settings: {},
  });
  return async <T>(input: Parameters<StructuredCall>[0]) => {
    const bound = bindPrompt(VIDEO_CARDS_TEMPLATE, input.facets);
    const variation =
      candidateIndex === 0
        ? "\n【本轮变体】这是 Scene Graph 评测题。必须输出 2 个信息节拍，其中至少 1 个带合法 scene。优先寻找内容中最具体、可运动的主语，使用克制的 2–4 个实体。"
        : "\n【本轮变体】这是 Scene Graph 评测题。必须输出 2 个信息节拍，其中至少 1 个带合法 scene。寻找不同于第一直觉的第二种可见机制，优先改变构图轴或运动轨迹轴；不能为了不同而添加事实。";
    const loopFeedback = process.env.T802_LOOP_FEEDBACK?.trim();
    let prompt = `${bound.prompt}${variation}${loopFeedback ? `\n\n【上一轮评分反馈】${loopFeedback}` : ""}`;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await llm.complete(prompt, {
        system: bound.system,
        schema: outputShape(),
        maxTokens: 8192,
      });
      writeFileSync(
        resolve(outputRoot, `.${item.id}.candidate-${candidateIndex + 1}.attempt-${attempt + 1}.raw.json`),
        `${JSON.stringify(response.json, null, 2)}\n`,
        "utf8",
      );
      const parsed = buildCardsDecisionSchema(1, item.lines.map((line) => line.startSec)).safeParse(response.json);
      if (parsed.success) {
        writeFileSync(
          resolve(outputRoot, `.${item.id}.candidate-${candidateIndex + 1}.raw-model.json`),
          `${JSON.stringify(parsed.data, null, 2)}\n`,
          "utf8",
        );
        return parsed.data as T;
      }
      if (attempt === 4) {
        throw new Error(`MiniMax 返回未通过 video.cards v4 schema:${parsed.error.message}`);
      }
      prompt = `${bound.prompt}${variation}\n\n【上一次只需修协议，不改事实或文案】\n${parsed.error.issues
        .slice(0, 12)
        .map((issue) => `- ${issue.path.join(".")}: ${issue.message}`)
        .join("\n")}\n请重新输出完整 JSON。逐 beat 硬修：enter 只增 opacity、exit 只减 opacity；move 只留 x/y；grow/focus 只增 scale；shrink/compress 只减 scale（例如 scale 1→0.45 必须用 shrink，不能用 grow）；overflow 只增 count；trace/reveal 只增 progress；replace 只减 target opacity 且写 with。禁止附带任何其它属性，哪怕没变化也删掉。多个 step 时所有 entity 都省略 textRole。每个 beat 必须包含 from:{} 与 to:{}。`;
    }
    throw new Error("MiniMax 协议返修未产生结果");
  };
}

function codexCall(item: EvalCase, candidateIndex: number): StructuredCall {
  return async <T>(input: Parameters<StructuredCall>[0]) => {
    const bound = bindPrompt(VIDEO_CARDS_TEMPLATE, input.facets);
    const variation = candidateIndex === 0
      ? "本轮优先寻找内容中最具体、可运动的主语，使用克制的 2–4 个实体。"
      : "本轮必须寻找不同于第一直觉的第二种可见机制，至少改变构图轴或运动轨迹轴；不得为了不同添加事实。";
    const loopFeedback = process.env.T802_LOOP_FEEDBACK?.trim();
    const promptFile = resolve(outputRoot, `.${item.id}.candidate-${candidateIndex + 1}.prompt.txt`);
    const responseFile = resolve(outputRoot, `.${item.id}.candidate-${candidateIndex + 1}.response.json`);
    writeFileSync(promptFile, `${bound.system}\n\n${bound.prompt}\n\n${variation}${loopFeedback ? `\n\n【上一轮评分反馈】${loopFeedback}` : ""}\n只返回符合 schema 的 JSON，不要解释。`, "utf8");
    execFileSync(
      "codex",
      [
        "exec",
        "--ephemeral",
        "--skip-git-repo-check",
        "--ignore-rules",
        "--sandbox",
        "read-only",
        "--output-last-message",
        responseFile,
        "-",
      ],
      {
        cwd: outputRoot,
        input: readFileSync(promptFile, "utf8"),
        stdio: ["pipe", "ignore", "pipe"],
        timeout: 180_000,
      },
    );
    const parsed = videoCardsSchema.safeParse(JSON.parse(readFileSync(responseFile, "utf8")));
    if (!parsed.success) throw new Error(`Codex 返回未通过 video.cards v4 schema:${parsed.error.message}`);
    return parsed.data as T;
  };
}

function decisionsFor(item: EvalCase, cards: VideoInfoCard[]): VideoDecisions {
  return {
    scenes: scenesFor(item),
    cards,
    broll: [],
    subtitles: item.lines.map((line) => ({
      index: line.index,
      startSec: line.startSec,
      endSec: line.endSec,
      zh: line.text,
      en: "",
    })),
    srtLines: item.lines,
  };
}

function renderHtml(item: EvalCase, cards: VideoInfoCard[], orientation: Orientation): string {
  const props = assembleVideoRenderProps(decisionsFor(item, cards), {
    title: item.title,
    talkingHeadAssetId: "data:video/mp4;base64,",
    talkingHeadDurationSec: 12,
    orientation,
  });
  props.meta.brandLabel = "CreatorOS · Scene Graph v2";
  props.talkingHead.hasAudio = false;
  return generateVideoRenderHtml(props, {
    gsapSrc: new URL("../../backend/node_modules/gsap/dist/gsap.min.js", import.meta.url).href,
    mediaPrefix: "",
    visualOnly: true,
  }).replace(
    "<style>",
    '<style>@font-face{font-family:"PingFang SC";src:local("PingFang SC")}@font-face{font-family:"Microsoft YaHei";src:local("Microsoft YaHei")}',
  );
}

async function main() {
  const winnerMapPath = resolve(outputRoot, "winner-map.json");
  const winnerMap = existsSync(winnerMapPath)
    ? (JSON.parse(readFileSync(winnerMapPath, "utf8")) as { winners?: Record<string, number> }).winners ?? {}
    : {};
  const chooseWinner = <T extends { candidateIndex: number; sceneCount: number; entityKinds: string[] }>(
    id: string,
    candidates: T[],
  ): T | undefined => {
    const judgedIndex = winnerMap[id];
    if (Number.isInteger(judgedIndex)) {
      const judged = candidates.find((candidate) => candidate.candidateIndex === judgedIndex);
      if (judged?.sceneCount) return judged;
    }
    return [...candidates].sort(
      (a, b) => b.sceneCount - a.sceneCount || a.entityKinds.length - b.entityKinds.length || a.candidateIndex - b.candidateIndex,
    )[0];
  };
  if (process.argv.includes("--render-only")) {
    const prior = JSON.parse(readFileSync(resolve(outputRoot, "candidates.json"), "utf8")) as {
      results: Array<{
        id: string;
        candidates: Array<{
          candidateIndex: number;
          cards: VideoInfoCard[];
          sceneCount: number;
          entityKinds: string[];
        }>;
      }>;
    };
    for (const result of prior.results) {
      const item = T802_CASES.find((entry) => entry.id === result.id);
      if (!item) continue;
      const winner = chooseWinner(result.id, result.candidates);
      if (!winner || winner.sceneCount === 0) continue;
      for (const orientation of ["portrait", "landscape"] as const) {
        writeFileSync(resolve(outputRoot, `${item.id}.${orientation}.html`), renderHtml(item, winner.cards, orientation));
      }
    }
    console.log(JSON.stringify({ status: "rendered-html", outputRoot, cases: prior.results.length }));
    return;
  }
  const generator = process.env.T802_GENERATOR ?? "codex";
  const results = [];
  const selectedCases = process.env.T802_CASE_ID
    ? T802_CASES.filter((entry) => entry.id === process.env.T802_CASE_ID)
    : process.env.T802_LIMIT
      ? T802_CASES.slice(0, Math.max(1, Number(process.env.T802_LIMIT)))
      : T802_CASES;
  if (selectedCases.length === 0) throw new Error(`Unknown T802_CASE_ID:${process.env.T802_CASE_ID}`);
  for (const item of selectedCases) {
    const candidates = [];
    for (const candidateIndex of [0, 1]) {
      try {
        const cards = await decideCards(
          {
            scenes: scenesFor(item),
            srtLines: item.lines,
            script: item.script,
            orientation: "portrait",
          },
          generator === "minimax" ? modelCall(item, candidateIndex) : codexCall(item, candidateIndex),
        );
        const sceneCards = cards.filter((card) => card.visualPlan?.scene);
        candidates.push({
          candidateIndex,
          cards,
          sceneCount: sceneCards.length,
          layouts: sceneCards.map((card) => card.visualPlan!.scene!.layout),
          entityKinds: sceneCards.flatMap((card) => card.visualPlan!.scene!.entities.map((entity) => entity.kind)),
          generationError: null as string | null,
        });
        writeFileSync(
          resolve(outputRoot, `${item.id}.candidate-${candidateIndex + 1}.json`),
          `${JSON.stringify({ item, cards }, null, 2)}\n`,
        );
      } catch (error) {
        candidates.push({
          candidateIndex,
          cards: [] as VideoInfoCard[],
          sceneCount: 0,
          layouts: [] as string[],
          entityKinds: [] as string[],
          generationError: error instanceof Error ? error.message : String(error),
        });
      }
    }
    results.push({ id: item.id, domain: item.domain, title: item.title, candidates });
  }
  writeFileSync(
    resolve(outputRoot, "candidates.json"),
    `${JSON.stringify({
      schema: "creatoros-t802-scene-graph-loop/v1",
      model: generator === "minimax" ? process.env.CREATOROS_LLM_MODEL ?? "MiniMax-M3" : "Codex configured model",
      skill: `${VIDEO_CARDS_TEMPLATE.id}@${VIDEO_CARDS_TEMPLATE.version}`,
      generationPath: generator === "minimax"
        ? "same official Skill + MiniMax credential + decideCards; local DB snapshot bypassed because existing migration gate blocks old unscoped rows"
        : "same official Skill schema + Codex independent generator + decideCards; MiniMax credential returned 401 during this run",
      generatedAt: new Date().toISOString(),
      results,
    }, null, 2)}\n`,
  );
  // 评分后可传 winner-map.json 覆盖；首次先用 Scene 数更多、再用原语更少的确定性预选。
  for (const result of results) {
    const item = T802_CASES.find((entry) => entry.id === result.id)!;
    const winner = chooseWinner(result.id, result.candidates)!;
    if (winner.sceneCount === 0) continue;
    for (const orientation of ["portrait", "landscape"] as const) {
      writeFileSync(
        resolve(outputRoot, `${item.id}.${orientation}.html`),
        renderHtml(item, winner.cards, orientation),
      );
    }
  }
  console.log(JSON.stringify({ status: "generated", outputRoot, cases: results.length }));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
