import { expect,it } from 'vitest';
import { intelligenceOperations as op } from '../src/operations/intelligence';
it('共享雷达接口允许组上下文省略账号，收藏采集仍需要真实collector',()=>{
 expect(op.listIntelligenceCollectors.query!.parse({})).toEqual({});
 expect(op.createIntelligenceCollection.body!.parse({name:'真实分类',idempotencyKey:'key'})).not.toHaveProperty('accountId');
 expect(op.previewIntelligenceWeb.body!.parse({url:'https://example.com',instruction:''})).not.toHaveProperty('accountId');
 expect(op.importDouyinShareItem.body!.parse({collectionId:null,shareInput:'https://v.douyin.com/real',idempotencyKey:'key'})).not.toHaveProperty('accountId');
 expect(()=>op.listIntelligenceFavoriteFolders.query!.parse({})).toThrow();
});
