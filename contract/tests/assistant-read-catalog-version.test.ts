import {expect,it} from "vitest";
import {assistantReadEndpoints,assistantReadEndpointsV1,assistantReadRequestSchema,assistantReadRequestSchemaV1,assistantReadCatalogs} from "../src/resources/assistant-system";
import {pagesOperations} from "../src/operations/pages";

it("T1397 组趋势读取只进入当前V2，冻结V1不能获得新分支",()=>{
 const request={kind:"pages.groupTrend.get",params:{groupId:"owned-group"}};
 expect(Object.hasOwn(assistantReadEndpointsV1,request.kind)).toBe(false);
 expect(assistantReadRequestSchemaV1.safeParse(request).success).toBe(false);
 expect(assistantReadEndpoints[request.kind]).toBe(pagesOperations.getGroupTrend);
 expect(assistantReadRequestSchema.parse(request)).toMatchObject(request);
});

it("T1397 冻结旧V2保留63端点与原生版本续窗，不接受后来趋势分支",()=>{
 const old=assistantReadCatalogs['2-before-group-trend'];
 expect(Object.keys(old.endpoints)).toHaveLength(63);expect(Object.keys(assistantReadCatalogs[1].endpoints)).toHaveLength(62);expect(Object.keys(assistantReadCatalogs[2].endpoints)).toHaveLength(64);
 const request={kind:'outputs.production.editor.get',params:{outputId:'owned-video'}};
 expect(old.inputSchema.parse({request,window:{offsetUtf16:12000,expectedRevision:1}})).toMatchObject({request,window:{offsetUtf16:12000,expectedRevision:1}});
 for(const invalid of [{request,window:{offsetUtf16:12000}},{request,window:{expectedRevision:1}},{request:{kind:'pages.groupTrend.get',params:{groupId:'owned-group'}}}])expect(old.inputSchema.safeParse(invalid).success).toBe(false);
 expect(assistantReadCatalogs[2].inputSchema.safeParse({request:{kind:'pages.groupTrend.get',params:{groupId:'owned-group'}}}).success).toBe(true);
});
