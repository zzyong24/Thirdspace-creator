import "server-only";

import { client as defaultClient } from "@/lib/contract-client.server";
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
    out.push({
      id,
      type: "body",
      heading: heading || "脚本段落",
      body,
      emphasis: false,
      startSeconds: null,
      endSeconds: null,
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
  /** REAL version history (newest-first) from artifacts.versions.list. */
  readonly versions: ScriptViewModel["versions"];
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

    const versions = rows
      .slice()
      .sort((a, b) => b.versionNumber - a.versionNumber)
      .map((v) => {
        const summary =
          typeof v.changeSummary === "string" && v.changeSummary.trim()
            ? ` · ${v.changeSummary.trim()}`
            : "";
        return {
          id: v.id,
          label: `脚本 · v${v.versionNumber}${summary}`,
          createdAt: typeof v.createdAt === "string" ? v.createdAt : "",
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

    return { sections, versions, outline, goldenQuotes };
  } catch {
    return null;
  }
}
