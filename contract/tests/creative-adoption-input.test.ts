import {expect,it} from "vitest";
import {ENDPOINTS} from "../src";
it("采用公共协议接受每种严格 owner 前值，拒绝混合字段",()=>{
 const common={editedValue:"人工内容",clientRequestId:"adoption-request"};
 for(const expected of [
  {owner:"graphic_post",versionId:"v"},{owner:"wechat_article",versionId:"v"},{owner:"output_script",versionId:"v"},
  {owner:"publication",mode:"existing",publicationId:"p",revisionId:"r"},
  {owner:"publication",mode:"create",outputId:"o",platform:"douyin",expectedAbsent:true},
 ])expect(ENDPOINTS.adoptResult.body.safeParse({...common,expected}).success).toBe(true);
 expect(ENDPOINTS.adoptResult.body.safeParse({...common,expected:{owner:"graphic_post",versionId:"v",publicationId:"p"}}).success).toBe(false);
});
