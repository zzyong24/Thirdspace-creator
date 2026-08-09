import "server-only";

import { client as defaultClient } from "@/lib/contract-client.server";
import { sectionsToHtml } from "./script-editor-bridge";
import type {
  ScriptSectionView,
  ScriptViewModel,
} from "@/types/view-models";

// Injectable client seam (mirrors the other *-workspace-data helpers): the Script
// route passes a request-scoped, user-bound client so a logged-in user reads
// their own ctx.userId artifacts (empty account → empty), while the default stays
// the canonical singleton for SSR/tests. Only the read ops this module uses are
// declared.
export interface ScriptDataClient {
  getArtifact(input: {
    params: { artifactId: string };
    query: undefined;
    body: undefined;
  }): Promise<{ currentVersionId?: unknown }>;
  listArtifactVersions(input: {
    params: { artifactId: string };
    query: { page: number; pageSize: number };
    body: undefined;
  }): Promise<unknown>;
  // SEAM-02:脚本"大纲"区读策划的结构方案 —— 列项目 artifacts 找 content_outline。
  // Optional so existing callers / tests that omit it degrade to the script-derived outline.
  listArtifacts?(input: {
    params: { projectId: string };
    query: { page: number; pageSize: number };
    body: undefined;
  }): Promise<unknown>;
}

// Read the 分镜脚本 artifact's CURRENT version content and shape it into the editor's
// `sections` (Plan: 脚本编辑器做真, read side / round-trip). Used by the async Script
// route to override the fixture sections with whatever was last saved or AI-drafted:
//
//   - if the current version has contentData.sections (non-empty), build the editor
//     sections from THOSE (id / heading / body),
//   - else if it only has contentText, render that as a single editable section
//     ("脚本正文"),
//   - else return null so the page falls back to the fixture vm.sections.
//
// Degrades gracefully: any read/parse failure → null (the page never crashes).

interface SavedSection {
  id?: unknown;
  heading?: unknown;
  body?: unknown;
  // L4 task-review 修:读回这些(原来写死 → 金句标注/段落类型/分镜时间码首次保存即丢)。
  type?: unknown;
  emphasis?: unknown;
  startSeconds?: unknown;
  endSeconds?: unknown;
  // [T-387b] 凝固分镜(采纳时 ai.service 凝固 pass 校验后的 visual;旧稿无 → undefined)。
  visual?: unknown;
}

// [T-387b] 宽容读回一段的 visual(contentData 是 jsonb 自由形状,防御解析;三段全空 → null)。
function coerceSectionVisual(
  raw: unknown,
): { description: string; assetRefs: string[]; missing: string[] } | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const description =
    typeof o.description === "string" ? o.description.trim() : "";
  const strArr = (v: unknown): string[] =>
    Array.isArray(v)
      ? v
          .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
          .map((x) => x.trim())
      : [];
  const assetRefs = strArr(o.assetRefs);
  const missing = strArr(o.missing);
  if (!description && assetRefs.length === 0 && missing.length === 0) return null;
  return { description, assetRefs, missing };
}

function coerceSavedSections(
  raw: unknown,
  index: () => number,
): ScriptSectionView[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: ScriptSectionView[] = [];
  for (const item of raw) {
    const s = (item ?? {}) as SavedSection;
    const heading = typeof s.heading === "string" ? s.heading : "";
    const body = typeof s.body === "string" ? s.body : "";
    if (!heading && !body) continue;
    const id =
      typeof s.id === "string" && s.id ? s.id : `script-saved-${index()}`;
    // L4 task-review 修:读回保存时写进的 type/emphasis/时间码(原来全写死 → 金句轨首次保存即空、
    // 段落类型全塌"正文"、分镜时间码丢)。缺字段才回退默认(向后兼容旧版本)。
    const emphasis = typeof s.emphasis === "boolean" ? s.emphasis : false;
    const type =
      typeof s.type === "string" && s.type
        ? (s.type as ScriptSectionView["type"])
        : emphasis
          ? "golden_quote"
          : "body";
    const num = (v: unknown): number | null =>
      typeof v === "number" && Number.isFinite(v) ? v : null;
    // [T-387b] 读回凝固分镜(缺字段 → 不带,旧稿零回归)。
    const visual = coerceSectionVisual(s.visual);
    out.push({
      id,
      type,
      heading: heading || "脚本段落",
      body,
      emphasis,
      startSeconds: num(s.startSeconds),
      endSeconds: num(s.endSeconds),
      ...(visual ? { visual } : {}),
    });
  }
  return out.length > 0 ? out : null;
}

