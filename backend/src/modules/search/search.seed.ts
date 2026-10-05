import { eq, type Db } from "@creatoros/backend";
import { searchDocuments } from "./search.db-schema";
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
// [T-332 S2 · ISO-06 系统路径] 各源投影 accountId **必填**:源实体行(projects/
// knowledge_items/assets/publications)自 S1 起 account_id NOT NULL,派生
// search_documents 的号直接由源行派生(不经 ctx.accountId、不落 null)。调用方
// (persistence-client 启动重建)从 DB 真值行透传 row.accountId。
interface CanonicalLike {
  user: { id: string };
  projects: ReadonlyArray<{
    id: string; title: string; brief: string; currentStage: string; progressPct: number; accountId: string | null; groupId?: string | null;
  }>;
  knowledgeItems: ReadonlyArray<{ id: string; title: string; currentRevisionId: string; accountId: string | null; groupId?: string | null }>;
  knowledgeRevisions: ReadonlyArray<{ id: string; knowledgeItemId: string; content?: string }>;
  assets: ReadonlyArray<{ id: string; name: string; assetType: string; accountId: string | null; groupId?: string | null }>;
  publications: ReadonlyArray<{ id: string; platform: string; currentRevisionId: string | null; accountId: string | null; groupId?: string | null }>;
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
      accountId: p.accountId,
      groupId: p.groupId ?? null, // [T-332 S2] 派生索引承源实体的号(源行 NOT NULL)
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
      accountId: k.accountId,
      groupId: k.groupId ?? null, // [T-332 S2] 派生索引承源实体的号(源行 NOT NULL)
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
      accountId: a.accountId,
      groupId: a.groupId ?? null, // [T-332 S2] 派生索引承源实体的号(源行 NOT NULL)
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
      accountId: pub.accountId,
      groupId: pub.groupId ?? null, // [T-332 S2] 派生索引承源实体的号(publications 行 NOT NULL)
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

// [T-332 S2 · ISO-06 系统路径] 启动全量重建(显式 *System 命名):user 级整删该用户的
// 全部派生索引文档,再把 buildCanonicalSearchDocuments 投影出的行(每行 accountId 由
// **源实体行**派生,跨号各归各号)整批重播。这是唯一允许不经 ctx.accountId 按号门的
// 搜索写路径 —— 它不是「无号退化全量」,而是「逐行自带号」的多号重建;经 ctx 的业务
// 读写(SearchService)一律 requireAccountId strict。幂等:先删后插,重跑结果一致。
export async function rebuildSearchIndexSystem(
  db: Db,
  userId: string,
  rows: SearchDocumentRow[],
): Promise<void> {
  await db.delete(searchDocuments).where(eq(searchDocuments.userId, userId));
  // 防御:只重播该 user 的行(调用方本就按 user 投影;越界行直接丢弃,不静默落别家)。
  const owned = rows.filter((r) => r.userId === userId);
  if (owned.length > 0) {
    await db.insert(searchDocuments).values(owned);
  }
}
