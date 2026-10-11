import {spawnSync,execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,copyFileSync,readdirSync,openSync,closeSync,existsSync} from 'node:fs';
import {resolve,join,relative} from 'node:path';
import {createHash} from 'node:crypto';

const root=resolve(import.meta.dirname,'../../..');
const evidence=join(root,'docs/verification/t1220');
const runDir=join(evidence,`run-${Date.now()}-${process.pid}`);
mkdirSync(runDir,{recursive:true});
// 仅保存本次会被自动截图夹具覆盖的历史图，不改变结果或断言。
const gallery=join(root,'docs/verification/t1207'),index=join(gallery,'scenario-index.ndjson');
if(existsSync(index)){
 copyFileSync(index,join(runDir,'before-scenario-index.ndjson'));
 const rows=readFileSync(index,'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
 for(const row of rows){
  if(row.title!=='T-994 作品素材入口、项目画布过滤与安全返回'||!row.screenshot)continue;
  const source=resolve(gallery,row.screenshot);if(!existsSync(source))continue;
  const name=createHash('sha256').update(readFileSync(source)).digest('hex').slice(0,16)+'.png';
  copyFileSync(source,join(runDir,name));row.screenshot=relative(gallery,join(runDir,name));
 }
 writeFileSync(index,rows.map(row=>JSON.stringify(row)).join('\n')+'\n');
}
function run(args,name,extraEnv={}){
 const fd=openSync(join(runDir,name),'w');
 const result=spawnSync('pnpm',args,{cwd:root,env:{...process.env,...extraEnv},stdio:['ignore',fd,fd]});
 closeSync(fd);
 if(result.error)throw result.error;
 if(result.status!==0){console.error(`${name} 实际退出 ${result.status}，日志 ${join(runDir,name)}`);process.exit(result.status??1);}
}
run(['--dir','frontend','exec','vitest','run','src/features/creative-canvas/canvas-editor.test.tsx','src/components/media/asset-picker.test.tsx','--testTimeout=120000','--hookTimeout=120000','--retry=0'],'components.log');
run(['--dir','frontend','exec','playwright','test','--config','../docs/verification/t1208/budget-recheck.config.ts','--project=e2e','tests/e2e/creative-canvas.spec.ts','--grep','作品素材入口、项目画布过滤与安全返回','--workers=1','--retries=0','--output',join(runDir,'browser'),'--trace','retain-on-failure'],'browser.log',{CREATOROS_TEST_PORT:'3904'});
const found=readdirSync(join(runDir,'browser'),{recursive:true}).find(file=>file.endsWith('t1220-upload-result.json'));
if(!found)throw Error('浏览器未写出实际公共回读证据');
const observation=JSON.parse(readFileSync(join(runDir,'browser',found),'utf8'));
if(observation.commit_sha!==execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim())throw Error('验收期间代码版本改变');
writeFileSync(join(runDir,'observation.json'),JSON.stringify(observation,null,2)+'\n');
writeFileSync(join(evidence,'last-run.json'),JSON.stringify({runDir:relative(root,runDir),exitCode:0,commitSha:observation.commit_sha},null,2)+'\n');
console.log(`T1220 原保存、上传导航、返回刷新及组件保护通过；证据 ${relative(root,runDir)}`);
