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
import Link from "next/link";

import { ScriptRichEditor } from "@/features/script/script-rich-editor";
import { ScriptStructureToggle } from "@/features/script/script-structure-view";
import { sectionsToHtml } from "@/features/script/script-editor-bridge";
import { TopicCard } from "./topic-card";
import { DraftChatRail } from "./draft-chat-rail";
import { RevealProjectButton } from "./reveal-project-button";
import { AmmoNoteForm } from "./ammo-note-form";
import { AmmoDumpZone } from "./ammo-dump-zone";
import { DraftPrimaryAction } from "./draft-primary-action";
import { RegisterPublishedForm } from "./register-published-form";
import { BlindPredictRow } from "./blind-predict-row";
import type { DraftWorkbenchVm } from "./draft-workbench-data";
import { cn } from "@/lib/utils";

export function DraftWorkbenchPage({ vm }: { vm: DraftWorkbenchVm }) {
  const { project, script, scriptArtifactId, outputId, publishPack, publishUnlocked, blindPrediction, ammo } = vm;
  const initialHtml = script.editorHtml ?? sectionsToHtml(script.sections);

  return (
    <main
      data-app="creatoros"
      data-page="draft-workbench"
      data-project-id={project.id}
      className="flex h-full min-h-0 flex-col"
    >
      {/* ── 顶条(T-075 收窄:标题与阶段条由 shell project-workspace header 统一提供;
          [T-076] 阶段条两段化「脚本|复盘」,主行动按发布态收敛)。 ── */}
      <header
        data-slot="draft-topbar"
        className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-surface px-5 py-2"
      >
        <div className="ml-auto flex shrink-0 items-center gap-2.5">
          <RevealProjectButton projectId={project.id} />
          {project.imported ? (
            <span
              data-slot="draft-imported-badge"
              className="rounded-full border border-border bg-surface-subtle px-2.5 py-1 text-[11px] text-muted-foreground"
            >
              真实导入作品
            </span>
          ) : null}
          {/* [T-076 gate-F1] 未发布 → null(顶条只剩 Finder);已发布 → 「看复盘 →」。 */}
          <DraftPrimaryAction
            projectId={project.id}
            published={publishPack?.status === "published"}
          />
        </div>
      </header>

      {/* ── 主体:左稿面 + 右对话位 ── */}
      <div className="flex min-h-0 flex-1">
        <div
          data-slot="draft-pane"
          className="relative flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto px-6 py-4"
        >
          {/* 成熟度轨(装饰,随区块态着色由各区块节点体现) */}
          <TopicCard
            projectId={project.id}
            title={project.title}
            brief={project.brief}
            briefDetail={project.briefDetail}
          />

          {/* ── 脚本区(活跃) ── */}
          <section
            id="script"
            data-slot="draft-script-section"
            className="scroll-mt-20"
          >
            {/* [T-054 组B] 区头 = 编辑器唯一的用户视角标题(编辑器卡内不再叠「主脚本/
                实现描述」双头);副行合并版本提示,一句话说清「写-存-回滚」。 */}
            <div className="mb-1.5 flex items-baseline gap-2 px-0.5">
              <h2 className="text-[13.5px] font-semibold text-foreground">口播脚本</h2>
              <span className="text-xs text-text-subtle">
                {script.versionCount > 0
                  ? `v${script.versionCount} · 写你的口播稿——保存即新版本,可回滚`
                  : "写你的口播稿——直接开写,或在右侧让编导起草"}
              </span>
            </div>
            {/* [T-070] 编辑|结构 双视图:结构 = 只读分段卡(contentData.sections)。 */}
            <ScriptStructureToggle sections={script.sections}>
              {/* [T-055c] key=版本数:对话「写入稿面/撤销」refresh 后强制重挂,编辑器吃到新版本。 */}
              <ScriptRichEditor
                key={`v${script.versionCount}`}
                initialHtml={initialHtml}
                artifactId={scriptArtifactId}
                projectId={project.id}
              />
            </ScriptStructureToggle>
          </section>

          {/* ── 发布包区 ── */}
          <PublishPackSection
            publishPack={publishPack}
            unlocked={publishUnlocked}
            projectId={project.id}
            projectTitle={project.title}
            outputId={outputId}
            blindPrediction={blindPrediction}
          />

          {/* ── 弹药抽屉 ── */}
          <AmmoDrawer ammo={ammo} projectId={project.id} />
        </div>

        {/* 右栏:编导对话(T-055b)—— 全局 ChatBox 内嵌常驻,上下文 chip = 当前项目。 */}
        <aside
          data-slot="draft-chat-rail"
          className="hidden w-[380px] shrink-0 flex-col border-l border-border bg-surface xl:flex"
        >
          <DraftChatRail projectId={project.id} projectTitle={project.title} />
        </aside>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// 发布包区(SPEC §4.3:脚本有版本即解锁;无发布行 = 引导文案)
// ---------------------------------------------------------------------------

function PublishPackSection({
  publishPack,
  unlocked,
  projectId,
  projectTitle,
  outputId,
  blindPrediction,
}: {
  publishPack: DraftWorkbenchVm["publishPack"];
  unlocked: boolean;
  projectId: string;
  projectTitle: string;
  outputId: string | null;
  blindPrediction: DraftWorkbenchVm["blindPrediction"];
}) {
  // [T-055h③] 登记入口:解锁后、还没有已发布行时展示(已发布的不重复登记 ——
  //   幂等虽兜底,但界面不做多余承诺)。
  const showRegister = unlocked && publishPack?.status !== "published";
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
        <div
          aria-hidden="true"
          className="flex h-10 w-16 shrink-0 items-center justify-center rounded-md border border-border bg-surface-subtle text-[10px] text-text-subtle"
        >
          {publishPack?.hasCover ? "封面已选" : "封面待生成"}
        </div>
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
                publishPack.status === "published"
                  ? "bg-success-soft text-success"
                  : "bg-surface-subtle text-muted-foreground",
              )}
            >
              {publishPack.status === "published"
                ? `已发布${publishPack.publishedAt ? ` · ${publishPack.publishedAt.slice(0, 10)}` : ""}`
                : publishPack.status}
            </span>
          ) : unlocked ? (
            <span className="text-xs text-text-subtle">发布时创建发布行</span>
          ) : (
            <span className="text-xs text-text-subtle">🔒 脚本保存一版后解锁</span>
          )}
        </div>
      </div>
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
        />
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// 弹药抽屉(读侧;来源链完整版在 T-055g)
// ---------------------------------------------------------------------------

