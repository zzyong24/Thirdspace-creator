/**
 * Script Workspace selector.
 *
 * Maps the canonical dataset to the `ScriptViewModel` consumed by the
 * Script Workspace page. Pure and deterministic — no `Date.now`,
 * `Math.random` or network access. Page components import
 * `buildScriptViewModel` from `@/fixtures/selectors` and never
 * dereference `canonicalDataset` for data shaping.
 */

import { canonicalDataset, getProjectById } from "../canonical";
import type {
  ScriptSectionView,
  ScriptViewModel,
} from "@/types/view-models";

// ---------------------------------------------------------------------------
// Locked tab descriptors (page-specs §7: spec order is the source of truth)
// ---------------------------------------------------------------------------

const SCRIPT_TABS: ReadonlyArray<ScriptViewModel["tabs"][number]> = [
  { id: "outline", label: "大纲" },
  { id: "master-script", label: "正文" },
  { id: "quotes", label: "金句卡片" },
  { id: "mode", label: "脚本模式" },
  { id: "ai-rewrite", label: "AI 改写" },
  { id: "versions", label: "版本记录" },
];

// ---------------------------------------------------------------------------
// Slug resolver — the URL segment is "ai-native-browser" while the
// canonical fixture ID is "project-ainativebrowser". The shared shell
// layer cannot be modified per Phase 3 scope, so the feature owns its
// own resolver. Mirrors research-workspace's resolver.
// ---------------------------------------------------------------------------

function resolveScriptProjectIdSlug(slug: string): string {
  if (!slug) return slug;
  const knownIds = canonicalDataset.projects.map((project) => project.id);
  if (knownIds.includes(slug)) return slug;
  const candidate = `project-${slug.replace(/-/g, "")}`;
  if (knownIds.includes(candidate)) return candidate;
  return slug;
}

// Script outline — extended synthetic outline that mirrors the design's
// 7-item list (Hook → 立意 → 产品架构 → 代表产品 → 对比章节 → 案例 → 结尾).
const SCRIPT_OUTLINE_FALLBACK: ReadonlyArray<{ id: string; heading: string }> = [
  { id: "outline-hook", heading: "开场 15 秒" },
  { id: "outline-intro", heading: "立意" },
  { id: "outline-arch", heading: "产品架构" },
  { id: "outline-matrix", heading: "代表产品对比" },
  { id: "outline-comparison", heading: "对比章节" },
  { id: "outline-case", heading: "案例场景" },
  { id: "outline-outro", heading: "结尾行动召唤" },
];

// ---------------------------------------------------------------------------
// Selector: build the Script Workspace ViewModel
// ---------------------------------------------------------------------------

export function buildScriptViewModel(
  projectId: string,
): ScriptViewModel {
  const resolvedId = resolveScriptProjectIdSlug(projectId);
  const project = getProjectById(resolvedId);
  if (!project) {
    return {
      scenario: "empty",
      kind: "script",
      projectId,
      tabs: SCRIPT_TABS,
      sections: [],
      outline: [],
      aiSuggestions: [],
      goldenQuotes: [],
      versions: [],
      toolbarState: {
        wordCount: 0,
        savedAt: "",
        status: "saved",
      },
      loading: false,
      error: null,
    };
  }

  const sections = buildSections(project.id);
  return {
    scenario: "default",
    kind: "script",
    projectId: project.id,
    tabs: SCRIPT_TABS,
    sections,
    outline: buildOutline(project.id, sections),
    aiSuggestions: buildAISuggestions(project.id),
    goldenQuotes: buildGoldenQuotes(project.id),
    versions: buildVersions(project.id),
    toolbarState: {
      wordCount: computeWordCount(sections),
      savedAt: canonicalDataset.userPreferences[0] ? "" : "",
      status: "saved",
    },
    loading: false,
    error: null,
  };
}

function buildSections(projectId: string): ReadonlyArray<ScriptSectionView> {
  void projectId;
  return canonicalDataset.scriptSections
    .filter((section) => section.artifactVersionId === "av-ainativebrowser-output-script")
    .slice()
    .sort((a, b) => a.position - b.position)
    .map<ScriptSectionView>((section) => ({
      id: section.id,
      type: section.sectionType,
      heading: section.title,
      body: section.content,
      emphasis: section.sectionType === "golden_quote",
      startSeconds: section.startSeconds,
      endSeconds: section.endSeconds,
    }));
}

function buildOutline(
  projectId: string,
  sections: ReadonlyArray<ScriptSectionView>,
): ScriptViewModel["outline"] {
  void projectId;
  // Use the 7-item fallback when the fixture returns ≥4 sections
  // (otherwise the right-rail card collapses to fixture-only items).
  if (sections.length >= 4) {
    return SCRIPT_OUTLINE_FALLBACK.map((item, index) => ({
      id: item.id,
      heading: item.heading,
      position: index,
    }));
  }
  return sections.map((section, index) => ({
    id: section.id,
    heading: section.heading,
    position: index,
  }));
}

function buildAISuggestions(
  projectId: string,
): ScriptViewModel["aiSuggestions"] {
  void projectId;
  // Static, deterministic copy that mirrors the kind of suggestions the
  // screenshot surfaces; no backend wiring in this implementation.
  return [
    {
      id: "ai-suggestion-1",
      title: "在开场加入「完播率」承诺",
      body: "把 80% 受访者希望浏览器完成任务这条证据前移到开场 15 秒。",
    },
    {
      id: "ai-suggestion-2",
      title: "为对比章节补一句定义",
      body: "在介绍 Arc / Dia / Sigma OS 前先给「AI Native Browser」一个统一定义。",
    },
    {
      id: "ai-suggestion-3",
      title: "结尾强化行动召唤",
      body: "把结尾改成「现在就打开你的浏览器试试」。",
    },
  ];
}

function buildGoldenQuotes(
  projectId: string,
): ScriptViewModel["goldenQuotes"] {
  void projectId;
  return canonicalDataset.scriptSections
    .filter((section) => section.sectionType === "golden_quote")
    .map((section) => ({
      id: section.id,
      text: section.content,
    }));
}

function buildVersions(
  projectId: string,
): ScriptViewModel["versions"] {
  void projectId;
  return canonicalDataset.artifactVersions
    .filter(
      (version) =>
        version.artifactId === "artifact-ainativebrowser-output-script" ||
        version.artifactId === "artifact-ainativebrowser-master-script",
    )
    .slice()
    .sort((a, b) => b.versionNumber - a.versionNumber)
    .map((version) => ({
      id: version.id,
      label: `${labelForArtifact(version.artifactId)} · v${version.versionNumber}`,
      createdAt: version.createdAt,
    }));
}

function labelForArtifact(artifactId: string): string {
  if (artifactId === "artifact-ainativebrowser-master-script") {
    return "主脚本";
  }
  if (artifactId === "artifact-ainativebrowser-output-script") {
    return "分镜脚本";
  }
  return "脚本";
}

function computeWordCount(sections: ReadonlyArray<ScriptSectionView>): number {
  return sections.reduce((total, section) => total + section.body.length, 0);
}
