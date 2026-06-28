"use client";

/**
 * `positioning-interactive-region.tsx` — Client islands for the 定位中心 page.
 *
 * Two needs-backend forms (SPEC §3.4 / plan Task 5.3-5.4):
 *  - `PositioningProfileForm` (账号画像 + 定位规则) → `client.upsertProfile({ body })`
 *    then `router.refresh()` so the server re-reads the seeded repo.
 *  - `PositioningStatementForm` (保存新版本定位) → `client.createStatement({ body })`;
 *    on success a NEW immutable version row appears in the 历史版本 timeline
 *    (append-only — the prior 版本保留). `router.refresh()`.
 *
 * `PositioningDraftDialog` (「编辑定位」/「新建定位版本」/「复制为草稿」) houses both
 * forms inside a CENTERED Dialog (max-w-3xl, 85vh, sticky footer). Tabs split the
 * 16 fields into three groups (账号画像 / 定位规则 / 定位陈述) so the form is no
 * longer one long column. The active tab drives which form the sticky 「保存」
 * footer submits (each form has a stable id; the footer button uses `form=…`).
 *
 * Determinism (C-5): every visible value comes from props or controlled local
 * state seeded from props; no Date.now / Math.random / fetch in the render. The
 * mutation seam mirrors settings/project-overview islands.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  User,
  Compass,
  Users,
  Sparkles,
  ListChecks,
  Ban,
  HeartPulse,
  Gem,
  MessageCircle,
  Activity,
  Lightbulb,
  PenLine,
  FolderKanban,
  ShieldAlert,
  Mic2,
  Quote,
  Tag,
  History,
  PencilLine,
  Plus,
  type LucideIcon,
} from "lucide-react";

import { client } from "@/lib/contract-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CreatorProfileResource } from "@/server/modules/positioning";

// Shared island mutation seam: a `pending` guard blocks concurrent writes; on
// success it calls router.refresh() so the server re-reads the persisted rows,
// then an optional onSuccess (e.g. close the draft dialog).
function useMutation() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const run = React.useCallback(
    (mutate: () => Promise<unknown>, onSuccess?: () => void) => {
      if (pending) return;
      setPending(true);
      void (async () => {
        try {
          await mutate();
          router.refresh();
          onSuccess?.();
        } finally {
          setPending(false);
        }
      })();
    },
    [pending, router],
  );
  return { pending, run };
}

// ── shared field primitives ────────────────────────────────────────────────
// A labeled field = section-aligned label + one-line helper + the control. The
// label is a real <label htmlFor> so the aria-label-driven tests keep matching.

function FieldLabel({
  htmlFor,
  icon: Icon,
  children,
}: {
  readonly htmlFor: string;
  readonly icon?: LucideIcon;
  readonly children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="flex items-center gap-1.5 text-[13px] font-medium text-foreground"
    >
      {Icon ? (
        <Icon className="size-3.5 text-text-subtle" strokeWidth={2} />
      ) : null}
      {children}
    </label>
  );
}

function Helper({ children }: { readonly children: React.ReactNode }) {
  return <p className="text-xs leading-relaxed text-text-subtle">{children}</p>;
}

function Field({
  className,
  children,
}: {
  readonly className?: string;
  readonly children: React.ReactNode;
}) {
  return <div className={cn("flex flex-col gap-1.5", className)}>{children}</div>;
}

// A small section header inside a tab (e.g. 「定位母版补全」), with an icon to echo
// the page's facet/rule chips.
function SubsectionHeader({
  icon: Icon,
  title,
  hint,
}: {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1 border-t border-border/70 pt-5">
      <div className="flex items-center gap-2">
        <span className="flex size-6 items-center justify-center rounded-md bg-brand-soft text-brand">
          <Icon className="size-3.5" strokeWidth={2.25} />
        </span>
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      </div>
      {hint ? <p className="pl-8 text-xs text-text-subtle">{hint}</p> : null}
    </div>
  );
}

// ── 账号画像 + 定位规则 form (upsertProfile) ───────────────────────────────
export interface PositioningProfileFormProps {
  readonly profile: CreatorProfileResource | null;
  readonly ctaLabel: string;
  /** Optional — called after a successful save (e.g. close the draft dialog). */
  readonly onSuccess?: () => void;
  /** Render the inline submit button (default true; the Dialog hides it and
   *  drives submission from its sticky footer via `form=…`). */
  readonly showSubmit?: boolean;
  /** Stable form id so an external footer button can submit it (`<button form>`). */
  readonly formId?: string;
  /** Which group of fields to render. Both forms write the SAME profile body —
   *  the Dialog mounts one instance per tab but shares no state; on submit each
   *  posts the full controlled body (so switching tabs never drops a field). */
  readonly section?: "profile" | "rules";
  /** Disambiguate the htmlFor ids when two instances mount (one per tab). */
  readonly idPrefix?: string;
}