function AmmoDrawer({
  ammo,
  projectId,
}: {
  ammo: DraftWorkbenchVm["ammo"];
  projectId: string;
}) {
  return (
    <section data-slot="draft-ammo-drawer" className="pb-2">
      <div className="mb-1.5 flex items-baseline gap-2 px-0.5">
        <h2 className="text-[13.5px] font-semibold text-foreground">这条内容的弹药</h2>
        {/* [T-055g SPEC §8.1] 知识库可写:稿面就地记一条,存入即挂本项目。 */}
        <AmmoNoteForm projectId={projectId} />
        <span className="text-xs text-text-subtle">
          {ammo.length > 0
            ? `知识与素材 ${ammo.length} 件 · 来自研究与制作`
            : "研究搜到的资料、制作倒入的素材会出现在这里"}
        </span>
      </div>
      {/* [T-057②] 弹药区主交互 = 拖放倾倒场:截图/录屏丢进来 → 原名落盘项目文件夹 +
          自动归类 + 挂本项目;「记一条」降级为头部次入口。 */}
      <div className="mb-2">
        <AmmoDumpZone projectId={projectId} />
      </div>
      {ammo.length > 0 ? (
        <div className="flex gap-2.5 overflow-x-auto pb-1">
          {ammo.map((item) => (
            <div
              key={`${item.kind}-${item.id}`}
              data-slot="draft-ammo-card"
              data-kind={item.kind}
              className="w-[220px] shrink-0 rounded-[10px] border border-border bg-surface px-3 py-2.5"
            >
              {/* [T-058④] 图片素材直接给缩略图预览;非图片退回类型徽标。 */}
              {item.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.previewUrl}
                  alt={item.title}
                  data-slot="ammo-preview"
                  className="mb-1.5 h-20 w-full rounded-md border border-border object-cover"
                />
              ) : null}
              <p
                className={cn(
                  "mb-1 text-[10.5px] font-bold tracking-wide",
                  item.kind === "knowledge" ? "text-warning" : "text-info",
                )}
              >
                {item.kind === "knowledge" ? "知识" : "素材"}
              </p>
              <p className="line-clamp-2 text-xs leading-relaxed text-foreground">
                {item.title}
              </p>
              <p className="mt-1.5 truncate text-[11px] text-text-subtle">
                ↳ {item.sourceLabel}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
