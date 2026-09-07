import { beforeAll, afterAll, it, expect } from 'vitest';
import { createDb, type Db } from '@creatoros/backend';
import { createExecutionTranscribePostprocessService } from './execution-transcribe-postprocess.service';
let db: Db, close: () => Promise<void>;
beforeAll(async () => { const opened = await createDb(); db = opened.db; close = () => opened.client.close(); });
afterAll(async () => { await close?.(); });
it('后处理端口绑定原任务，不接受伪造执行', async () => {
 const service = createExecutionTranscribePostprocessService(db, {budget:{maxCalls:20,maxTokens:100000,deadlineMs:60000},resolveModelSpec:async()=>null,readContext:async()=>({})});
 await expect(service.prepare({executionTaskId:'absent',attempt:1,fenceToken:'fixture'}, {awemeId:'one'})).rejects.toThrow();
});
