import {and,asc,desc,eq,inArray,sql,type Db} from "@creatoros/backend";
import {assets,assetFiles} from "./assets.db-schema";
import {ConflictError} from "./assets.errors";
export type CacheTransaction=Parameters<Parameters<Db["transaction"]>[0]>[0];
type Snapshot={asset:typeof assets.$inferSelect;file:typeof assetFiles.$inferSelect};
const source=(file:Snapshot["file"]) => (file.mediaMetadata as Record<string,unknown>|null)?.sourceUrl;
/** 缓存来源和当前文件一次绑定，修复时重新锁定同一素材与文件。 */
export function createWebDocumentCacheRepository(db:Db){
 return {
  async find(userId:string,accountId:string,url:string):Promise<Snapshot|null>{
   const rows=await db.select({asset:assets,file:assetFiles}).from(assets).innerJoin(assetFiles,and(eq(assetFiles.id,assets.currentFileId),eq(assetFiles.assetId,assets.id))).where(and(eq(assets.userId,userId),eq(assets.accountId,accountId),eq(assets.assetType,"document"),inArray(assets.status,["pending","active"]),sql`${assetFiles.mediaMetadata}->>'sourceUrl' = ${url}`)).orderBy(desc(assets.createdAt),asc(assets.id)).limit(1);
   return rows.find(row=>source(row.file)===url)??null;
  },
  async confirm(snapshot:Snapshot,fullText:string,transaction?:CacheTransaction,signal?:AbortSignal){
   const work=async(tx:CacheTransaction)=>{
    signal?.throwIfAborted();
    const [asset]=await tx.select().from(assets).where(and(eq(assets.id,snapshot.asset.id),eq(assets.userId,snapshot.asset.userId),eq(assets.accountId,snapshot.asset.accountId!))).for("update");
    signal?.throwIfAborted();
    if(!asset || asset.assetType!=="document" || !["pending","active"].includes(asset.status) || asset.currentFileId!==snapshot.file.id)throw new ConflictError("缓存素材当前版本已改变，请重试读取");
    const [file]=await tx.select().from(assetFiles).where(and(eq(assetFiles.id,snapshot.file.id),eq(assetFiles.assetId,asset.id))).for("update");
    signal?.throwIfAborted();
    if(!file || source(file)!==source(snapshot.file) || file.storageKey!==snapshot.file.storageKey || file.checksum!==snapshot.file.checksum || file.fileSize!==snapshot.file.fileSize || file.mimeType!==snapshot.file.mimeType)throw new ConflictError("缓存文件来源或字节身份已改变，请重试读取");
    await tx.update(assetFiles).set({extractedText:fullText,extractStatus:"done"}).where(eq(assetFiles.id,file.id));
    signal?.throwIfAborted();
    return {assetId:asset.id,fileId:file.id,name:asset.name,fullText};
   };
   return transaction?work(transaction):db.transaction(work);
  },
 };
}
