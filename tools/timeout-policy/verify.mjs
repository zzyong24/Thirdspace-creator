#!/usr/bin/env node
// 机械执行边界检查，不做内容/创作语义判断。每组实际失败均保留非零退出。
import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const checks=[
 [process.execPath,['tools/timeout-policy/check.mjs']],
 [process.execPath,['--test','tools/timeout-policy/check.test.mjs','tools/timeout-policy/hyperframes.test.mjs']],
 ['pnpm',['--dir','contract','exec','vitest','run','tests/timeout-policy.test.ts','--retry=0','--testTimeout=120000','--hookTimeout=120000']],
 ['pnpm',['--dir','ai-worker','exec','vitest','run','src/execution/worker-timeout-policy.test.ts','src/runtime/browser/chromium-guard-lifecycle.test.ts','--retry=0','--testTimeout=120000','--hookTimeout=120000']],
 ['pnpm',['--dir','backend','exec','vitest','run','src/modules/execution/new-execution-budget.test.ts','src/modules/execution/run-execution-task.test.ts','src/modules/execution/execution-call-ledger.service.test.ts','--retry=0','--testTimeout=120000','--hookTimeout=120000']],
 ['pnpm',['--dir','frontend','exec','vitest','run','src/features/knowledge/knowledge-dump-zone.test.tsx','src/features/copilot/chat-thesis-card.test.tsx','src/features/draft-workbench/content-direction-actions.test.tsx','src/features/draft-workbench/script-review-gate.test.tsx','src/server/ai/search/search-browser.test.ts','src/server/ai/search/browser-search-fallback.test.ts','--retry=0','--testTimeout=120000','--hookTimeout=120000']],
 ['pnpm',['--dir','mcp-server','test','tests/cli.test.ts','--testTimeout=120000','--hookTimeout=120000']],
 [process.execPath,['--test','tools/windows-closure-rat/render-probe-policy.test.mjs','frontend/scripts/desktop/timeout-policy.node.mjs']],
];
let failed=false;
for(const [command,args] of checks){
 console.log(`验证：${command} ${args.join(' ')}`);
 const code=await new Promise((resolve,reject)=>{const child=spawn(command,args,{cwd:root,stdio:'inherit',shell:false});child.once('error',reject);child.once('close',resolve);});
 if(code!==0){failed=true;console.error(`该检查未通过：exit=${code}`);}
}
process.exitCode=failed?1:0;
