import {spawnSync,execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,copyFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
const root=process.cwd(),base=path.join(root,'docs/verification/t1105');
const result=spawnSync('pnpm',['--dir','frontend','exec','playwright','test','tests/e2e/shared-resource-lifecycle.spec.ts','--project=e2e'],{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024,env:{...process.env,CREATOROS_TEST_PORT:'31415',CREATOROS_PLAYWRIGHT_BROWSER_CHANNEL:'chrome'}});
writeFileSync(path.join(base,'journey.log'),(result.stdout??'')+(result.stderr??''));
if(result.status!==0){process.stderr.write((result.stdout??'')+(result.stderr??''));process.exit(result.status??1);}
const captures=JSON.parse(readFileSync(path.join(base,'resource-copy.json'),'utf8'));
writeFileSync(path.join(base,'visible-copy.json'),JSON.stringify({schema:'frontend-visible-copy/v1',task_id:'T-1105',commit_sha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),captures},null,2)+'\n');
const pictures=path.join(base,'screenshots');mkdirSync(pictures,{recursive:true});
for(const name of readdirSync(path.join(root,'frontend/test-results'))){if(!name.startsWith('e2e-shared-resource-'))continue;const dir=path.join(root,'frontend/test-results',name);for(const file of readdirSync(dir)){if(file.startsWith('t1105-')&&file.endsWith('.png'))copyFileSync(path.join(dir,file),path.join(pictures,file));}}
process.stdout.write('T1105：真实读取、刷新返回、失败恢复和两视口旅程通过。\n');
