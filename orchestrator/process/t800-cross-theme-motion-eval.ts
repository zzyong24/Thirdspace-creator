#!/usr/bin/env tsx
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  decideCards,
  type StructuredCall,
  type VideoDecisions,
  type VideoInfoCard,
  type VideoScene,
} from "../../backend/src/modules/ai-runtime/video-decisions-runner";
import { generateVideoRenderHtml } from "../../backend/src/modules/execution/video-render/template";
import {
  getTemplate,
  modelFor,
  runStructuredNode,
} from "../../ai-worker/src";
import { assembleVideoRenderProps } from "../../frontend/src/features/production/assemble-video-render-props";

type Orientation = "portrait" | "landscape";

interface ThemeCase {
  id: string;
  title: string;
  script: string;
  lines: Array<{ index: number; startSec: number; endSec: number; text: string }>;
}

const root = resolve(
  process.argv[2] ?? "output/content-samples/cross-theme-motion-eval",
);
mkdirSync(root, { recursive: true });

const themes: ThemeCase[] = [
  {
    id: "content-creation",
    title: "追热点不等于更会做内容",
    lines: [
      {
        index: 1,
        startSec: 0,
        endSec: 4,
        text: "每天追更多热点，选题列表越来越长，发布频率却没有变。",
      },
      {
        index: 2,
        startSec: 4,
        endSec: 8,
        text: "真正缺的不是灵感，而是一套筛选标准。",
      },
      {
        index: 3,
        startSec: 8,
        endSec: 12,
        text: "冻结受众和目标，只改一个选题变量，再用发布后的真实数据留下赢家。",
      },
    ],
    script:
      "每天追更多热点，选题列表越来越长，发布频率却没有变。真正缺的不是灵感，而是一套筛选标准。冻结受众和目标，只改一个选题变量，再用发布后的真实数据留下赢家。",
  },
  {
    id: "personal-growth",
    title: "改变习惯不是把计划表塞满",
    lines: [
      {
        index: 1,
        startSec: 0,
        endSec: 4,
        text: "睡前多刷一个小时手机，第二天的专注力反而更差。",
      },
      {
        index: 2,
        startSec: 4,
        endSec: 8,
        text: "改变不是给计划表加更多任务，而是先移走一个高频干扰。",
      },
      {
        index: 3,
        startSec: 8,
        endSec: 12,
        text: "连续记录七天，比较入睡时间和第二天状态，再决定要不要保留这个改变。",
      },
    ],
    script:
      "睡前多刷一个小时手机，第二天的专注力反而更差。改变不是给计划表加更多任务，而是先移走一个高频干扰。连续记录七天，比较入睡时间和第二天状态，再决定要不要保留这个改变。",
  },
  {
    id: "product-thinking",
    title: "功能越多，不等于产品越好",
    lines: [
      {
        index: 1,
        startSec: 0,
        endSec: 4,
        text: "功能越多，不等于产品越好。",
      },
      {
        index: 2,
        startSec: 4,
        endSec: 8,
        text: "用户真正购买的不是功能清单，而是一个问题被更省力地解决。",
      },
      {
        index: 3,
        startSec: 8,
        endSec: 12,
        text: "先观察真实卡点，再删掉不影响结果的步骤，把验证过的路径留在主流程。",
      },
    ],
    script:
      "功能越多，不等于产品越好。用户真正购买的不是功能清单，而是一个问题被更省力地解决。先观察真实卡点，再删掉不影响结果的步骤，把验证过的路径留在主流程。",
  },
];

function buildScenes(theme: ThemeCase): VideoScene[] {
  return [
    {
      title: theme.title,
      summary: theme.script,
      startSec: 0,
      endSec: 12,
    },
  ];
}

function buildDecisions(
  theme: ThemeCase,
  scenes: VideoScene[],
  cards: VideoInfoCard[],
): VideoDecisions {
  return {
    scenes,
    cards,
    broll: [],
    subtitles: theme.lines.map((line) => ({
      index: line.index,
      startSec: line.startSec,
      endSec: line.endSec,
      zh: line.text,
    })),
    srtLines: theme.lines,
  };
}

