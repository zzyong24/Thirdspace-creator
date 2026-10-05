/**
 * 稿面工作台(T-055a,SPEC §3)。
 *
 * 一个项目 = 一张不断成熟的稿子:
 *   顶条  = ←项目 / 标题 / 成熟度点×5 / 主行动;
 *   左稿面 = 选题卡(折叠/展开 BriefWorkbench)→ 口播脚本(TipTap 迁入)→
 *           发布包(锁定/解锁)→ 弹药抽屉,左缘成熟度轨;
 *   右栏  = 编导对话(T-055b 装入;本切片先渲染结构占位,不做假交互)。
 *
 * Server Component。数据装配见 draft-workbench-data.ts(零新实体,SPEC §4)。
 */

import * as React from "react";

import { CoverThumb } from "@/components/resources/cover-thumb";
import { ScriptRichEditor } from "@/features/script/script-rich-editor";
import { ScriptStructureToggle } from "@/features/script/script-structure-view";
import { ScriptVersionMenu } from "@/features/script/script-version-restore";
import { sectionsToHtml } from "@/features/script/script-editor-bridge";
import { ContentDirectionActions } from "./content-direction-actions";
import { TopicCard } from "./topic-card";
import { DraftChatRail } from "./draft-chat-rail";
import { DraftChatRequestProvider } from "./draft-chat-request";
import { DraftResizableLayout } from "./draft-resizable-layout";
import { CreationFlowCtas } from "./creation-flow-ctas";
import { ThesisSkeletonPanel } from "./thesis-skeleton-panel";
import { AmmoNoteForm } from "./ammo-note-form";
import { AmmoDumpZone } from "./ammo-dump-zone";
// [T-146] 弹药卡列表 + 双击预览抽为 client 组件(Modal 交互)。
import { AmmoCardList } from "./ammo-card-list";
import { DraftPrimaryAction } from "./draft-primary-action";
// [T-374] 顶条「立即抓取逐字稿」:自己作品(有抖音锚)单条立抓,不等每日自动任务。
import { TranscribeNowButton } from "./transcribe-now-button";
import { RegisterPublishedForm } from "./register-published-form";
import { BlindPredictRow } from "./blind-predict-row";
import { PublishPackageCta } from "./publish-package-cta";
import {
  ScriptReviewGate,
  ReviewSoftGateHint,
} from "./script-review-gate";
import type { DraftWorkbenchVm } from "./draft-workbench-data";
import { cn } from "@/lib/utils";