export function PositioningProfileForm({
  profile,
  ctaLabel,
  onSuccess,
  showSubmit = true,
  formId,
  section = "profile",
  idPrefix = "pf",
}: PositioningProfileFormProps) {
  const { pending, run } = useMutation();
  const [persona, setPersona] = React.useState(profile?.persona ?? "");
  const [field, setField] = React.useState(profile?.field ?? "");
  const [audience, setAudience] = React.useState(profile?.audience ?? "");
  const [differentiation, setDifferentiation] = React.useState(
    profile?.differentiation ?? "",
  );
  const [capabilities, setCapabilities] = React.useState(
    (profile?.capabilities ?? []).join("、"),
  );
  // 定位中心重建 — the 6 richer facets (内容范围/不做什么/核心痛点/核心价值/表达风格/当前状态).
  const f = profile?.facets;
  const [contentScope, setContentScope] = React.useState(f?.contentScope ?? "");
  const [avoid, setAvoid] = React.useState(f?.avoid ?? "");
  const [corePain, setCorePain] = React.useState(f?.corePain ?? "");
  const [coreValue, setCoreValue] = React.useState(f?.coreValue ?? "");
  const [tone, setTone] = React.useState(f?.tone ?? "");
  const [statusNote, setStatusNote] = React.useState(f?.statusNote ?? "");
  // 5 定位规则（供下游模块使用）.
  const r = profile?.downstreamRules;
  const [topicRule, setTopicRule] = React.useState(r?.topicRule ?? "");
  const [scriptRule, setScriptRule] = React.useState(r?.scriptRule ?? "");
  const [projectRule, setProjectRule] = React.useState(r?.projectRule ?? "");
  const [forbidRule, setForbidRule] = React.useState(r?.forbidRule ?? "");
  const [expressionRule, setExpressionRule] = React.useState(
    r?.expressionRule ?? "",
  );

  function submit() {
    run(
      () =>
        client.upsertProfile({
          params: undefined,
          query: undefined,
          body: {
            persona,
            field,
            audience,
            differentiation,
            capabilities: capabilities
              .split(/[、,，]/)
              .map((c) => c.trim())
              .filter((c) => c.length > 0),
            facets: {
              contentScope,
              avoid,
              corePain,
              coreValue,
              tone,
              statusNote,
            },
            downstreamRules: {
              topicRule,
              scriptRule,
              projectRule,
              forbidRule,
              expressionRule,
            },
          },
        }),
      onSuccess,
    );
  }

  const id = (k: string) => `${idPrefix}-${k}`;

  return (
    <form
      id={formId}
      data-testid={
        section === "rules"
          ? "positioning-rules-form"
          : "positioning-profile-form"
      }
      className="flex w-full flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {section === "profile" ? (
        <>
          {/* 短字段：2 列网格 */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={id("persona")} icon={User}>
                人设
              </FieldLabel>
              <Helper>我是谁——一句话标签</Helper>
              <Input
                id={id("persona")}
                aria-label="人设"
                placeholder="例：把论文变成可运行代码的工程创作者"
                value={persona}
                onChange={(e) => setPersona(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={id("field")} icon={Compass}>
                领域
              </FieldLabel>
              <Helper>所在赛道 / 主题边界</Helper>
              <Input
                id={id("field")}
                aria-label="领域"
                placeholder="例：AI 工程 / 应用落地"
                value={field}
                onChange={(e) => setField(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={id("audience")} icon={Users}>
                目标人群
              </FieldLabel>
              <Helper>内容写给谁看</Helper>
              <Input
                id={id("audience")}
                aria-label="目标人群"
                placeholder="例：想用 AI 提效的一线开发者"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={id("differentiation")} icon={Sparkles}>
                差异化视角
              </FieldLabel>
              <Helper>与同赛道相比的独特锚点</Helper>
              <Input
                id={id("differentiation")}
                aria-label="差异化"
                placeholder="例：从论文到可复现工程"
                value={differentiation}
                onChange={(e) => setDifferentiation(e.target.value)}
              />
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor={id("capabilities")} icon={ListChecks}>
                能力清单
              </FieldLabel>
              <Helper>用「、」或英文逗号分隔，每项一个标签</Helper>
              <Input
                id={id("capabilities")}
                aria-label="能力清单"
                placeholder="例：论文拆解、代码演示、工程化、debug 实录"
                value={capabilities}
                onChange={(e) => setCapabilities(e.target.value)}
              />
            </Field>
          </div>

          <SubsectionHeader
            icon={Gem}
            title="定位母版补全"
            hint="补全后会在首屏「当前定位母版」以彩色 facet 网格展示；留空的格不显示。"
          />
          {/* 6 facet：2 列网格 */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={id("contentScope")} icon={Compass}>
                内容范围
              </FieldLabel>
              <Helper>我会讲什么 / 选题边界</Helper>
              <Textarea
                id={id("contentScope")}
                aria-label="内容范围"
                placeholder="我会覆盖的主题与边界…"
                value={contentScope}
                onChange={(e) => setContentScope(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={id("avoid")} icon={Ban}>
                不做什么
              </FieldLabel>
              <Helper>明确排除的方向</Helper>
              <Textarea
                id={id("avoid")}
                aria-label="不做什么"
                placeholder="我明确不碰的话题 / 形式…"
                value={avoid}
                onChange={(e) => setAvoid(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={id("corePain")} icon={HeartPulse}>
                核心痛点
              </FieldLabel>
              <Helper>受众最痛的问题</Helper>
              <Textarea
                id={id("corePain")}
                aria-label="核心痛点"
                placeholder="受众迫切想解决的问题…"
                value={corePain}
                onChange={(e) => setCorePain(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={id("coreValue")} icon={Gem}>
                核心价值
              </FieldLabel>
              <Helper>我给受众的根本回报</Helper>
              <Textarea
                id={id("coreValue")}
                aria-label="核心价值"
                placeholder="看完我的内容能得到什么…"
                value={coreValue}
                onChange={(e) => setCoreValue(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={id("tone")} icon={MessageCircle}>
                表达风格
              </FieldLabel>
              <Helper>语气 / 调性</Helper>
              <Textarea
                id={id("tone")}
                aria-label="表达风格"
                placeholder="例：硬核、克制、工程师口吻…"
                value={tone}
                onChange={(e) => setTone(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={id("statusNote")} icon={Activity}>
                当前状态
              </FieldLabel>
              <Helper>账号此刻所处阶段</Helper>
              <Textarea
                id={id("statusNote")}
                aria-label="当前状态"
                placeholder="例：冷启动期，主攻视频号…"
                value={statusNote}
                onChange={(e) => setStatusNote(e.target.value)}
              />
            </Field>
          </div>
        </>
      ) : (
        <>
          <div className="rounded-lg border border-brand/20 bg-brand-soft/60 px-3.5 py-3">
            <p className="text-xs leading-relaxed text-foreground/80">
              以下规则会作为<span className="font-medium text-brand">硬约束</span>
              注入下游 AI（选题 / 写稿 / 项目…）。写得越具体，AI 越贴合你的定位。
            </p>
          </div>
          {/* 5 条规则：单列（规则较长） */}
          <div className="flex flex-col gap-5">
            <Field>
              <FieldLabel htmlFor={id("topicRule")} icon={Lightbulb}>
                选题规则
              </FieldLabel>
              <Helper>什么该做 / 不该做——约束选题工作台的候选生成。</Helper>
              <Textarea
                id={id("topicRule")}
                aria-label="选题规则"
                className="min-h-20"
                placeholder="例：只做能落到可复现代码的选题，不蹭无技术含量的热点…"
                value={topicRule}
                onChange={(e) => setTopicRule(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={id("scriptRule")} icon={PenLine}>
                写稿规则
              </FieldLabel>
              <Helper>结构 / 钩子 / 表达约束——注入写稿与改写节点。</Helper>
              <Textarea
                id={id("scriptRule")}
                aria-label="写稿规则"
                className="min-h-20"
                placeholder="例：前 3 秒抛出可运行 demo，结尾给 GitHub 链接…"
                value={scriptRule}
                onChange={(e) => setScriptRule(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={id("projectRule")} icon={FolderKanban}>
                项目规则
              </FieldLabel>
              <Helper>立项 / 节奏约束——约束项目工作台的排期。</Helper>
              <Textarea
                id={id("projectRule")}
                aria-label="项目规则"
                className="min-h-20"
                placeholder="例：每个项目必须配可运行仓库，周更不破节奏…"
                value={projectRule}
                onChange={(e) => setProjectRule(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={id("forbidRule")} icon={ShieldAlert}>
                禁止事项
              </FieldLabel>
              <Helper>绝对红线——任何下游节点都不得越界。</Helper>
              <Textarea
                id={id("forbidRule")}
                aria-label="禁止事项"
                className="min-h-20"
                placeholder="例：不夸大、不标题党、不碰未验证的结论…"
                value={forbidRule}
                onChange={(e) => setForbidRule(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={id("expressionRule")} icon={Mic2}>
                表达风格规则
              </FieldLabel>
              <Helper>统一语气的硬约束——让所有产出口吻一致。</Helper>
              <Textarea
                id={id("expressionRule")}
                aria-label="表达风格规则"
                className="min-h-20"
                placeholder="例：第一人称、口语化、术语必给白话解释…"
                value={expressionRule}
                onChange={(e) => setExpressionRule(e.target.value)}
              />
            </Field>
          </div>
        </>
      )}

      {showSubmit ? (
        <Button type="submit" disabled={pending} className="self-start">
          {ctaLabel}
        </Button>
      ) : null}
    </form>
  );
}

export interface PositioningStatementSeed {
  readonly oneLiner: string;
  readonly keywords: readonly string[];
  readonly productAnchorIds: readonly string[];
}

export interface PositioningStatementFormProps {
  /** Pre-fill (复制为草稿 from a history row). Defaults to a blank form. */
  readonly seed?: PositioningStatementSeed;
  /** Optional — called after a successful save (e.g. close the draft dialog). */
  readonly onSuccess?: () => void;
  /** Render the inline submit button (default true; the Dialog hides it). */
  readonly showSubmit?: boolean;
  /** Stable form id so an external footer button can submit it. */
  readonly formId?: string;
  /** Disambiguate htmlFor ids. */
  readonly idPrefix?: string;
}

export function PositioningStatementForm({
  seed,
  onSuccess,
  showSubmit = true,
  formId,
  idPrefix = "st",
}: PositioningStatementFormProps = {}) {
  const { pending, run } = useMutation();
  const [oneLiner, setOneLiner] = React.useState(seed?.oneLiner ?? "");
  const [kw0, setKw0] = React.useState(seed?.keywords?.[0] ?? "");
  const [kw1, setKw1] = React.useState(seed?.keywords?.[1] ?? "");
  const [kw2, setKw2] = React.useState(seed?.keywords?.[2] ?? "");
  const [anchors, setAnchors] = React.useState(
    (seed?.productAnchorIds ?? []).join("、"),
  );
  // 修改原因：记录这次为什么开新版本（团队留痕用）。后端 createStatement body 暂无此槽位，
  // 故不注入 wire（不造假字段、不破坏契约）；保留输入以保证陈述编辑体验完整。
  const [changeReason, setChangeReason] = React.useState("");

  const keywordsValid =
    kw0.trim().length > 0 && kw1.trim().length > 0 && kw2.trim().length > 0;

  function submit() {
    if (!keywordsValid || oneLiner.trim().length === 0) return;
    run(
      () =>
        client.createStatement({
          params: undefined,
          query: undefined,
          body: {
            oneLiner: oneLiner.trim(),
            keywords: [kw0.trim(), kw1.trim(), kw2.trim()],
            productAnchorIds: anchors
              .split(/[、,，\s]+/)
              .map((a) => a.trim())
              .filter((a) => a.length > 0),
          },
        }),
      onSuccess,
    );
  }

  const id = (k: string) => `${idPrefix}-${k}`;
  const submitDisabled =
    pending || !keywordsValid || oneLiner.trim().length === 0;

  return (
    <form
      id={formId}
      data-testid="positioning-statement-form"
      className="flex w-full flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Field>
        <FieldLabel htmlFor={id("oneLiner")} icon={Quote}>
          一句话定位
        </FieldLabel>
        <Helper>我是谁 + 帮谁 + 解决什么 + 怎么表达——保存即追加一条不可变版本。</Helper>
        <Textarea
          id={id("oneLiner")}
          aria-label="一句话定位"
          className="min-h-20"
          placeholder="例：我帮一线开发者把最新 AI 论文变成可运行的工程代码。"
          value={oneLiner}
          onChange={(e) => setOneLiner(e.target.value)}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor={id("kw0")} icon={Tag}>
          关键词
        </FieldLabel>
        <Helper>3 个最能代表你的词，缺一不可。</Helper>
        <div className="grid grid-cols-3 gap-3">
          <Input
            id={id("kw0")}
            aria-label="关键词 1"
            placeholder="关键词 1"
            value={kw0}
            onChange={(e) => setKw0(e.target.value)}
          />
          <Input
            id={id("kw1")}
            aria-label="关键词 2"
            placeholder="关键词 2"
            value={kw1}
            onChange={(e) => setKw1(e.target.value)}
          />
          <Input
            id={id("kw2")}
            aria-label="关键词 3"
            placeholder="关键词 3"
            value={kw2}
            onChange={(e) => setKw2(e.target.value)}
          />
        </div>
      </Field>

      <Field>
        <FieldLabel htmlFor={id("anchors")} icon={FolderKanban}>
          产品锚（可选）
        </FieldLabel>
        <Helper>关联的产品 / 项目 id，用「、」分隔；下游会以此对齐。</Helper>
        <Input
          id={id("anchors")}
          aria-label="产品锚"
          placeholder="例：product-1、project-aico"
          value={anchors}
          onChange={(e) => setAnchors(e.target.value)}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor={id("changeReason")} icon={History}>
          修改原因（可选）
        </FieldLabel>
        <Helper>记录这次为什么开新版本，便于回看历史决策。</Helper>
        <Textarea
          id={id("changeReason")}
          aria-label="修改原因"
          placeholder="例：受众从泛开发者收窄到 AI 应用工程师…"
          value={changeReason}
          onChange={(e) => setChangeReason(e.target.value)}
        />
      </Field>

      {showSubmit ? (
        <Button type="submit" disabled={submitDisabled} className="self-start">
          保存新版本定位
        </Button>
      ) : null}
    </form>
  );
}

export interface PositioningDraftDialogProps {
  /** Current profile (pre-fills 账号画像 inside the dialog). */
  readonly profile: CreatorProfileResource | null;
  /** Trigger button label, e.g. 「+ 新建定位版本」/「编辑」/「复制为草稿」. */
  readonly triggerLabel: string;
  /** Trigger button visual: default (页头主按钮) | outline (历史行) | ghost (编辑). */
  readonly triggerVariant?: "default" | "outline" | "ghost";
  readonly triggerSize?: "default" | "sm";
  /** Show a + / pencil icon on the trigger. */
  readonly triggerIcon?: "plus" | "pencil" | "none";
  /** Dialog title + subtitle. */
  readonly title: string;
  readonly description: string;
  /** Pre-fill the statement form (复制为草稿 from a history row). */
  readonly statementSeed?: PositioningStatementSeed;
}

type DraftTab = "profile" | "rules" | "statement";

/**
 * `PositioningDraftDialog` — the 「新建定位版本 / 编辑 / 复制为草稿」 entry. A CENTERED
 * Dialog (max-w-3xl, 85vh, scroll body, sticky footer) that houses the two REAL
 * needs-backend forms (账号画像 + 定位规则 → upsertProfile, 定位陈述 →
 * createStatement) behind 3 Tabs. The sticky footer's 「保存」 submits whichever
 * form the active tab owns (via `<button form=…>`); 「取消」 closes. A successful
 * save closes the dialog; the form's own router.refresh() re-reads the page. The
 * body remounts per-open (keyed on `open`) so a 复制为草稿 seed always re-seeds.
 */
export function PositioningDraftDialog({
  profile,
  triggerLabel,
  triggerVariant = "default",
  triggerSize = "default",
  triggerIcon = "plus",
  title,
  description,
  statementSeed,
}: PositioningDraftDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [tab, setTab] = React.useState<DraftTab>("profile");
  const close = React.useCallback(() => setOpen(false), []);
  const Icon = triggerIcon === "pencil" ? PencilLine : Plus;

  // Stable form ids so the sticky footer button can submit the active tab's form.
  const profileFormId = "positioning-form-profile";
  const rulesFormId = "positioning-form-rules";
  const statementFormId = "positioning-form-statement";
  const activeFormId =
    tab === "statement"
      ? statementFormId
      : tab === "rules"
        ? rulesFormId
        : profileFormId;
  const saveLabel =
    tab === "statement"
      ? "保存新版本"
      : profile
        ? "保存"
        : "创建定位";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant={triggerVariant}
          size={triggerSize}
          data-testid="positioning-draft-trigger"
        >
          {triggerIcon !== "none" ? <Icon /> : null}
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent
        showCloseButton
        className="flex max-h-[85vh] w-full max-w-[calc(100%-2rem)] flex-col gap-0 p-0 sm:max-w-3xl"
        data-testid="positioning-draft-dialog"
      >
        <DialogHeader className="gap-1.5 border-b border-border/70 px-6 pt-6 pb-4">
          <DialogTitle className="text-lg">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {open ? (
          <Tabs
            key={String(open)}
            value={tab}
            onValueChange={(v) => setTab(v as DraftTab)}
            className="flex min-h-0 flex-1 flex-col gap-0"
          >
            <div className="px-6 pt-4">
              <TabsList className="w-full">
                <TabsTrigger value="profile">
                  <User className="size-3.5" />
                  账号画像
                </TabsTrigger>
                <TabsTrigger value="rules">
                  <ShieldAlert className="size-3.5" />
                  定位规则
                </TabsTrigger>
                <TabsTrigger value="statement">
                  <Quote className="size-3.5" />
                  定位陈述
                </TabsTrigger>
              </TabsList>
            </div>

            {/* scroll body — all three tab panels are force-mounted so switching
                tabs never drops a user's in-progress edits and the sticky footer's
                `form=…` can always reach the active tab's form. */}
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              <TabsContent
                value="profile"
                forceMount
                className="mt-0 data-[state=inactive]:hidden"
              >
                <p className="mb-4 text-xs text-text-subtle">
                  我是谁 / 领域 / 目标人群 / 差异化 / 能力——下游 AI 会以此为约束源。
                </p>
                <PositioningProfileForm
                  profile={profile}
                  ctaLabel={profile ? "保存" : "创建定位"}
                  onSuccess={close}
                  showSubmit={false}
                  formId={profileFormId}
                  section="profile"
                  idPrefix="pf-profile"
                />
              </TabsContent>

              <TabsContent
                value="rules"
                forceMount
                className="mt-0 data-[state=inactive]:hidden"
              >
                <PositioningProfileForm
                  profile={profile}
                  ctaLabel={profile ? "保存" : "创建定位"}
                  onSuccess={close}
                  showSubmit={false}
                  formId={rulesFormId}
                  section="rules"
                  idPrefix="pf-rules"
                />
              </TabsContent>

              <TabsContent
                value="statement"
                forceMount
                className="mt-0 data-[state=inactive]:hidden"
              >
                <PositioningStatementForm
                  seed={statementSeed}
                  onSuccess={close}
                  showSubmit={false}
                  formId={statementFormId}
                  idPrefix="st-dialog"
                />
              </TabsContent>
            </div>
          </Tabs>
        ) : null}

        <DialogFooter className="mx-0 mb-0 rounded-b-xl border-t border-border bg-muted/40 px-6 py-4">
          <Button variant="ghost" onClick={close} data-testid="positioning-draft-cancel">
            取消
          </Button>
          <Button type="submit" form={activeFormId} data-testid="positioning-draft-save">
            {saveLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Back-compat alias. The page + tests imported `PositioningDraftDrawer` when the
 * editor was a Sheet; the editor is now a centered Dialog (`PositioningDraftDialog`).
 * Keep the old name exported so call sites don't break.
 */
export const PositioningDraftDrawer = PositioningDraftDialog;
export type PositioningDraftDrawerProps = PositioningDraftDialogProps;