// A single version row as returned by `artifacts.versions.list`. We only read the
// fields we map (id / versionNumber / changeSummary / createdAt / content*).
interface VersionRow {
  readonly id: string;
  readonly versionNumber: number;
  readonly changeSummary?: unknown;
  readonly createdAt?: unknown;
  readonly contentText?: unknown;
  readonly contentData?: unknown;
}

// One versions fetch, shared by every Script read-side derivation (sections,
// versions strip, outline, golden quotes). `artifacts.get` exposes only
// `currentVersionId` (not the content), so we read the full version list once and
// pick the CURRENT version from it. Returns null on any failure / missing artifact.
async function fetchVersionsAndCurrent(
  client: ScriptDataClient,
  artifactId: string,
): Promise<{ rows: VersionRow[]; current: VersionRow } | null> {
  const artifact = await client.getArtifact({
    params: { artifactId },
    query: undefined,
    body: undefined,
  });
  const versions = await client.listArtifactVersions({
    params: { artifactId },
    query: { page: 1, pageSize: 100 },
    body: undefined,
  });
  const rows = (Array.isArray(versions) ? versions : []) as VersionRow[];
  if (rows.length === 0) return null;
  const current =
    rows.find((v) => v.id === artifact.currentVersionId) ??
    // Fallback: highest versionNumber if currentVersionId did not resolve.
    rows.slice().sort((a, b) => b.versionNumber - a.versionNumber)[0];
  if (!current) return null;
  return { rows, current };
}

// Shape the CURRENT version's content into the editor's `sections`:
//   - contentData.sections (non-empty) → structured editor sections,
//   - else contentText → a single "脚本正文" section,
//   - else null.
function sectionsFromVersion(current: VersionRow): ScriptSectionView[] | null {
  let counter = 0;
  const next = () => counter++;
  const structured = coerceSavedSections(
    (current.contentData as { sections?: unknown } | undefined)?.sections,
    next,
  );
  if (structured) return structured;

  const contentText =
    typeof current.contentText === "string" ? current.contentText : "";
  if (contentText.trim().length > 0) {
    return [
      {
        id: "script-content-text",
        type: "body",
        heading: "脚本正文",
        body: contentText,
        emphasis: false,
        startSeconds: null,
        endSeconds: null,
      },
    ];
  }
  return null;
}

