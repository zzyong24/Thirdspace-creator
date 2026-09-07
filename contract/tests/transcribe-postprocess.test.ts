import {expect,it} from 'vitest';
import {workerPortSchema,workerPortInputSchemas,transcribePostprocessResultSchema,transcribePostprocessPreparationSchema,transcribePostprocessReservationSchema,transcribePostprocessIdentitySchema} from '../src/internal/execution-worker';
it('后处理六端口均有严格载荷边界',()=>{
 for(const port of ['prepareTranscribePostprocess','readTranscribePostprocess','saveTranscribePostprocess'] as const){expect(workerPortSchema.parse(port)).toBe(port);expect(workerPortInputSchemas[port].parse({awemeId:'one'})).toEqual({awemeId:'one'});expect(workerPortInputSchemas[port].safeParse({awemeId:'one',transcript:'伪造'}).success).toBe(false);}
 expect(workerPortInputSchemas.reserveTranscribePostprocess.safeParse({awemeId:'one',operationKey:'key',request:{},accountId:'forged'}).success).toBe(false);
 expect(workerPortInputSchemas.startTranscribePostprocess.parse({awemeId:'one',callId:'c'})).toEqual({awemeId:'one',callId:'c'});
 expect(workerPortInputSchemas.settleTranscribePostprocess.parse({awemeId:'one',callId:'c',status:'unknown'}).status).toBe('unknown');
});
it('恢复与预算跳过保留真实原文与原因',()=>{
 const result={applied:false as const,transcript:'原文',reason:'预算不足'};
 expect(transcribePostprocessPreparationSchema.parse({status:'restored',result})).toEqual({status:'restored',result});
 expect(transcribePostprocessReservationSchema.parse({status:'skipped',result})).toEqual({status:'skipped',result});
 expect(transcribePostprocessResultSchema.safeParse({applied:true,transcript:''}).success).toBe(false);
 expect(transcribePostprocessResultSchema.safeParse({applied:false,transcript:'原文'}).success).toBe(false);
});
it('未知调用只返回既有回执，不附带成功正文或新调用权',()=>{
 expect(transcribePostprocessReservationSchema.parse({callId:'c',status:'unknown'})).toEqual({callId:'c',status:'unknown'});
 expect(transcribePostprocessReservationSchema.safeParse({status:'skipped',result:{applied:false,transcript:'原文'}}).success).toBe(false);
});
it('冻结模型身份拒绝密钥与原始endpoint',()=>{
 const identity={schemaVersion:1,apiFormat:'openai_chat',model:'fixture',capability:'video.subtitles',baseUrlDigest:'sha256:'+'a'.repeat(64),customEndpoint:false};
 expect(transcribePostprocessIdentitySchema.safeParse(identity).success).toBe(true);
 expect(transcribePostprocessIdentitySchema.safeParse({...identity,token:'secret'}).success).toBe(false);
 expect(transcribePostprocessIdentitySchema.safeParse({...identity,baseUrl:'https://example.com'}).success).toBe(false);
});
