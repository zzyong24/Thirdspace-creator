import "server-only";

import { client } from "@/lib/contract-client.server";
import type { ScriptSectionView } from "@/types/view-models";

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

export async function loadScriptEditorSections(
  artifactId: string | null,
): Promise<ScriptSectionView[] | null> {
  if (!artifactId) return null;
  try {
    // artifacts.get exposes only currentVersionId (not the content), so read the
    // version list and pick the artifact's CURRENT version's content.
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
    const rows = Array.isArray(versions) ? versions : [];
    const current =
      rows.find((v) => v.id === artifact.currentVersionId) ??
      // Fallback: highest versionNumber if currentVersionId did not resolve.
      rows.slice().sort((a, b) => b.versionNumber - a.versionNumber)[0];
    if (!current) return null;

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
  } catch {
    return null;
  }
}