export async function loadScriptEditorSections(
  artifactId: string | null,
  client: ScriptDataClient = defaultClient as unknown as ScriptDataClient,
): Promise<ScriptSectionView[] | null> {
  if (!artifactId) return null;
  try {
    const fetched = await fetchVersionsAndCurrent(client, artifactId);
    if (!fetched) return null;
    return sectionsFromVersion(fetched.current);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// loadScriptEditorData — the GAP-SCR-1 combined read (版本列表 / 大纲 / 金句)
// ---------------------------------------------------------------------------

export interface ScriptEditorData {
  /** CURRENT version's editor sections (same as loadScriptEditorSections). */
  readonly sections: ScriptSectionView[] | null;
  /**
   * T-019(L4):TipTap 编辑器的初始 HTML。优先用当前版本的 `contentData.html`(富文本真值,
   * 忠实往返);无 html 时(历史保存 / script.draft AI 初稿只产 sections)从 sections 拼出
   * (`<h2>` + `<p>`)。null = 无 artifact / 读失败,页面回退 fixture sections 的拼接。
   */
  readonly editorHtml: string | null;
  /** REAL version history (newest-first) from artifacts.versions.list. */
  readonly versions: ScriptViewModel["versions"];
  /** 当前版本锚点：版本恢复/局部改稿必须据它做并发校验，不能只凭“共 N 版”。 */
  readonly currentVersionId: string;
  /** Outline derived from the CURRENT version's section headings. */
  readonly outline: ScriptViewModel["outline"];
  /** Pull-quote candidates derived from emphasis sections of the CURRENT version. */
  readonly goldenQuotes: ScriptViewModel["goldenQuotes"];
}

/**
 * GAP-SCR-1 read-side做真: assemble the Script root VM's previously-fixture regions
 * (版本列表 / 大纲 / 金句) from ONE `artifacts.versions.list` fetch (shared with the
 * editor sections — no double read).
 *
 *   - 版本列表: every ArtifactVersion → {id, label "v<n>", changeSummary摘要, createdAt}.
 *   - 大纲:     the CURRENT version's section headings → outline rows.
 *   - 金句:     the CURRENT version's emphasis sections (golden_quote / emphasis:true)
 *               → pull-quote candidates. Empty when none — the card owns its empty state.
 *
 * Returns null (caller keeps the fixture VM fields) when there is no artifact id or the
 * read fails. A real, persisted script NEVER renders a fixture桩 nor crashes.
 */
export async function loadScriptEditorData(
  artifactId: string | null,
  client: ScriptDataClient = defaultClient as unknown as ScriptDataClient,
): Promise<ScriptEditorData | null> {
  if (!artifactId) return null;
  try {
    const fetched = await fetchVersionsAndCurrent(client, artifactId);
    if (!fetched) return null;
    const { rows, current } = fetched;

    const sections = sectionsFromVersion(current);

    // TipTap 初值:当前版本的 contentData.html 优先(富文本忠实往返);否则从 sections 拼。
    const savedHtml = (current.contentData as { html?: unknown } | undefined)
      ?.html;
    const editorHtml =
      typeof savedHtml === "string" && savedHtml.trim().length > 0
        ? savedHtml
        : sections && sections.length > 0
          ? sectionsToHtml(sections)
          : null;

    const versions = rows
      .slice()
      .sort((a, b) => b.versionNumber - a.versionNumber)
      .map((v) => {
        const summary =
          typeof v.changeSummary === "string" && v.changeSummary.trim()
            ? v.changeSummary.trim()
            : "";
        const contentText =
          typeof v.contentText === "string" ? v.contentText.trim() : "";
        const structured = coerceSavedSections(
          (v.contentData as { sections?: unknown } | undefined)?.sections,
          (() => {
            let i = 0;
            return () => i++;
          })(),
        );
        const previewText = (
          contentText ||
          (structured ?? [])
            .map((section) => [section.heading, section.body].filter(Boolean).join("\n"))
            .join("\n\n")
        )
          .replace(/\s+/g, " ")
          .slice(0, 320);
        return {
          id: v.id,
          label: `脚本 · v${v.versionNumber}${summary ? ` · ${summary}` : ""}`,
          createdAt: typeof v.createdAt === "string" ? v.createdAt : "",
          versionNumber: v.versionNumber,
          summary,
          previewText,
          isCurrent: v.id === current.id,
        };
      });

    const outline = (sections ?? [])
      .filter((s) => s.heading.trim().length > 0)
      .map((s, index) => ({
        id: `script-outline-${s.id}`,
        heading: s.heading,
        position: index,
      }));

    const goldenQuotes = (sections ?? [])
      .filter(
        (s) =>
          (s.emphasis || s.type === "golden_quote") && s.body.trim().length > 0,
      )
      .map((s) => ({ id: `script-quote-${s.id}`, text: s.body.trim() }));

    return {
      sections,
      editorHtml,
      versions,
      currentVersionId: current.id,
      outline,
      goldenQuotes,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// SEAM-02 — 脚本"大纲"区读策划的结构方案 (content_outline artifact)
// ---------------------------------------------------------------------------

interface OutlineArtifactDto {
  readonly id: string;
  readonly artifactType: string;
  readonly stage?: string;
}

/**
 * [T-050] Resolve the script artifact id from the DB (was: fixture 查表旁路 —— selector
 * 查 canonicalDataset.artifacts,真项目永远 null → 页面渲染 demo sections)。语义与旧
 * selector 一致:优先 分镜脚本(output_script),回退 主脚本(master_script),都没有 → null
 * (真实空:项目还没进脚本阶段)。任何读失败 → null,不炸页面。
 */
export async function resolveScriptArtifactIdFromDb(
  projectId: string | null,
  client: ScriptDataClient = defaultClient as unknown as ScriptDataClient,
): Promise<string | null> {
  if (!projectId || !client.listArtifacts) return null;
  try {
    const listed = await client.listArtifacts({
      params: { projectId },
      query: { page: 1, pageSize: 200 },
      body: undefined,
    });
    const artifacts = (Array.isArray(listed) ? listed : []) as OutlineArtifactDto[];
    const scriptArtifacts = artifacts.filter((a) => a.stage === "script");
    const output = scriptArtifacts.find((a) => a.artifactType === "output_script");
    if (output) return output.id;
    const master = scriptArtifacts.find((a) => a.artifactType === "master_script");
    return master?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * SEAM-02: read the project's 策划 结构方案 (`content_outline` artifact's CURRENT version
 * `contentData.sections`) → the Script editor's 大纲 rows. This makes the script page's 大纲
 * come from 策划's structure plan (the upstream blueprint) rather than being re-derived from
 * the script's own section headings. Returns:
 *   - the outline rows (one per 结构方案 段落, label = the beat) when an adopted outline exists,
 *   - null when there is no project id, no content_outline artifact, no current version, no
 *     sections, or any read/parse failure → the caller keeps the script-derived outline.
 *
 * Degrades gracefully (any failure → null); never crashes the page.
 */
export async function loadPlanningOutline(
  projectId: string | null,
  client: ScriptDataClient = defaultClient as unknown as ScriptDataClient,
): Promise<ScriptViewModel["outline"] | null> {
  if (!projectId || !client.listArtifacts) return null;
  try {
    const listed = await client.listArtifacts({
      params: { projectId },
      query: { page: 1, pageSize: 200 },
      body: undefined,
    });
    const artifacts = (Array.isArray(listed) ? listed : []) as OutlineArtifactDto[];
    const outlineArtifact = artifacts.find(
      (a) => a.artifactType === "content_outline",
    );
    if (!outlineArtifact) return null;
    const fetched = await fetchVersionsAndCurrent(client, outlineArtifact.id);
    if (!fetched) return null;
    const data = fetched.current.contentData as
      | { sections?: unknown }
      | undefined;
    const rawSections = Array.isArray(data?.sections) ? data.sections : [];
    const rows = rawSections
      .map((raw, index) => {
        const o = (raw ?? {}) as Record<string, unknown>;
        const label = typeof o.label === "string" ? o.label.trim() : "";
        const intent = typeof o.intent === "string" ? o.intent.trim() : "";
        const heading = label || intent;
        if (!heading) return null;
        return {
          id: `planning-outline-${outlineArtifact.id}-${index}`,
          heading,
          position: index,
        };
      })
      .filter(
        (r): r is { id: string; heading: string; position: number } =>
          r !== null,
      );
    return rows.length > 0 ? rows : null;
  } catch {
    return null;
  }
}
