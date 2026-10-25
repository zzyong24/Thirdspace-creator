import test from 'node:test';
import assert from 'node:assert/strict';
import {validateArchiveGuardContext,archiveGuardArgs} from './run-archive-guard.mjs';
const original={...process.env};
function changed(changes,fn){
 const previous={...process.env};
 try{for(const [key,value]of Object.entries(changes)){if(value===undefined)delete process.env[key];else process.env[key]=value;}fn();}
 finally{for(const key of Object.keys(process.env))if(!(key in previous))delete process.env[key];Object.assign(process.env,previous);}
}
test('本轮真实owned随机端口可准入，不等于PG业务回归已执行',()=>{
 assert.ok(original.CREATOROS_OWNED_PG_MARKER,'须由本轮owned PG驱动执行，不能缺环境skip');
 const result=validateArchiveGuardContext();assert.ok(result.port>1024);assert.ok(![5432,55422].includes(result.port));assert.equal(result.nonce,original.CREATOROS_OWNED_PG_NONCE);
});
test('缺marker和错误nonce继续在启动vitest前拒绝',()=>{
 changed({CREATOROS_OWNED_PG_MARKER:undefined},()=>assert.throws(validateArchiveGuardContext,/T1246_ENV_NOT_OWNED_PG/));
 changed({CREATOROS_OWNED_PG_NONCE:'0'.repeat(32)},()=>assert.throws(validateArchiveGuardContext,/T1246_ENV_NOT_OWNED_PG/));
});
test('旧固定端口和不同实例URL在启动vitest前拒绝',()=>{
 const u=new URL(original.CREATOROS_TEST_POSTGRES_URL);
 for(const port of ['5432','55422',String(Number(u.port)+1)]){const other=new URL(u);other.port=port;changed({CREATOROS_ISOLATED_PG_URL:other.href},()=>assert.throws(validateArchiveGuardContext,/T1246_ENV_NOT_OWNED_PG/));}
});
test('不允许丢第二URL或绕向未登记库',()=>{
 changed({CREATOROS_ISOLATED_PG_URL:undefined},()=>assert.throws(validateArchiveGuardContext,/显式隔离PG配置/));
 const other=new URL(original.CREATOROS_TEST_POSTGRES_URL);other.pathname='/unregistered';changed({CREATOROS_ISOLATED_PG_URL:other.href},()=>assert.throws(validateArchiveGuardContext,/T1246_ENV_NOT_OWNED_PG/));
});
test('原三个目标及参数完全保持，不偷换成准入单测',()=>{
 assert.deepEqual(archiveGuardArgs,['-C','backend','exec','vitest','run','src/integration/startup-group-collectors.postgres.integration.test.ts','src/modules/execution/execution-lease.service.test.ts','src/modules/execution/execution-call-ledger.service.test.ts','--maxWorkers=2']);
});
