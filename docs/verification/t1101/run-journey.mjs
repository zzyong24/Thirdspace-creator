import {spawnSync,execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,copyFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
const root=process.cwd(),base=path.join(root,'docs/verification/t1101');
const result=spawnSync('pnpm',['--dir','frontend','exec','playwright','test','tests/e2e/creative-canvas.spec.ts','--project=e2e','-g','T-1101'],{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024,env:{...process.env,CREATOROS_TEST_PORT:'31411',CREATOROS_PLAYWRIGHT_BROWSER_CHANNEL:'chrome'}});
writeFileSync(path.join(base,'journey.log'),(result.stdout??'')+(result.stderr??''));
if(result.status!==0){process.stderr.write((result.stdout??'')+(result.stderr??''));process.exit(result.status??1);}
const captures=['canvas-copy.json','binding-copy.json'].flatMap(name=>JSON.parse(readFileSync(path.join(base,name),'utf8')));
writeFileSync(path.join(base,'visible-copy.json'),JSON.stringify({schema:'frontend-visible-copy/v1',task_id:'T-1101',commit_sha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),captures},null,2)+'\n');
const pictures=path.join(base,'screenshots');mkdirSync(pictures,{recursive:true});
for(const name of readdirSync(path.join(root,'frontend/test-results'))){if(!name.includes('T-1101'))continue;const dir=path.join(root,'frontend/test-results',name);for(const file of readdirSync(dir)){if(file.startsWith('t1101-')&&file.endsWith('.png'))copyFileSync(path.join(dir,file),path.join(pictures,file));}}
process.stdout.write('T1101：两条浏览器旅程通过；实际可见文案与截图已保存。\n');
