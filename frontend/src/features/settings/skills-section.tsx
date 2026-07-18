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
 *   - 「保存」→ settings.prompts.put(T-040 热生效);
 *   - 「恢复默认」→ put 空串字段(T-040 空串归一 undefined = 回退内置),仅已定制时显示。
 *
 * 诚实(铁律):textarea 显示的就是当前生效 prompt 文本;保存后 router.refresh() 重读
 * server 真值,徽章由 override 行的归一后非空字段判定,恢复默认后诚实熄灭。
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import { client } from "@/lib/contract-client";
import type { SkillConfigOverrideVersionResource } from "@creatoros/contract";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/project/section-card";
import { cn } from "@/lib/utils";
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
      {expanded ? <SkillDetail skill={skill} /> : null}
    </li>
  );
}

// ---------------------------------------------------------------------------
// SkillDetail — 行内展开的详情编辑面板
// ---------------------------------------------------------------------------

function SkillDetail({ skill }: { skill: SkillItem }) {
  const router = useRouter();
  // 草稿初值 = 当前生效值(override ?? 内置,server 侧已归一投影)。
  const [system, setSystem] = React.useState<string>(skill.system);
  const [template, setTemplate] = React.useState<string>(skill.template);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // server refresh 改了生效值(保存/恢复默认后)→ 重同步草稿。
  React.useEffect(() => {
    setSystem(skill.system);
    setTemplate(skill.template);
  }, [skill.system, skill.template]);

  const dirty = system !== skill.system || template !== skill.template;

  // 互斥跑一个 put:保存(当前草稿)或恢复默认(空串字段,T-040 归一语义)。
  const runPut = React.useCallback(
    (body: { system: string; template: string }) => {
      if (pending) return;
      setPending(true);
      setError(null);
      void (async () => {
        try {
          await client.putPrompt({
            params: { id: skill.id },
            query: undefined,
            body,
          });
          router.refresh();
        } catch {
          // 显式失败,不静默假装保存成功(铁律:诚实)。
          setError("保存失败,请重试。");
        } finally {
          setPending(false);
        }
      })();
    },
    [pending, router, skill.id],
  );

  const save = React.useCallback(() => {
    if (!dirty) return;
    runPut({ system, template });
  }, [dirty, runPut, system, template]);

  // 恢复默认:put 空串字段 → server 存空串,装配归一成 undefined → 回退内置(T-040)。
  const restore = React.useCallback(() => {
    runPut({ system: "", template: "" });
  }, [runPut]);

  const facetRows = buildFacetCardRows(skill.template, skill.requiredFacets);

  return (
    <div
      data-slot="skill-detail"
      data-skill-id={skill.id}
      className="mt-1 flex flex-col gap-3 rounded-md border border-border bg-surface-subtle/40 p-3"
    >
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
          disabled={pending}
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
          disabled={pending}
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

      {/* [T-165] 版本历史 + 一键回滚 —— 展开拉该 skill 历史快照,可回滚到任一版本(回滚后
          server 热更即生效,router.refresh 重取生效值)。 */}
      <SkillVersionHistory
        skillId={skill.id}
        disabled={pending}
        onRolledBack={() => router.refresh()}
      />

      {error ? (
        <p
          data-slot="skill-save-error"
          className="text-xs text-destructive"
        >
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        {/* 「恢复默认」仅已定制时显(未定制没有可恢复的 override —— 假按钮不上)。 */}
        {skill.customized ? (
          <Button
            type="button"
            data-slot="skill-restore-default"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={restore}
            title="清掉本地定制,回退内置提示词(put 空串字段)"
          >
            <RotateCcw aria-hidden="true" className="size-3.5 shrink-0" />
            恢复默认
          </Button>
        ) : null}
        <Button
          type="button"
          data-slot="skill-save"
          variant="outline"
          size="sm"
          disabled={!dirty || pending}
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
  disabled,
  onRolledBack,
}: {
  skillId: string;
  disabled: boolean;
  onRolledBack: () => void;
}) {
  const [versions, setVersions] = React.useState<
    SkillConfigOverrideVersionResource[] | null
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
            body: { versionId },
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
    [rollingId, skillId, onRolledBack, load],
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
                v{v.version ?? "?"}
                {i === 0 ? "(当前)" : ""} · {v.updatedBy ?? "system"} ·{" "}
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
