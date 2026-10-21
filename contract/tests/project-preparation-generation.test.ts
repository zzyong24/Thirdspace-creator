import {it,expect} from 'vitest';
import * as worker from '../src/internal/execution-worker';
import type {z} from 'zod';
const schema=()=> (worker as unknown as Record<string,z.ZodType>).projectPreparationGenerationTargetSchema!;
const source={kind:'project_artifact',projectId:'project',artifactId:'artifact',artifactVersion:1,contentHash:'sha256:'+'a'.repeat(64),title:null,authorName:null,url:null};
const target={ownerType:'project',projectId:'project',source,generationMode:'strategy_backed',transcript:{text:'来源正文',hash:source.contentHash}};
it('真实artifact与imported_text联合，不需要虚构item/transform/网址',()=>{
 expect(schema().parse(target)).toEqual(target);
 expect(schema().parse({...target,source:{kind:'imported_text',projectId:'project',intakeId:'intake',contentText:'来源正文',contentHash:source.contentHash,title:null,authorName:null,url:null}})).toMatchObject({source:{kind:'imported_text'}});
});
it('跨项目、缺真实版本、正文hash锚不同与不可信字段拒绝',()=>{
 for(const value of [{...target,projectId:'other'},{...target,source:{...source,artifactVersion:0}},{...target,transcript:{text:'来源正文',hash:'sha256:'+'b'.repeat(64)}},{...target,source:{...source,artifactId:undefined}},{...target,source:{...source,executionTaskId:'forged'}}])expect(schema().safeParse(value).success).toBe(false);
});
