"use client";

/**
 * BriefWorkbench — 立项工作台(立项 Brief 地基 / PRD §7)。
 *
 * 当项目 current_stage === "brief" 时,项目页渲染本工作台替代标准总览栅格。创作者在这里
 * 把结构化 Brief(目标受众 / 内容目标 / 内容形式 / 目标平台 / 核心信息 / 成功标准等)填齐,
 * 保存走真实 `client.patchProject`(title + briefDetail 整体落库),再 `router.refresh()`
 * 让 server tree 用刷新后的 DTO 重渲。核心必填齐后「进入下一步」才放行 —— 调
 * `client.transitionProjectStage(brief)`,后端 brief gate 校验,过则推进到 research。
 *
 * 零假按钮:gap 报告点名的 3 个 AI runner(帮我补全受众 / 校验内容目标 / 推荐成功指标)
 * 本步不做,所以这 3 个按钮一律不放(等下一步做 runner 再加),不放切了没反应的占位。
 *
 * island -> client.* -> 真 SQL -> router.refresh() —— 与 ProjectOverviewActions 同构。
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Loader2 } from "lucide-react";

import { SectionCard } from "@/components/project/section-card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { client } from "@/lib/contract-client";
import { cn } from "@/lib/utils";
import type { ProjectOverviewViewModel } from "@/types/view-models";

// 目标平台候选(domain PlatformId)+ 中文标签。多选 chip。
const PLATFORM_OPTIONS: ReadonlyArray<{ id: string; label: string }> = [
  { id: "douyin", label: "抖音" },
  { id: "bilibili", label: "B 站" },
  { id: "xiaohongshu", label: "小红书" },
  { id: "wechatVideo", label: "视频号" },
  { id: "youtube", label: "YouTube" },
  { id: "x", label: "X" },
];

type BriefDetail = NonNullable<ProjectOverviewViewModel["briefDetail"]>;

export interface BriefWorkbenchProps {
  readonly projectId: string;
  readonly projectTitle: string;
  readonly briefDetail?: BriefDetail;
}

interface FormState {
  title: string;
  targetAudience: string;
  contentGoal: string;
  contentFormat: string;
  targetPlatforms: string[];
  durationEstimate: string;
  coreMessage: string;
  successCriteria: string;
}

function initialState(
  projectTitle: string,
  brief?: BriefDetail,
): FormState {
  return {
    title: projectTitle,
    targetAudience: brief?.targetAudience ?? "",
    contentGoal: brief?.contentGoal ?? "",
    contentFormat: brief?.contentFormat ?? "",
    targetPlatforms: [...(brief?.targetPlatforms ?? [])],
    durationEstimate: brief?.durationEstimate ?? "",
    coreMessage: brief?.coreMessage ?? "",
    successCriteria: brief?.successCriteria ?? "",
  };
}

// 核心必填项(与后端 brief gate 对齐):项目名 / 目标受众 / 内容目标 / 内容形式 /
// 目标平台≥1 / 核心信息。任一缺失则「进入下一步」拦住,并把缺失项高亮提示。
const REQUIRED: ReadonlyArray<{ key: keyof FormState; label: string }> = [
  { key: "title", label: "项目名称" },
  { key: "targetAudience", label: "目标受众" },
  { key: "contentGoal", label: "内容目标" },
  { key: "contentFormat", label: "内容形式" },
  { key: "targetPlatforms", label: "目标平台" },
  { key: "coreMessage", label: "核心信息" },
];

function missingFields(form: FormState): string[] {
  return REQUIRED.filter((f) => {
    const v = form[f.key];
    if (Array.isArray(v)) return v.length === 0;
    return typeof v !== "string" || v.trim() === "";
  }).map((f) => f.label);
}

export function BriefWorkbench({
  projectId,
  projectTitle,
  briefDetail,
}: BriefWorkbenchProps) {
  const router = useRouter();
  const [form, setForm] = React.useState<FormState>(() =>
    initialState(projectTitle, briefDetail),
  );
  // 服务端确认过的最近一次落库快照,用于判断「有未保存改动」。
  const [savedSnapshot, setSavedSnapshot] = React.useState<FormState>(form);
  const [saving, setSaving] = React.useState(false);
  const [advancing, setAdvancing] = React.useState(false);
  const [justSaved, setJustSaved] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const missing = missingFields(form);
  const ready = missing.length === 0;
  const dirty = React.useMemo(
    () => JSON.stringify(form) !== JSON.stringify(savedSnapshot),
    [form, savedSnapshot],
  );

  const set = React.useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      setJustSaved(false);
    },
    [],
  );

  const togglePlatform = React.useCallback((id: string) => {
    setForm((prev) => ({
      ...prev,
      targetPlatforms: prev.targetPlatforms.includes(id)
        ? prev.targetPlatforms.filter((p) => p !== id)
        : [...prev.targetPlatforms, id],
    }));
    setJustSaved(false);
  }, []);

  // 保存:title + briefDetail 整体替换落库(真 patchProject)。
  const onSave = React.useCallback(async (): Promise<boolean> => {
    if (saving || advancing) return false;
    setSaving(true);
    setError(null);
    try {
      await client.patchProject({
        params: { projectId },
        query: undefined,
        body: {
          title: form.title.trim(),
          briefDetail: {
            targetAudience: form.targetAudience.trim() || undefined,
            contentGoal: form.contentGoal.trim() || undefined,
            contentFormat: form.contentFormat.trim() || undefined,
            targetPlatforms: form.targetPlatforms,
            durationEstimate: form.durationEstimate.trim() || undefined,
            coreMessage: form.coreMessage.trim() || undefined,
            successCriteria: form.successCriteria.trim() || undefined,
          },
        },
      });
      setSavedSnapshot(form);
      setJustSaved(true);
      router.refresh();
      return true;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "保存失败,请稍后重试。",
      );
      return false;
    } finally {
      setSaving(false);
    }
  }, [advancing, form, projectId, router, saving]);

  // 进入下一步:先保存(若有改动),再 transition brief→research。后端 brief gate 复校,
  // 缺必填会抛 ConflictError(理论上前端已拦,这里把后端报错如实显示,不吞)。
  const onAdvance = React.useCallback(async () => {
    if (advancing || saving || !ready) return;
    setAdvancing(true);
    setError(null);
    try {
      if (dirty) {
        const ok = await onSave();
        if (!ok) return;
      }
      await client.transitionProjectStage({
        params: { projectId, stage: "brief" },
        query: undefined,
        body: {},
      });
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "进入下一步失败:请确认核心信息已填齐。",
      );
    } finally {
      setAdvancing(false);
    }
  }, [advancing, dirty, onSave, projectId, ready, router, saving]);

  return (
    <main
      data-app="creatoros"
      data-page="project-overview"
      data-stage="brief"
      data-project-id={projectId}
      className="flex flex-col gap-section-gap"
    >
      {/* 顶部:标题 + 立项进度提示 + 进入下一步(固定,不随内容滚) */}
      <header
        data-slot="brief-workbench-header"
        className="flex flex-wrap items-start justify-between gap-3"
      >
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="truncate font-heading text-[17px] font-semibold text-foreground">
            立项工作台
          </h1>
          <p className="text-[12px] text-muted-foreground">
            填齐这条内容的立项 Brief —— 想清楚「给谁看、达成什么、用什么形式」,再进入选题调研。
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <Button
            type="button"
            size="sm"
            disabled={!ready || advancing || saving}
            onClick={onAdvance}
            data-testid="brief-advance"
          >
            {advancing ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <ArrowRight aria-hidden="true" className="size-4" />
            )}
            进入选题调研
          </Button>
          {!ready ? (
            <span className="text-[11px] text-warning">
              {`还需补全:${missing.join(" / ")}`}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] text-success">
              <Check aria-hidden="true" className="size-3" />
              核心信息已齐,可进入下一步
            </span>
          )}
        </div>
      </header>

      {/* 多模块表单栅格(本路由走整页滚动 page-scroll,工作台不另起内框滚,避免双滚动条) */}
      <div data-slot="brief-workbench-body">
        <div className="grid grid-cols-1 gap-card-gap lg:grid-cols-2">
          {/* 模块 1:项目基础信息 */}
          <SectionCard
            title="项目基础信息"
            description="项目名称与一句话核心主张"
            className="lg:col-span-2"
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="项目名称" required missing={missing.includes("项目名称")}>
                <Input
                  value={form.title}
                  onChange={(e) => set("title", e.target.value)}
                  placeholder="例如:三步找到你的内容定位"
                  data-testid="brief-title"
                />
              </Field>
              <Field
                label="核心信息"
                required
                missing={missing.includes("核心信息")}
                hint="一句话讲清楚这条内容的主张"
              >
                <Input
                  value={form.coreMessage}
                  onChange={(e) => set("coreMessage", e.target.value)}
                  placeholder="例如:定位不是选赛道,是选你能持续赢的那场仗"
                  data-testid="brief-core-message"
                />
              </Field>
            </div>
          </SectionCard>

          {/* 模块 2:目标受众 */}
          <SectionCard
            title="目标受众"
            description="这条内容是做给谁看的"
          >
            <Field
              label="目标受众"
              required
              missing={missing.includes("目标受众")}
              hint="越具体越好:身份 + 处境 + 痛点"
            >
              <Textarea
                value={form.targetAudience}
                onChange={(e) => set("targetAudience", e.target.value)}
                placeholder="例如:工作 3-5 年、想转型做个人 IP 但不知从何下手的职场人"
                rows={4}
                data-testid="brief-audience"
              />
            </Field>
          </SectionCard>

          {/* 模块 3:内容目标 */}
          <SectionCard
            title="内容目标"
            description="这条内容要为账号达成什么"
          >
            <Field
              label="内容目标"
              required
              missing={missing.includes("内容目标")}
              hint="引流 / 建立信任 / 转化,挑一个主目标"
            >
              <Textarea
                value={form.contentGoal}
                onChange={(e) => set("contentGoal", e.target.value)}
                placeholder="例如:建立专业信任,引导观众进入私域咨询定位服务"
                rows={4}
                data-testid="brief-goal"
              />
            </Field>
          </SectionCard>

          {/* 模块 4:内容形式与平台 */}
          <SectionCard
            title="内容形式与平台"
            description="用什么形式、发到哪些平台"
            className="lg:col-span-2"
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Field
                label="内容形式"
                required
                missing={missing.includes("内容形式")}
              >
                <Input
                  value={form.contentFormat}
                  onChange={(e) => set("contentFormat", e.target.value)}
                  placeholder="例如:口播 / 短剧 / 图文"
                  data-testid="brief-format"
                />
              </Field>
              <Field label="预估时长" hint="可留空">
                <Input
                  value={form.durationEstimate}
                  onChange={(e) => set("durationEstimate", e.target.value)}
                  placeholder="例如:60-90 秒"
                  data-testid="brief-duration"
                />
              </Field>
              <Field
                label="目标平台"
                required
                missing={missing.includes("目标平台")}
                hint="至少选 1 个"
              >
                <div
                  data-slot="brief-platforms"
                  className="flex flex-wrap gap-1.5"
                >
                  {PLATFORM_OPTIONS.map((opt) => {
                    const active = form.targetPlatforms.includes(opt.id);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        data-testid={`brief-platform-${opt.id}`}
                        aria-pressed={active}
                        onClick={() => togglePlatform(opt.id)}
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-xs transition-colors",
                          active
                            ? "border-brand/40 bg-brand-soft font-medium text-brand"
                            : "border-border bg-surface text-muted-foreground hover:bg-muted",
                        )}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </Field>
            </div>
          </SectionCard>

          {/* 模块 5:成功标准 + 关联(关联为只读说明,选题立项时自动带来源) */}
          <SectionCard
            title="成功标准"
            description="发出去后,怎么算这条内容成功"
          >
            <Field
              label="成功标准"
              hint="可量化更好:播放 / 互动 / 私信 / 转化"
            >
              <Textarea
                value={form.successCriteria}
                onChange={(e) => set("successCriteria", e.target.value)}
                placeholder="例如:完播率 ≥ 35%,带来 ≥ 10 条定位咨询私信"
                rows={4}
                data-testid="brief-success"
              />
            </Field>
          </SectionCard>

          <SectionCard
            title="关联信息"
            description="立项来源与后续阶段"
          >
            <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-border-strong" />
                <span>
                  来源记录在项目简介里;选题立项的项目会自动带入候选的受众与主张。
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-border-strong" />
                <span>
                  填齐核心信息并「进入选题调研」后,进入 research 阶段开始搜集素材与对标。
                </span>
              </li>
            </ul>
          </SectionCard>
        </div>
      </div>

      {/* 底部:保存条(固定) */}
      <footer
        data-slot="brief-workbench-footer"
        className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3"
      >
        <div className="min-w-0 text-[12px]">
          {error ? (
            <span className="text-destructive">{error}</span>
          ) : justSaved && !dirty ? (
            <span className="inline-flex items-center gap-1 text-success">
              <Check aria-hidden="true" className="size-3.5" />
              已保存
            </span>
          ) : dirty ? (
            <span className="text-muted-foreground">有未保存的改动</span>
          ) : (
            <span className="text-muted-foreground">Brief 已保存</span>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={saving || advancing || !dirty}
          onClick={() => void onSave()}
          data-testid="brief-save"
        >
          {saving ? (
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          ) : null}
          保存 Brief
        </Button>
      </footer>
    </main>
  );
}

// 单个字段的标签 + 必填星标 + 缺失高亮 + 辅助说明的薄封装。
function Field({
  label,
  required,
  missing,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  missing?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div data-slot="brief-field" className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <span className="text-[13px] font-medium text-foreground">{label}</span>
        {required ? (
          <span
            className={cn(
              "text-[11px]",
              missing ? "text-warning" : "text-muted-foreground",
            )}
            aria-hidden="true"
          >
            必填
          </span>
        ) : null}
      </div>
      {children}
      {hint ? (
        <span className="text-[11px] text-muted-foreground">{hint}</span>
      ) : null}
    </div>
  );
}

export default BriefWorkbench;