export function DraftWorkbenchPage({ vm }: { vm: DraftWorkbenchVm }) {
  const { project, script, scriptArtifactId, thesis, outputId, publishPack, projectCoverAssetId, publishUnlocked, blindPrediction, ammo, scriptReview } = vm;
  const hasTranscribeAction = Boolean(project.douyinExternalId && project.transcriptState !== "done");
  const isPublished = publishPack?.outputPublished ?? publishPack?.status === "published";
  const hasTopbarContent = project.imported || hasTranscribeAction || isPublished;
  const radarDraftSeed = vm.radarDraftSeed ?? "";
  const seedHtml = radarDraftSeed
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) =>
      `<p>${line
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")}</p>`,
    )
    .join("");
  const persistedHtml =
    script.editorHtml ??
    (script.sections.length > 0 ? sectionsToHtml(script.sections) : "");
  // 内容雷达的改写稿已经由用户在上游确认：项目尚无正式稿时直接填进现有编辑器。
  // 有正式版本后始终以 output_script 为准，即使用户把正式稿清空也不回灌旧 seed。
  const initialHtml =
    script.versionCount > 0 || persistedHtml.trim()
      ? persistedHtml
      : seedHtml;

  return (
    <main
      data-app="creatoros"
      data-page="draft-workbench"
      data-project-id={project.id}
      className="flex h-full min-h-0 flex-col"
    >
      {/* ── 顶条(T-075 收窄:标题与阶段条由 shell project-workspace header 统一提供;
          [T-076] 阶段条两段化「脚本|复盘」,主行动按发布态收敛)。 ── */}
      {hasTopbarContent && <header
        data-slot="draft-topbar"
        className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-surface px-5 py-2"
      >
        <div className="ml-auto flex shrink-0 items-center gap-2.5">
          {project.imported ? (
            <span
              data-slot="draft-imported-badge"
              className="rounded-full border border-border bg-surface-subtle px-2.5 py-1 text-[11px] text-muted-foreground"
            >
              真实导入作品
            </span>
          ) : null}
          {/* [T-505] 只在有抖音锚且尚无真稿时渲染；queued/running 从持久任务恢复并置灰。 */}
          {project.douyinExternalId && project.transcriptState !== "done" ? (
            <TranscribeNowButton
              projectId={project.id}
              initialState={project.transcriptState}
            />
          ) : null}
          {/* [T-076 gate-F1] 未发布 → null(顶条只剩 Finder);已发布 → 「看复盘 →」。 */}
          <DraftPrimaryAction
            projectId={project.id}
            published={isPublished}
          />
        </div>
      </header>}

      {/* ── 主体:左稿面 + 右对话位 ──
          [T-108] DraftChatRequestProvider 包住左稿面 + 右 rail:左稿面的 AI 按钮(盲预测/审核)
          通过 context 直接预填右栏常驻 rail(方案 A),不再走 `?copilot=open` 深链开全局弹层。 */}
      <DraftChatRequestProvider>
      {/* [T-130] 可拖拽分栏:左稿面(flex-1)| 右编导栏(可拖拽调宽 + localStorage 持久)。 */}
      <DraftResizableLayout
        left={
          <>
          {/* 成熟度轨(装饰,随区块态着色由各区块节点体现) */}
          <TopicCard
            projectId={project.id}
            title={project.title}
            brief={project.brief}
            briefDetail={project.briefDetail}
          />

          {/* [T-726] 创作流引导 CTA:选题 → 准备素材 → 直接写稿。
              [T-146] 传 projectId:「＋上传素材」把资料上传进「当前项目」弹药库。 */}
          <CreationFlowCtas projectId={project.id} />

          {/* [T-146/T-726] 弹药上移:用户先看到手里有哪些素材/资料，再直接写稿。 */}
          <AmmoDrawer ammo={ammo} projectId={project.id} />

          <ThesisSkeletonPanel
            thesis={thesis}
            ammo={ammo.map((item) => ({
              id: item.id,
              title: item.title,
              kind: item.kind,
            }))}
          />

          {/* [T-387b] 缺素材清单:采纳整稿的「分镜凝固 pass」把各段 visual.missing 汇总到这
              (弹药区下,离补料入口最近)。无缺项 → 不渲(零回归)。 */}
          <MissingMaterialsNote sections={script.sections} />

          {/* ── 脚本区(活跃) ── */}
          <section
            id="script"
            data-slot="draft-script-section"
            className="scroll-mt-20"
          >
            {/* [T-054 组B] 区头 = 编辑器唯一的用户视角标题(编辑器卡内不再叠「主脚本/
                实现描述」双头);副行合并版本提示,一句话说清「写-存-回滚」。 */}
            <div className="mb-1.5 flex flex-wrap items-center gap-2 px-0.5">
              <h2 className="text-[13.5px] font-semibold text-foreground">口播脚本</h2>
              <span className="text-xs text-text-subtle">
                {/* [Bug-8 T-021] imported 项目没跑逐字稿 → 提示去跑(而非「直接开写」误导)。 */}
                {script.versionCount > 0
                  ? `v${script.versionCount} · 写你的口播稿——保存即新版本,可回滚`
                  : project.imported
                    // 用户视角文案不暴露内部队列术语；未配云端 ASR 时仍走本地 Whisper。
                    ? "系统会从抖音逐步补齐逐字稿；未配置云端 ASR 时会使用本地 Whisper，处理可能较慢。着急的话也可让右侧编导先起草"
                    : "写你的口播稿——直接开写,或在右侧让编导起草"}
              </span>
              {scriptArtifactId && (script.versions?.length ?? 0) > 0 ? (
                <span className="ml-auto">
                  <ScriptVersionMenu
                    key={script.currentVersionId ?? "no-current-version"}
                    artifactId={scriptArtifactId}
                    currentVersionId={script.currentVersionId ?? null}
                    versions={script.versions ?? []}
                  />
                </span>
              ) : null}
            </div>
            {/* [T-070→T-072] 编辑|结构 双视图:结构 = **可编辑**分段卡(段型徽章内联,
                保存产新 ArtifactVersion);有分段时默认进结构编辑(用户目标形态)。 */}
            <ScriptStructureToggle
              sections={script.sections}
              artifactId={scriptArtifactId}
              projectId={project.id}
              currentVersionId={script.currentVersionId ?? null}
              assetLabels={Object.fromEntries(
                ammo
                  .filter((item) => item.kind === "asset")
                  .map((item) => [item.id, item.title]),
              )}
            >
              {/* 编辑器自身处理版本回流；不可按版本数重挂而丢失在途编辑。 */}
              <ScriptRichEditor
                initialHtml={initialHtml}
                artifactId={scriptArtifactId}
                projectId={project.id}
              />
            </ScriptStructureToggle>
            {/* [T-086 SPEC §3] 编导文案审核门(软门):审核按钮 + 结构化报告 + 命中列表。
                硬门切换点见 blind-predict-row / PublishPackSection 的软门提示注释。 */}
            <ContentDirectionActions projectId={project.id} projectTitle={project.title} />
            <ScriptReviewGate
              projectId={project.id}
              projectTitle={project.title}
              outputId={outputId}
              currentVersion={script.versionCount}
              initialReport={scriptReview}
            />
          </section>

          {/* ── 发布包区 ── */}
          <PublishPackSection
            publishPack={publishPack}
            projectCoverAssetId={projectCoverAssetId}
            unlocked={publishUnlocked}
            projectId={project.id}
            projectTitle={project.title}
            outputId={outputId}
            blindPrediction={blindPrediction}
            scriptReview={scriptReview}
            scriptVersion={script.versionCount}
          />
          {/* [T-146] 弹药抽屉已上移至 CreationFlowCtas 之后(论点/脚本之上)。 */}
          </>
        }
        right={
          /* 右栏:编导对话(T-055b)—— 全局 ChatBox 内嵌常驻,上下文 chip = 当前项目。 */
          <DraftChatRail
            projectId={project.id}
            projectTitle={project.title}
            outputId={outputId}
          />
        }
      />
      </DraftChatRequestProvider>
    </main>
  );
}

