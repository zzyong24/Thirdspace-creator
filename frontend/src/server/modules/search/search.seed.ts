import "server-only";
import type { SearchDocumentRow } from "./search.repository";

// Wave-1 search-index seed (plan open-question #4). SPEC §16 says "索引内容由拥有数据
// 的模块 service 提交" — the producer wiring lands in the Wave-2 modules' plans.
// Until then we derive the canonical user's SearchDocuments from the owned
// projects / knowledge / assets / publications so `/search` returns results now.
//
// Each document stores its denormalized result-card payload as JSON in `body`
// (the interim composer in search.transport.ts parses it; absent fields fall back
// to deterministic defaults). The derived `searchText` (`${title}\n${rawText}`
// lowercased+trimmed) is what ILIKE queries hit. DETERMINISTIC: ids/indexedAt are
// fixed (no Date.now / Math.random) so the seeded index is reproducible.

// Minimal structural shape of the canonical dataset slices this seed reads. We
// keep it loose (string indexers) so the seed never couples to the full domain
// types — it consumes only the fields it denormalizes.
interface CanonicalLike {
  user: { id: string };
  projects: ReadonlyArray<{
    id: string; title: string; brief: string; currentStage: string; progressPct: number;
  }>;
  knowledgeItems: ReadonlyArray<{ id: string; title: string; currentRevisionId: string }>;
  knowledgeRevisions: ReadonlyArray<{ id: string; knowledgeItemId: string; content?: string }>;
  assets: ReadonlyArray<{ id: string; name: string; assetType: string }>;
  publications: ReadonlyArray<{ id: string; platform: string; currentRevisionId: string | null }>;
  publicationRevisions: ReadonlyArray<{ id: string; title?: string }>;
}

function searchText(title: string, raw: string): string {
  return `${title}\n${raw}`.toLowerCase().trim();
}

export function buildCanonicalSearchDocuments(
  data: CanonicalLike,
  indexedAt: string,
): SearchDocumentRow[] {
  const userId = data.user.id;
  const rows: SearchDocumentRow[] = [];

  for (const p of data.projects) {
    rows.push({
      id: `searchdoc-seed-project-${p.id}`,
      userId,
      entityType: "project",
      entityId: p.id,
      title: p.title,
      body: JSON.stringify({
        stage: p.currentStage,
        progressPct: p.progressPct,
        snippet: p.brief,
      }),
      searchText: searchText(p.title, p.brief),
      embedding: [],
      indexedAt,
    });
  }

  for (const k of data.knowledgeItems) {
    const revision = data.knowledgeRevisions.find(
      (r) => r.knowledgeItemId === k.id,
    );
    const content = revision?.content ?? "";
    const excerpt = content.slice(0, 120);
    rows.push({
      id: `searchdoc-seed-knowledge-${k.id}`,
      userId,
      entityType: "knowledge",
      entityId: k.id,
      title: k.title,
      body: JSON.stringify({ excerpt, tags: [] }),
      searchText: searchText(k.title, content),
      embedding: [],
      indexedAt,
    });
  }

  for (const a of data.assets) {
    rows.push({
      id: `searchdoc-seed-asset-${a.id}`,
      userId,
      entityType: "asset",
      entityId: a.id,
      title: a.name,
      body: JSON.stringify({ assetType: a.assetType }),
      searchText: searchText(a.name, ""),
      embedding: [],
      indexedAt,
    });
  }

  for (const pub of data.publications) {
    const revision = data.publicationRevisions.find(
      (r) => r.id === pub.currentRevisionId,
    );
    const title = revision?.title ?? `${pub.platform} 内容`;
    rows.push({
      id: `searchdoc-seed-video-${pub.id}`,
      userId,
      entityType: "video",
      entityId: pub.id,
      title,
      body: JSON.stringify({ platform: pub.platform, durationLabel: "" }),
      searchText: searchText(title, ""),
      embedding: [],
      indexedAt,
    });
  }

  return rows;
}
