import {it,expect} from 'vitest';
import {workerPortInputSchemas,workerPortSchema} from '../src/internal/execution-worker';
it('每日零调用完成只接空载荷，Worker不能自报配额、账号或跳过理由',()=>{
 expect(workerPortSchema.parse('completeDailyTopicSkip')).toBe('completeDailyTopicSkip');
 expect(workerPortInputSchemas.completeDailyTopicSkip.parse({})).toEqual({});
 for(const value of [{accountId:'other'},{skipReason:'quota'},{observedCount:5}])expect(workerPortInputSchemas.completeDailyTopicSkip.safeParse(value).success).toBe(false);
});
it('每日正常完成只接受成功调用证据，不能改成任意候选写入',()=>{
 expect(workerPortInputSchemas.commitDailyTopicResult.parse({outcome:'succeeded',callId:'real-call',text:'{}'})).toEqual({outcome:'succeeded',callId:'real-call',text:'{}'});
 for(const value of [{outcome:'failed',callId:'real-call',text:'{}'},{outcome:'succeeded',callId:'real-call',text:'{}',candidateIds:['fake']}])expect(workerPortInputSchemas.commitDailyTopicResult.safeParse(value).success).toBe(false);
});
