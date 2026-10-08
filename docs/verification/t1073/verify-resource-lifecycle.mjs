// LED-055：通过实际消费者检查资源归属；全部使用隔离合成回执，不访问真实账号/模型/媒体。
import {spawn} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const groups=[
 ['contract',['--config','../docs/verification/t1073/worker/contract-vitest.config.mjs','src/internal/execution-worker.test.ts']],
 ['ai-worker',['src/execution/worker-runtime.test.ts','src/execution/transcribe-worker-run.test.ts','src/execution/transcribe-asr-run.test.ts','src/execution/transcribe-postprocess-run.test.ts','src/runtime/multimodal-whisper-local.test.ts','src/runtime/multimodal-whisper-local.cancel.test.ts']],
 ['backend',['src/modules/execution/worker-supervisor.memory.test.ts','src/modules/execution/worker-supervisor.test.ts','src/modules/execution/execution-stream.service.test.ts','src/modules/ai-runtime/automation-driver.test.ts','src/modules/intelligence/source-sync-runner.test.ts','src/application/scheduling/automation.test.ts']],
 ['frontend',['src/features/copilot/live-chat-session.test.ts','src/features/copilot/live-chat-session.consumer.test.tsx','src/features/copilot/chat-script-draft-card.test.tsx','src/features/copilot/chat-thesis-card.test.tsx','src/features/copilot/chat-publish-package-card.test.tsx','src/features/copilot/ai-copilot-interactions.test.tsx','src/features/draft-workbench/use-latest-script-review.test.tsx','src/features/intelligence/use-project-upgrade-queue.test.tsx','src/features/intelligence/intelligence-workbench-api.test.ts','src/components/resources/asset-preview-url.test.ts']],
 ['frontend',['src/server/chat-execution-stream.test.ts','src/server/persistence-client.lifecycle.test.ts','src/server/browser-host-dispose.test.ts']],
];
let failed=false;
for(const [workspace,files] of groups){
 const args=['--dir',workspace,'exec','vitest','run',...files,'--testTimeout','120000','--hookTimeout','120000','--retry','0'];
 console.log(`资源生命周期检查：pnpm ${args.join(' ')}`);
 // 内存探针写入历史证据文件；每次保留旧字节，将新观测输出到本次门日志后还原。
 const snapshots=workspace==='backend'?await Promise.all(['serial','parallel'].map(async mode=>{const file=path.join(root,`docs/verification/t1073/worker/ipc-memory-${mode}-observation.json`);return [file,await readFile(file)];})):[];
 let code;
 try{
  code=await new Promise((resolve,reject)=>{const child=spawn('pnpm',args,{cwd:root,stdio:'inherit',shell:false});child.once('error',reject);child.once('close',resolve);});
 }finally{
  for(const [file,bytes] of snapshots){
   const observed=await readFile(file);
   console.log(`${code===0?"本次内存观测":"失败后文件快照（可能仍是旧证据，不视为新观测）"} ${path.basename(file)}: ${observed.toString().trim()}`);
   await writeFile(file,bytes);
  }
 }
 if(code!==0){failed=true;console.error(`${workspace} 检查失败：exit=${code}`);}
}
process.exitCode=failed?1:0;
