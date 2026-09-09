import { expect, it, vi } from "vitest";
import type { RequestContext } from "@creatoros/contract";
import { readProjectListCoverIds } from "./project-list-covers";
const ctx = {userId:'user',accountId:'account',source:'user'} as RequestContext;
function fixture() {
 const ports={
 projects:{listOutputRefsByProjects:vi.fn(async(c:RequestContext)=>c.accountId==='account'?[{projectId:'p1',outputId:'o1'},{projectId:'p2',outputId:'o2'}]:[])},
 publishing:{
 listPublicationsByOutputIds:vi.fn(async()=>[
 {id:'old',contentOutputId:'o1',createdAt:'2026-01-01',currentRevisionId:'r-old'},
 {id:'new',contentOutputId:'o1',createdAt:'2026-03-01',currentRevisionId:'r-new'},
 {id:'stale',contentOutputId:'o2',createdAt:'2026-04-01',currentRevisionId:'r-selected'},
 ]),
 listCurrentRevisionSummariesByPublicationIds:vi.fn(async()=>[
 {publicationId:'new',revisionId:'r-new',coverAssetId:'cover-new'},
 {publicationId:'old',revisionId:'r-old',coverAssetId:'cover-old'},
 {publicationId:'stale',revisionId:'r-historical',coverAssetId:'wrong-cover'},
 ]),
 }};
 return {ports,typed:ports as unknown as Parameters<typeof readProjectListCoverIds>[2]};
}
it('封面三次批量端口，最新发布且必须命中当前版本',async()=>{
 const {ports,typed}=fixture();
 expect(await readProjectListCoverIds(ctx,['p1','p2','missing'],typed)).toEqual({p1:'cover-new',p2:null,missing:null});
 expect(ports.projects.listOutputRefsByProjects).toHaveBeenCalledExactlyOnceWith(ctx,['p1','p2','missing']);
 expect(ports.publishing.listPublicationsByOutputIds).toHaveBeenCalledExactlyOnceWith(ctx,['o1','o2']);
 expect(ports.publishing.listCurrentRevisionSummariesByPublicationIds).toHaveBeenCalledExactlyOnceWith(ctx,['old','new','stale']);
});
it('空集零调用；跨账号无法继承另一请求封面',async()=>{
 const {ports,typed}=fixture();
 expect(await readProjectListCoverIds(ctx,[],typed)).toEqual({});
 expect(ports.projects.listOutputRefsByProjects).not.toHaveBeenCalled();
 expect(await readProjectListCoverIds({...ctx,accountId:'other'},['p1'],typed)).toEqual({p1:null});
 expect(ports.publishing.listPublicationsByOutputIds).not.toHaveBeenCalled();
});
it('不吞权限错误，由页面处理可选封面读取失败',async()=>{
 const {ports,typed}=fixture();ports.projects.listOutputRefsByProjects.mockRejectedValue(new Error('OWNERSHIP'));
 await expect(readProjectListCoverIds(ctx,['p1'],typed)).rejects.toThrow('OWNERSHIP');
 expect(ports.publishing.listPublicationsByOutputIds).not.toHaveBeenCalled();
});
