"use client";

/**
 * skills-section.tsx — 设置「技能」页签(T-077a,SPEC 2026-07-03 §1.1)。
 *
 * 列表:遍历 REGISTRY 全部已注册 Skill(route server 侧经 ai-worker listTemplates 投影成
 * 可序列化 SkillItem[] 传入),按用途分组(对话技能 / 创作节点 / 采集分类,按 id 前缀)。
 * 每行:中文名(SKILL_LABELS 词表)+ 一句话用途 + 「已定制」徽章(有有效 override 时)。
 *
 * 详情(行内展开,不弹窗):
 *   - system / template 两个 textarea,初值 = 当前生效值(override ?? 内置);
 *   - facets 说明小卡([gate-F2]):template 框下只读卡,逐行「{{占位符}}:中文含义」,
 *     来源 requiredFacets + FACET_LABELS 词表;
 *   - tools / outputSchema 只读展示(改坏即崩,编辑留待后续 —— SPEC §1.1);
 *   - 有 official adapter 的 Skill 可编辑 completionPolicy；前端只校验基础格式，
 *     outputSchema 兼容性仍由服务端单一真值判断;
 *   - 「保存」→ settings.prompts.put(T-040 热生效);
 *   - 「恢复默认」→ patch null 删除当前账号增量并回到 official 基座。
 *
 * 诚实(铁律):textarea 显示的就是当前生效 prompt 文本;保存后 router.refresh() 重读
 * server 真值,徽章由 override 行的归一后非空字段判定,恢复默认后诚实熄灭。
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import { client } from "@/lib/contract-client";
import type {
  AccountSkillOverlayPatchResource,
  AccountSkillOverlayVersionResource,
  CompletionPolicyV1Resource,
} from "@creatoros/contract";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/project/section-card";
import { ChevronDown, ChevronRight, RotateCcw } from "lucide-react";

import {
  buildFacetCardRows,
  groupSkills,
  skillLabelOf,
  type SkillItem,
} from "./skills-data";

// ---------------------------------------------------------------------------
// SkillsSection — 页签主体
// ---------------------------------------------------------------------------

export function SkillsSection({
  skills,
}: {
  skills: readonly SkillItem[];
}) {
  // 展开的 skill id(一次展开一个:详情较长,多开会把列表推得很散)。
  const [expanded, setExpanded] = React.useState<string | null>(null);

  if (skills.length === 0) {
    // 诚实空态:route 未传技能清单(如单测直接渲 SettingsDialog)→ 明说,不渲假行。
    return (
      <SectionCard title="技能" description="系统内置的 AI 技能清单">
        <p
          data-slot="skills-empty"
          className="text-sm text-muted-foreground"
        >
          技能清单不可用(未能读取技能注册表)。
        </p>
      </SectionCard>
    );
  }

  const groups = groupSkills(skills);

  return (
    <div data-slot="skills-section" className="flex flex-col gap-card-gap">
      {groups.map((group) => (
        <SectionCard
          key={group.key}
          title={group.label}
          description={group.description}
        >
          <ul
            data-slot="skills-group"
            data-group-key={group.key}
            className="flex flex-col"
            aria-label={group.label}
          >
            {group.items.map((skill) => (
              <SkillRow
                key={skill.id}
                skill={skill}
                expanded={expanded === skill.id}
                onToggle={() =>
                  setExpanded((cur) => (cur === skill.id ? null : skill.id))
                }
              />
            ))}
          </ul>
        </SectionCard>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SkillRow — 一行技能(标题行 + 行内展开的详情)
// ---------------------------------------------------------------------------

function SkillRow({
  skill,
  expanded,
  onToggle,
}: {
  skill: SkillItem;
  expanded: boolean;
  onToggle: () => void;
}) {
  const label = skillLabelOf(skill.id);
  const Chevron = expanded ? ChevronDown : ChevronRight;

  return (
    <li
      data-slot="skill-row"
      data-skill-id={skill.id}
      data-customized={skill.customized}
      className="border-b border-border/60 py-1 last:border-b-0"
    >
      <button
        type="button"
        data-slot="skill-row-toggle"
        aria-expanded={expanded}
        onClick={onToggle}
        className="flex w-full items-center gap-2.5 rounded-md px-1.5 py-2 text-left transition-colors hover:bg-surface-subtle"
      >
        <Chevron
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground"
        />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              {label.name}
            </span>
            <span className="font-mono text-[11px] text-muted-foreground">
              {skill.id}
            </span>
            {skill.customized ? (
              <Badge
                data-slot="skill-customized-badge"
                variant="outline"
                className="border-brand/40 bg-brand-soft text-brand"
              >
                已定制
              </Badge>
            ) : null}
          </span>
          {label.purpose ? (
            <span className="text-xs text-muted-foreground">
              {label.purpose}
            </span>
          ) : null}
        </span>
      </button>
      {expanded ? (
        <SkillDetail
          key={`${skill.accountId}:${skill.id}:${skill.rowRevision ?? "official"}:${skill.version}`}
          skill={skill}
        />
      ) : null}
    </li>
  );
}

// ---------------------------------------------------------------------------
// SkillDetail — 行内展开的详情编辑面板
// ---------------------------------------------------------------------------

function parseCompletionPolicyDraft(input: {
  minSegments: string;
  maxSegments: string;
  requiredSequence: string;
  repairAttempts: string;
}):
  | { ok: true; value: CompletionPolicyV1Resource }
  | { ok: false; error: string } {
  const integer = (value: string): number | null =>
    /^\d+$/.test(value.trim()) ? Number(value) : null;
  const minSegments = integer(input.minSegments);
  if (minSegments === null || minSegments < 1 || minSegments > 100) {
    return { ok: false, error: "最少段数必须是 1–100 的整数。" };
  }
  const maxSegments =
    input.maxSegments.trim() === "" ? null : integer(input.maxSegments);
  if (
    maxSegments !== null &&
    (maxSegments < 1 || maxSegments > 100)
  ) {
    return { ok: false, error: "最多段数必须留空或填写 1–100 的整数。" };
  }
  if (maxSegments !== null && maxSegments < minSegments) {
    return { ok: false, error: "最多段数不能小于最少段数。" };
  }
  const repairAttempts = integer(input.repairAttempts);
  if (
    repairAttempts === null ||
    repairAttempts < 0 ||
    repairAttempts > 3
  ) {
    return { ok: false, error: "自动修复次数必须是 0–3 的整数。" };
  }
  const requiredSequence = input.requiredSequence
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
  if (requiredSequence.length > 20) {
    return { ok: false, error: "角色顺序最多填写 20 项。" };
  }
  if (
    requiredSequence.some(
      (token) => !/^[a-z][a-z0-9_-]{0,31}$/.test(token),
    )
  ) {
    return {
      ok: false,
      error: "角色名须为小写英文开头，可包含数字、下划线或短横线。",
    };
  }
  return {
    ok: true,
    value: {
      schemaVersion: 1,
      minSegments,
      maxSegments,
      requiredSequence,
      repairAttempts,
    },
  };
}

function PolicyNumberField({
  label,
  slot,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  label: string;
  slot: string;
  value: string;
  min: number;
  max: number;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
      {label}
      <input
        type="number"
        data-slot={slot}
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 rounded-md border border-border bg-background px-2 font-mono text-xs font-normal text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </label>
  );
}

function SkillDetail({ skill }: { skill: SkillItem }) {
  const router = useRouter();
  const canCustomize = skill.accountId !== null;
  // 草稿初值 = 当前生效值(override ?? 内置,server 侧已归一投影)。
  const [system, setSystem] = React.useState<string>(skill.system);
  const [template, setTemplate] = React.useState<string>(skill.template);
  const policySeed = skill.completionPolicy ?? {
    schemaVersion: 1 as const,
    minSegments: 1,
    maxSegments: null,
    requiredSequence: [],
    repairAttempts: 0,
  };
  const [policyMinSegments, setPolicyMinSegments] = React.useState(
    String(policySeed.minSegments),
  );
  const [policyMaxSegments, setPolicyMaxSegments] = React.useState(
    policySeed.maxSegments === null ? "" : String(policySeed.maxSegments),
  );
  const [policyRequiredSequence, setPolicyRequiredSequence] = React.useState(
    policySeed.requiredSequence.join(", "),
  );
  const [policyRepairAttempts, setPolicyRepairAttempts] = React.useState(
    String(policySeed.repairAttempts),
  );
  const [policyTouched, setPolicyTouched] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const dirty =
    system !== skill.system || template !== skill.template || policyTouched;

  // 互斥跑一个 put；expectedRevision 让并发窗口只能有一个写入者成功。
  const runPut = React.useCallback(
    (patch: AccountSkillOverlayPatchResource) => {
      if (pending) return;
      if (!canCustomize) {
        setError("请先选择账号，再保存技能定制。");
        return;
      }
      setPending(true);
      setError(null);
      void (async () => {
        try {
          await client.putPrompt({
            params: { id: skill.id },
            query: undefined,
            body: {
              expectedRevision: skill.rowRevision,
              patch,
            },
          });
          router.refresh();
        } catch (cause) {
          // [T-513] CAS 冲突 / 基座不兼容必须可见；不能统一吞成“请重试”，否则用户会
          // 在旧 revision 上反复覆盖。HttpTransportError 的结构字段跨 bundle 也可稳定读取。
          const transportError = cause as {
            code?: unknown;
            details?: Record<string, unknown>;
            message?: unknown;
          };
          const domainCode = transportError.details?.domainCode;
          if (domainCode === "SKILL_OVERLAY_REVISION_CONFLICT") {
            setError("该账号的技能配置已在别处更新，请刷新后再编辑。");
          } else if (
            typeof transportError.message === "string" &&
            transportError.message.includes("不兼容")
          ) {
            setError(transportError.message.replace(/^HttpTransport:\s*/, ""));
          } else {
            // 显式失败,不静默假装保存成功(铁律:诚实)。
            setError("保存失败,请重试。");
          }
        } finally {
          setPending(false);
        }
      })();
    },
    [canCustomize, pending, router, skill.id, skill.rowRevision],
  );

  const save = React.useCallback(() => {
    if (!dirty) return;
    const patch: AccountSkillOverlayPatchResource = { system, template };
    if (skill.completionPolicySupported && policyTouched) {
      const parsed = parseCompletionPolicyDraft({
        minSegments: policyMinSegments,
        maxSegments: policyMaxSegments,
        requiredSequence: policyRequiredSequence,
        repairAttempts: policyRepairAttempts,
      });
      if (!parsed.ok) {
        setError(parsed.error);
        return;
      }
      patch.completionPolicy = parsed.value;
    }
    runPut(patch);
  }, [
    dirty,
    policyMaxSegments,
    policyMinSegments,
    policyRepairAttempts,
    policyRequiredSequence,
    policyTouched,
    runPut,
    skill.completionPolicySupported,
    system,
    template,
  ]);

  // 恢复默认:null 表示删除这两个账号增量字段，服务端回退 official 基座。
  const restore = React.useCallback(() => {
    runPut({ system: null, template: null });
  }, [runPut]);

  const restoreCompletionPolicy = React.useCallback(() => {
    runPut({ completionPolicy: null });
  }, [runPut]);

  const facetRows = buildFacetCardRows(skill.template, skill.requiredFacets);

  return (
    <div
      data-slot="skill-detail"
      data-skill-id={skill.id}
      className="mt-1 flex flex-col gap-3 rounded-md border border-border bg-surface-subtle/40 p-3"
    >
      {!canCustomize ? (
        <p
          data-slot="skill-account-required"
          className="rounded-md border border-border bg-background px-2.5 py-2 text-xs text-muted-foreground"
        >
          选择账号后可定制此技能。
        </p>
      ) : null}
      {/* system 提示(角色 + 方法论 = skill 本体)。 */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor={`skill-system-${skill.id}`}
          className="text-xs font-medium text-foreground"
        >
          system 提示(角色与方法论)
        </label>
        <textarea
          id={`skill-system-${skill.id}`}
          data-slot="skill-system-input"
          value={system}
          disabled={pending || !canCustomize}
          rows={6}
          onChange={(event) => setSystem(event.target.value)}
          className="w-full resize-y rounded-md border border-border bg-background p-2 font-mono text-xs leading-relaxed text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`${skillLabelOf(skill.id).name} system 提示`}
        />
      </div>

      {/* user template(含 {{facet}} 占位;个人风格/文案结构在此定制 —— SPEC §1.1)。 */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor={`skill-template-${skill.id}`}
          className="text-xs font-medium text-foreground"
        >
          用户提示模板(含 {"{{占位符}}"},上下文注入点)
        </label>
        <textarea
          id={`skill-template-${skill.id}`}
          data-slot="skill-template-input"
          value={template}
          disabled={pending || !canCustomize}
          rows={8}
          onChange={(event) => setTemplate(event.target.value)}
          className="w-full resize-y rounded-md border border-border bg-background p-2 font-mono text-xs leading-relaxed text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`${skillLabelOf(skill.id).name} 用户提示模板`}
        />
      </div>

      {/* facets 说明小卡([gate-F2]):template 框下只读卡,逐行「{{占位符}}:中文含义」。 */}
      {facetRows.length > 0 ? (
        <div
          data-slot="skill-facets-card"
          className="flex flex-col gap-1.5 rounded-md border border-border/70 bg-background p-2.5"
        >
          <span className="text-xs font-medium text-foreground">
            模板占位符说明(运行时由系统注入,改模板时保留需要的占位符)
          </span>
          <ul className="flex flex-col gap-1">
            {facetRows.map((row) => (
              <li
                key={row.name}
                data-slot="skill-facet-row"
                data-facet-name={row.name}
                className="flex items-baseline gap-2 text-xs"
              >
                <code className="shrink-0 rounded bg-surface-subtle px-1 py-0.5 font-mono text-[11px] text-brand">
                  {`{{${row.name}}}`}
                </code>
                <span className="text-muted-foreground">{row.label}</span>
                {row.required ? (
                  <span className="shrink-0 text-[10px] text-warning">
                    必需
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* tools / outputSchema 只读展示(本期不可编辑 —— 改坏即崩,SPEC §1.1)。 */}
      {skill.tools.length > 0 ? (
        <div data-slot="skill-tools" className="flex flex-col gap-1">
          <span className="text-xs font-medium text-foreground">
            工具白名单(只读)
          </span>
          <div className="flex flex-wrap gap-1">
            {skill.tools.map((tool) => (
              <code
                key={tool}
                className="rounded bg-surface-subtle px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
              >
                {tool}
              </code>
            ))}
          </div>
        </div>
      ) : null}
      {skill.outputSchemaJson ? (
        <details data-slot="skill-output-schema" className="group">
          <summary className="cursor-pointer text-xs font-medium text-foreground">
            输出契约 outputSchema(只读,JSON Schema)
          </summary>
          <pre className="mt-1 max-h-56 overflow-auto rounded-md border border-border/70 bg-background p-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
            {skill.outputSchemaJson}
          </pre>
        </details>
      ) : null}

      {skill.completionPolicySupported ? (
        <div
          data-slot="skill-completion-policy"
          className="flex flex-col gap-2 rounded-md border border-border/70 bg-background p-2.5"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-foreground">
                结果完整性策略
              </p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                由当前 Skill 声明结构要求。系统只执行这些字段，不会自行认定
                hook、正文或 CTA。
              </p>
            </div>
            <Button
              type="button"
              data-slot="skill-policy-restore-default"
              variant="ghost"
              size="sm"
              disabled={
                pending || !canCustomize || !skill.completionPolicyCustomized
              }
              onClick={restoreCompletionPolicy}
              title={
                skill.completionPolicyCustomized
                  ? "删除当前账号的策略增量，恢复官方策略"
                  : "当前账号未覆盖完整性策略"
              }
            >
              <RotateCcw aria-hidden="true" className="size-3.5 shrink-0" />
              恢复官方策略
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <PolicyNumberField
              label="最少段数"
              slot="skill-policy-min-segments"
              value={policyMinSegments}
              min={1}
              max={100}
              disabled={pending || !canCustomize}
              onChange={(value) => {
                setPolicyMinSegments(value);
                setPolicyTouched(true);
                setError(null);
              }}
            />
            <PolicyNumberField
              label="最多段数（留空=不限）"
              slot="skill-policy-max-segments"
              value={policyMaxSegments}
              min={1}
              max={100}
              disabled={pending || !canCustomize}
              onChange={(value) => {
                setPolicyMaxSegments(value);
                setPolicyTouched(true);
                setError(null);
              }}
            />
            <PolicyNumberField
              label="自动修复次数"
              slot="skill-policy-repair-attempts"
              value={policyRepairAttempts}
              min={0}
              max={3}
              disabled={pending || !canCustomize}
              onChange={(value) => {
                setPolicyRepairAttempts(value);
                setPolicyTouched(true);
                setError(null);
              }}
            />
          </div>
          <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
            角色顺序（英文逗号分隔；留空=不要求）
            <input
              data-slot="skill-policy-required-sequence"
              value={policyRequiredSequence}
              disabled={pending || !canCustomize}
              onChange={(event) => {
                setPolicyRequiredSequence(event.target.value);
                setPolicyTouched(true);
                setError(null);
              }}
              placeholder="hook, body, cta"
              className="h-8 rounded-md border border-border bg-background px-2 font-mono text-xs font-normal text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          {skill.officialCompletionPolicy ? (
            <p className="text-[11px] text-text-subtle">
              官方默认：{skill.officialCompletionPolicy.minSegments}–
              {skill.officialCompletionPolicy.maxSegments ?? "不限"} 段；顺序{" "}
              {skill.officialCompletionPolicy.requiredSequence.join(" → ") ||
                "不限制"}
              ；自动修复 {skill.officialCompletionPolicy.repairAttempts} 次。
            </p>
          ) : null}
        </div>
      ) : null}

      {/* [T-165] 版本历史 + 一键回滚 —— 展开拉该 skill 历史快照,可回滚到任一版本(回滚后
          server 热更即生效,router.refresh 重取生效值)。 */}
      {canCustomize ? (
        <SkillVersionHistory
          skillId={skill.id}
          currentRevision={skill.rowRevision}
          disabled={pending}
          onRolledBack={() => router.refresh()}
        />
      ) : null}

      {error ? (
        <p
          data-slot="skill-save-error"
          className="text-xs text-destructive"
        >
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        {/* 「恢复默认」**每个技能都有**(用户要求):未定制时禁用(用的就是内置默认,无 override 可恢复),
            已定制时可点 —— 清掉本地定制回退内置。禁用而非隐藏 = 按钮位置稳定、可发现,又不骗人。 */}
        <Button
          type="button"
          data-slot="skill-restore-default"
          variant="ghost"
          size="sm"
          disabled={pending || !canCustomize || !skill.customized}
          onClick={restore}
          title={
            skill.customized
              ? "清掉本地定制,回退内置提示词"
              : "当前用的就是内置默认,无需重置"
          }
        >
          <RotateCcw aria-hidden="true" className="size-3.5 shrink-0" />
          恢复默认
        </Button>
        <Button
          type="button"
          data-slot="skill-save"
          variant="outline"
          size="sm"
          disabled={!canCustomize || !dirty || pending}
          onClick={save}
        >
          {pending ? "保存中…" : "保存"}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SkillVersionHistory — [T-165] 某 skill 的版本历史 + 一键回滚(行内 <details>,首次展开拉取)
// ---------------------------------------------------------------------------

function SkillVersionHistory({
  skillId,
  currentRevision,
  disabled,
  onRolledBack,
}: {
  skillId: string;
  currentRevision: number | null;
  disabled: boolean;
  onRolledBack: () => void;
}) {
  const [versions, setVersions] = React.useState<
    AccountSkillOverlayVersionResource[] | null
  >(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [rollingId, setRollingId] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const rows = await client.listPromptVersions({
          params: { id: skillId },
          query: undefined,
          body: undefined,
        });
        setVersions(rows);
      } catch {
        setError("加载版本历史失败,请重试。");
      } finally {
        setLoading(false);
      }
    })();
  }, [skillId]);

  const rollback = React.useCallback(
    (versionId: string) => {
      if (rollingId) return;
      setRollingId(versionId);
      setError(null);
      void (async () => {
        try {
          await client.rollbackPrompt({
            params: { id: skillId },
            query: undefined,
            body: {
              versionId,
              expectedRevision: currentRevision ?? 1,
            },
          });
          onRolledBack(); // 父 router.refresh 重取生效值(热更已在服务端)。
          load(); // 回滚也进历史 → 重拉列表。
        } catch {
          setError("回滚失败,请重试。");
        } finally {
          setRollingId(null);
        }
      })();
    },
    [rollingId, skillId, currentRevision, onRolledBack, load],
  );

  return (
    <details
      data-slot="skill-version-history"
      className="group"
      onToggle={(event) => {
        const el = event.currentTarget;
        if (el.open && versions === null && !loading) load();
      }}
    >
      <summary className="cursor-pointer text-xs font-medium text-foreground">
        版本历史 / 一键回滚
      </summary>
      <div className="mt-1 flex flex-col gap-1.5">
        {loading ? (
          <p className="text-xs text-muted-foreground">加载中…</p>
        ) : error ? (
          <p data-slot="skill-version-error" className="text-xs text-destructive">
            {error}
          </p>
        ) : versions && versions.length > 0 ? (
          versions.map((v, i) => (
            <div
              key={v.id}
              data-slot="skill-version-row"
              data-version-id={v.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border/70 bg-background px-2 py-1.5 text-xs"
            >
              <span className="text-muted-foreground">
                r{v.rowRevision}
                {i === 0 ? "(当前)" : ""} · {v.updatedBy} ·{" "}
                {v.createdAt.slice(0, 19).replace("T", " ")}
              </span>
              {/* 首行=当前生效版本,回滚它无意义 → 禁用。 */}
              <Button
                type="button"
                data-slot="skill-version-rollback"
                variant="ghost"
                size="sm"
                disabled={disabled || i === 0 || rollingId !== null}
                onClick={() => rollback(v.id)}
                title="把这个历史版本重新生效为当前配置(回滚也会记一条新版本,可再回滚)"
              >
                {rollingId === v.id ? "回滚中…" : "回滚到此版本"}
              </Button>
            </div>
          ))
        ) : (
          <p className="text-xs text-muted-foreground">
            还没有历史版本。每次保存或恢复默认后,系统会自动留一份记录。
          </p>
        )}
      </div>
    </details>
  );
}
