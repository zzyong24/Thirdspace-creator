import {expect,it} from "vitest";
import {assistantReadEndpoints,assistantReadEndpointsV1,assistantReadRequestSchema,assistantReadRequestSchemaV1} from "../src/resources/assistant-system";
import {pagesOperations} from "../src/operations/pages";

it("T1397 组趋势读取只进入当前V2，冻结V1不能获得新分支",()=>{
 const request={kind:"pages.groupTrend.get",params:{groupId:"owned-group"}};
 expect(Object.hasOwn(assistantReadEndpointsV1,request.kind)).toBe(false);
 expect(assistantReadRequestSchemaV1.safeParse(request).success).toBe(false);
 expect(assistantReadEndpoints[request.kind]).toBe(pagesOperations.getGroupTrend);
 expect(assistantReadRequestSchema.parse(request)).toMatchObject(request);
});
