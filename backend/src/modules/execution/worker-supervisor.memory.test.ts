import { execFile } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { beforeAll, expect, it } from 'vitest';
import {createWorkerSupervisor} from './worker-supervisor';
// 复用 Worker 已声明的构建依赖，编译输出只落临时目录。
const {build} = createRequire(path.resolve('../ai-worker/package.json'))('esbuild');
let fixture: string, probe: string, replay: string, legacy: string;
beforeAll(async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 't1073-ipc-'));
  fixture = path.join(dir, 'fixture.cjs'); probe = path.join(dir, 'probe.cjs');
  replay=path.join(dir,'replay.cjs');legacy=path.join(dir,'legacy.cjs');
  for (const [entry, outfile] of [['ipc-fixture.ts', fixture], ['ipc-memory-probe.ts', probe]]) await build({entryPoints: [path.resolve('../docs/verification/t1073/worker', entry!)], outfile, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent'});
  for(const [outfile,isLegacy] of [[replay,false],[legacy,true]])await build({entryPoints:[path.resolve('../docs/verification/t1073/worker/ipc-replay-fixture.ts')],outfile,bundle:true,platform:'node',format:'cjs',define:{LEGACY:String(isLegacy)},logLevel:'silent'});
});
it.each([false,true])('私有回执协议 legacy=%s：在途重投一次 invoke、陈旧 fence/确认与乱序不能重做副作用，大音频完整传递',async isLegacy=>{
  let invokes=0,received!:(data:Record<string,unknown>)=>void;
  const observation=new Promise<Record<string,unknown>>(resolve=>{received=resolve;});
  const supervisor=createWorkerSupervisor({entryPath:isLegacy?legacy:replay,ports:{async validate(){},async invoke(){
    invokes++;await new Promise(resolve=>setTimeout(resolve,25));return {bytes:Buffer.alloc(8*1024*1024,7)};
  }},onText(_ref,text){received(JSON.parse(text));}});
  const execution={executionTaskId:'synthetic-replay',attempt:1,fenceToken:'owned'};
  const running=supervisor.run(execution,Date.now()+120000);
  try{
    const result=await observation;
    expect(result).not.toHaveProperty('error');expect(result.byteLength).toBe(8*1024*1024);
    if(isLegacy){expect(result).toMatchObject({legacy:true,replies:3});expect(invokes).toBe(1);}
    else{expect(invokes).toBe(3);expect(result).toMatchObject({legacy:false,thirdOk:true,errors:['IPC_RECEIPT_CONSUMED','IPC_REQUEST_ID_MISMATCH','IPC_SEQUENCE_INVALID','IPC_RECEIPT_CONSUMED']});}
    supervisor.cancel(execution);expect(await running).toBe('cancelled');
  }finally{await supervisor.stop();}
});
it.each(['serial','parallel'])('实际 supervisor 与 Worker %s 消费 100 份音频，丢确认和同请求重投不积累历史字节、不重复 invoke', async mode => {
  const {stdout} = await promisify(execFile)(process.execPath, ['--expose-gc', probe, fixture, mode], {timeout: 120000});
  await writeFile(path.resolve(`../docs/verification/t1073/worker/ipc-memory-${mode}-observation.json`), stdout);
  const rows = JSON.parse(stdout) as {label: string; returnedBuffers: number; liveBuffers: number;firstCompletedAudio:number;lastCompletedAudio:number}[];
  expect(rows.at(-1)).toMatchObject({returnedBuffers: 100, liveBuffers: 0});
  for (const row of rows.filter(row => row.label.startsWith('running'))) expect(row.liveBuffers).toBeLessThanOrEqual(1);
  if(mode==='parallel')expect(rows.at(-1)!.firstCompletedAudio).toBeGreaterThan(rows.at(-1)!.lastCompletedAudio);
});