// ---------------------------------------------------------------------------
// 发布包区(SPEC §4.3:脚本有版本即解锁;无发布行 = 引导文案)
// ---------------------------------------------------------------------------

function PublishPackSection({
  publishPack,
  projectCoverAssetId,
  unlocked,
  projectId,
  projectTitle,
  outputId,
  blindPrediction,
  scriptReview,
  scriptVersion,
}: {
  publishPack: DraftWorkbenchVm["publishPack"];
  projectCoverAssetId: string | null;
  unlocked: boolean;
  projectId: string;
  projectTitle: string;
  outputId: string | null;
  blindPrediction: DraftWorkbenchVm["blindPrediction"];
  scriptReview: DraftWorkbenchVm["scriptReview"];
  scriptVersion: number;
}) {
  const outputPublished =
    publishPack?.outputPublished ?? publishPack?.status === "published";
  const publishedAt =
    publishPack?.latestPublishedAt ?? publishPack?.publishedAt ?? null;
  // [T-055h③] 登记入口:解锁后、还没有已发布行时展示(已发布的不重复登记 ——
  //   幂等虽兜底,但界面不做多余承诺)。
  const showRegister = unlocked && !outputPublished;
  return (
    <section
      id="publish"
      data-slot="draft-publish-pack"
      data-unlocked={unlocked}
      className={cn(
        "scroll-mt-20 rounded-card border bg-surface px-4 py-3",
        unlocked ? "border-border" : "border-dashed border-border opacity-70",
      )}
    >
      <div className="flex items-center gap-3">
        {/* [T-078] 有真封面(采集回填/手选)渲真图;无则保留「封面待生成」占位。 */}
        <CoverThumb
          assetId={projectCoverAssetId}
          alt={publishPack?.title || "作品封面"}
          className="h-10 w-16 shrink-0 rounded-md border border-border object-cover bg-surface-subtle"
          fallback={
            <div
              aria-hidden="true"
              className="flex h-10 w-16 shrink-0 items-center justify-center rounded-md border border-border bg-surface-subtle text-[10px] text-text-subtle"
            >
              {projectCoverAssetId ? "封面已选" : "封面待生成"}
            </div>
          }
        />
        <div className="min-w-0 flex-1">
          {/* [T-054 组B] 规范 §2:无发布行时不再摆「标题草稿:定稿后从脚本 HOOK 生成 /
              标签、平台在发布时选」这类机制注记,收敛为用户视角一句话。 */}
          <p className="truncate text-[13px] font-semibold text-foreground">
            {publishPack?.title || "发布时会从脚本钩子生成标题草稿、选封面与标签"}
          </p>
          {publishPack ? (
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {publishPack.tags.length > 0 ? (
                publishPack.tags.slice(0, 5).map((tag) => (
                  <span
                    key={tag}
                    className="rounded-md bg-surface-subtle px-2 py-0.5 text-[11px] text-text-subtle"
                  >
                    # {tag}
                  </span>
                ))
              ) : (
                <span className="text-[11px] text-text-subtle">暂无标签</span>
              )}
            </div>
          ) : null}
        </div>
        <div className="shrink-0 text-right">
          {publishPack ? (
            <span
              data-slot="publish-pack-status"
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-medium",
                outputPublished
                  ? "bg-success-soft text-success"
                  : "bg-surface-subtle text-muted-foreground",
              )}
            >
              {outputPublished
                ? `已发布${publishedAt ? ` · ${publishedAt.slice(0, 10)}` : ""}`
                : publishPack.status}
            </span>
          ) : unlocked ? (
            <span className="text-xs text-text-subtle">发布时创建发布行</span>
          ) : (
            <span className="text-xs text-text-subtle">🔒 脚本保存一版后解锁</span>
          )}
        </div>
      </div>
      {/* [T-350b/T-738] 无发布物料时生成；已有持久化物料时原位查看。
          发布中心只负责排期，不承担发布物料查看。 */}
      {unlocked ? (
        <PublishPackageCta
          projectId={projectId}
          projectTitle={projectTitle}
          outputId={outputId}
          publishPack={publishPack}
        />
      ) : null}
      {/* [T-086 软门] 发布前动作旁的合规软门提示(不阻断,一键跳审核门)。 */}
      {unlocked ? (
        <ReviewSoftGateHint
          report={scriptReview}
          currentVersion={scriptVersion}
          projectId={projectId}
        />
      ) : null}
      {/* [T-063e] 飞轮第一步:发布前先盲预测(解锁后常驻;已预测显预测分/锁定态)。 */}
      {unlocked ? (
        <BlindPredictRow
          projectId={projectId}
          projectTitle={projectTitle}
          outputId={outputId}
          prediction={blindPrediction}
        />
      ) : null}
      {/* [T-055h③] 站外发完 → 粘链接登记为已发布(落 publication + 触发采集)。 */}
      {showRegister ? (
        <RegisterPublishedForm
          projectId={projectId}
          projectTitle={projectTitle}
          outputId={outputId}
          scriptReview={scriptReview}
          scriptVersion={scriptVersion}
        />
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// [T-387b] 缺素材清单(凝固分镜的 missing 汇总;Server Component 纯读)
// ---------------------------------------------------------------------------

// 从当前脚本各段凝固 visual 汇总缺素材(去重)。导出供单测。
export function collectMissingMaterials(
  sections: ReadonlyArray<{
    readonly visual?: { readonly missing: ReadonlyArray<string> } | null;
  }>,
): string[] {
  const out: string[] = [];
  for (const s of sections) {
    for (const m of s.visual?.missing ?? []) {
      const t = m.trim();
      if (t) out.push(t);
    }
  }
  return Array.from(new Set(out));
}

function MissingMaterialsNote({
  sections,
}: {
  sections: ReadonlyArray<{
    readonly visual?: { readonly missing: ReadonlyArray<string> } | null;
  }>;
}) {
  const missing = collectMissingMaterials(sections);
  if (missing.length === 0) return null;
  return (
    <section
      data-slot="draft-missing-materials"
      aria-label="缺素材清单"
      className="rounded-card border border-amber-300/60 bg-amber-50/60 px-4 py-3 dark:border-amber-400/30 dark:bg-amber-400/10"
    >
      <p className="text-[13px] font-semibold text-amber-800 dark:text-amber-300">
        缺素材清单({missing.length} 项)
      </p>
      <ul className="mt-1 flex flex-col gap-0.5">
        {missing.map((m) => (
          <li key={m} className="text-xs leading-relaxed text-amber-700 dark:text-amber-400">
            · {m}
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-[11px] text-amber-700/80 dark:text-amber-400/80">
        这些是脚本画面已经点名、但项目里还没有的素材。可以用上方「联网找资料」或「上传 / 管理素材」补齐。
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 创作素材(读侧;底层仍复用既有 material_links 单一数据源)
// ---------------------------------------------------------------------------

function AmmoDrawer({
  ammo,
  projectId,
}: {
  ammo: DraftWorkbenchVm["ammo"];
  projectId: string;
}) {
  return (
    <section
      data-slot="draft-ammo-drawer"
      aria-label="创作素材"
      className="rounded-xl border border-border/70 bg-surface p-3"
    >
      <div className="mb-2 flex flex-wrap items-start gap-x-2 gap-y-1">
        <div className="min-w-0 flex-1">
          <h2 className="text-[13.5px] font-semibold text-foreground">创作素材</h2>
          <p className="mt-0.5 text-xs leading-5 text-text-subtle">
            联网找到的资料、你上传的文件和制作中产生的截图、录屏，都统一保存在这里，整个创作周期都能继续使用。
          </p>
        </div>
        {/* [T-055g SPEC §8.1] 知识库可写:稿面就地记一条,存入即挂本项目。 */}
        <AmmoNoteForm projectId={projectId} />
        {ammo.length > 0 ? (
          <span className="rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground">
            已保存 {ammo.length} 件
          </span>
        ) : null}
      </div>
      {/* [T-057②] 弹药区主交互 = 拖放倾倒场:截图/录屏丢进来 → 原名落盘项目文件夹 +
          自动归类 + 挂本项目;「记一条」降级为头部次入口。 */}
      <div className="mb-2">
        <AmmoDumpZone projectId={projectId} />
      </div>
      {/* [T-146] 已上传素材/知识列表 + 双击预览(client 组件);空态时不渲染。 */}
      {ammo.length > 0 ? <AmmoCardList ammo={ammo} /> : null}
    </section>
  );
}
