import {eq,inArray,type Db,projects as projectsTable,knowledgeItems as knowledgeItemsTable,knowledgeRevisions as knowledgeRevisionsTable,assets as assetsTable,publications as publicationsTable,publicationRevisions as publicationRevisionsTable} from "../index";
import {buildCanonicalSearchDocuments,rebuildSearchIndexSystem} from "../modules/search";

/** 启动时按真实源实体的账号重建当前用户派生索引，不读取其它用户的修订正文。 */
export async function rebuildOwnedSearchIndex(db:Db,userId:string,now:()=>string){
    const [dbProjects, dbKnowledge, dbKRevisions, dbAssets, dbPubs, dbPubRevs] =
      await Promise.all([
        db.select().from(projectsTable).where(eq(projectsTable.userId, userId)),
        db.select().from(knowledgeItemsTable).where(eq(knowledgeItemsTable.userId, userId)),
        db.select().from(knowledgeRevisionsTable).where(inArray(knowledgeRevisionsTable.knowledgeItemId,db.select({id:knowledgeItemsTable.id}).from(knowledgeItemsTable).where(eq(knowledgeItemsTable.userId,userId)))),
        db.select().from(assetsTable).where(eq(assetsTable.userId, userId)),
        db.select().from(publicationsTable).where(eq(publicationsTable.userId, userId)),
        db.select().from(publicationRevisionsTable).where(inArray(publicationRevisionsTable.publicationId,db.select({id:publicationsTable.id}).from(publicationsTable).where(eq(publicationsTable.userId,userId)))),
      ]);
    const ownedKnowledgeIds = new Set(dbKnowledge.map((row) => row.id));
    const ownedPublicationIds = new Set(dbPubs.map((row) => row.id));
    const rebuildRows = buildCanonicalSearchDocuments(
      {
        user: { id: userId },
        projects: dbProjects.map((p) => ({
          id: p.id,
          title: p.title,
          brief: p.brief ?? "",
          currentStage: p.currentStage,
          progressPct: p.progressPct ?? 0,
          accountId: p.accountId,
          groupId: p.groupId, // [T-332 S2] 源行派生号
        })),
        knowledgeItems: dbKnowledge.map((k) => ({
          id: k.id,
          title: k.title,
          currentRevisionId: k.currentRevisionId ?? "",
          accountId: k.accountId,
          groupId: k.groupId, // [T-332 S2] 源行派生号
        })),
        knowledgeRevisions: dbKRevisions.filter((r) => ownedKnowledgeIds.has(r.knowledgeItemId)).map((r) => ({
          id: r.id,
          knowledgeItemId: r.knowledgeItemId,
          content: r.content ?? "",
        })),
        assets: dbAssets.filter(a=>a.status==="active").map((a) => ({
          id: a.id,
          name: a.name,
          assetType: a.assetType,
          accountId: a.accountId,
          groupId: a.groupId, // [T-332 S2] 源行派生号
        })),
        publications: dbPubs.map((pub) => ({
          id: pub.id,
          platform: pub.platform,
          currentRevisionId: pub.currentRevisionId ?? null,
          accountId: pub.accountId, // [T-332 S2] 源行派生号
        })),
        publicationRevisions: dbPubRevs.filter((r) => ownedPublicationIds.has(r.publicationId)).map((r) => ({
          id: r.id,
          title: r.title ?? "",
        })),
      },
      now(),
    );
    await rebuildSearchIndexSystem(db, userId, rebuildRows);
}