function htmlFor(
  decisions: VideoDecisions,
  theme: ThemeCase,
  orientation: Orientation,
): string {
  const props = assembleVideoRenderProps(decisions, {
    title: theme.title,
    talkingHeadAssetId: "data:video/mp4;base64,",
    talkingHeadDurationSec: 12,
    orientation,
  });
  props.meta.brandLabel = "CreatorOS";
  props.talkingHead.hasAudio = false;
  const html = generateVideoRenderHtml(props, {
    gsapSrc: new URL(
      "../../backend/node_modules/gsap/dist/gsap.min.js",
      import.meta.url,
    ).href,
    mediaPrefix: "",
    visualOnly: true,
  });
  return html.replace(
    "<style>",
    '<style>@font-face{font-family:"PingFang SC";src:local("PingFang SC")}@font-face{font-family:"Microsoft YaHei";src:local("Microsoft YaHei")}',
  );
}

async function main(): Promise<void> {
const { getChatRuntime, getIdentityService, getPlatformAccountService } = await import(
  "../../frontend/src/server/persistence-client"
);
const identity = await getIdentityService();
const localCtx = await identity.resolveLocalContext();
const platformAccounts = await getPlatformAccountService();
const accounts = await platformAccounts.listAccounts(localCtx, {
  status: "active",
  limit: 1,
  offset: 0,
});
const account = accounts.rows[0];
if (!account) throw new Error("T-800 真实 Skill snapshot 评测需要至少一个 active 账号");
const ctx = { ...localCtx, accountId: account.id };
const runtime = await getChatRuntime();
const spec = await runtime.resolveModelSpec(ctx, "video.cards");
const model = modelFor(spec);
const call: StructuredCall = async <T>(input: Parameters<StructuredCall>[0]) => {
  const result = await runStructuredNode<T>({
    model,
    template: getTemplate(input.skillId),
    facets: input.facets,
    outputSchema: input.outputSchema,
    normalizeObject: input.normalizeObject,
    timeoutMs: input.timeoutMs,
  });
  return result.object;
};
const results = [];
for (const theme of themes) {
  const scenes = buildScenes(theme);
  const cards = await runtime.runWithEffectiveSkills(
    ctx,
    ["video.cards"],
    () =>
      decideCards(
        {
          scenes,
          srtLines: theme.lines,
          script: theme.script,
          orientation: "portrait",
        },
        call,
      ),
  );
  const decisions = buildDecisions(theme, scenes, cards);
  writeFileSync(
    resolve(root, `${theme.id}.decisions.json`),
    `${JSON.stringify(decisions, null, 2)}\n`,
    "utf8",
  );
  for (const orientation of ["portrait", "landscape"] as const) {
    writeFileSync(
      resolve(root, `${theme.id}.${orientation}.html`),
      htmlFor(decisions, theme, orientation),
      "utf8",
    );
  }
  results.push({
    id: theme.id,
    title: theme.title,
    cardCount: cards.length,
    relations: cards.map((card) => card.visualPlan?.relation ?? null),
    cards,
  });
}

writeFileSync(
  resolve(root, "model-decisions.json"),
  `${JSON.stringify(
    {
      schema: "creatoros-t800-cross-theme-motion-eval/v1",
      model: spec.model,
      skillId: "video.cards",
      skillVersion: getTemplate("video.cards").version,
      generatedAt: new Date().toISOString(),
      results,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

console.log(
  JSON.stringify({
    status: "generated",
    root,
    model: spec.model,
    skillVersion: getTemplate("video.cards").version,
    results: results.map(({ id, cardCount, relations }) => ({
      id,
      cardCount,
      relations,
    })),
  }),
);
await globalThis.__creatorosDisposePersistence?.();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
