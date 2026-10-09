import {spawnSync,execFileSync} from "node:child_process";
import {mkdirSync,readFileSync,writeFileSync,existsSync,mkdtempSync,statSync} from "node:fs";
import {resolve} from "node:path";
import {createHash} from "node:crypto";
import {tmpdir} from "node:os";

const root=process.cwd(),dir=resolve(root,"docs/verification/t1136");
const baseline=process.argv.includes("--baseline");
const paths=["frontend/src/components/ui/dialog.tsx","frontend/src/features/content-calendar/group-calendar-planning-control.tsx","frontend/src/features/content-calendar/content-calendar-view.tsx","frontend/src/components/media/asset-picker.tsx","frontend/src/components/shell/issue-feedback-dialog.tsx","frontend/tests/e2e/t1136-calendar-dialog-layout.spec.ts","docs/verification/t1136/run-layout-journey.mjs"];
const sha=()=>Object.fromEntries(paths.map(p=>[p,createHash("sha256").update(readFileSync(resolve(root,p))).digest("hex")]));
mkdirSync(dir,{recursive:true});const before=sha();
const args=["--dir","frontend","exec","playwright","test","tests/e2e/t1136-calendar-dialog-layout.spec.ts","--project=e2e","--retries=0"];
if(baseline)args.push("-g","四种窗口尺寸");
const start=new Date().toISOString(),tick=performance.now();
const env={...process.env,CREATOROS_TEST_PORT:"31436",CREATOROS_PLAYWRIGHT_BROWSER_CHANNEL:"chrome",CREATOROS_PLAYWRIGHT_DATA_ROOT:mkdtempSync(resolve(tmpdir(),"creatoros-t1136-")),CI:""};
// 三条串行测试最多600+720+600秒，加冷启动300秒与清理180秒余量。
const result=spawnSync("pnpm",args,{cwd:root,env,encoding:"utf8",timeout:2_400_000,maxBuffer:32*1024*1024});
const rawLog=(result.stdout??"")+(result.stderr??"");const phase=baseline?"baseline":"current";
const rawLogPath=resolve(env.CREATOROS_PLAYWRIGHT_DATA_ROOT,phase+"-journey-raw.log");
writeFileSync(rawLogPath,rawLog,{mode:0o600});
// SEMANTIC_BOUNDARY_ALLOW: 只机械遮蔽签名blob查询，不判断内容或改变命令结果。
const log=rawLog.replace(/(\/api\/v1\/blob\/[^\s?]+)\?[^\s]+/g,"$1?[SIGNED_QUERY_REDACTED]");
writeFileSync(resolve(dir,phase+"-journey.log"),log);
const record={schema:"creatoros-browser-journey/v1",task_id:"T-1136",head:execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim(),phase,surface:"browser",mode:"non-fixture",input:"fresh public synthetic group/project/account records",startedAt:start,finishedAt:new Date().toISOString(),elapsedSeconds:(performance.now()-tick)/1000,argv:["pnpm",...args],exitCode:result.status,signal:result.signal,error:result.error?.message??null,logSha256:createHash("sha256").update(log).digest("hex"),rawLogSha256:createHash("sha256").update(rawLog).digest("hex"),rawLogPath,sourceSha256:before,sourceAfter:sha(),retries:0,nativeApp:false,modelCalled:false,realPlatformCalled:false,humanViewed:false};
writeFileSync(resolve(dir,phase+"-journey.json"),JSON.stringify(record,null,2)+"\n");
if(record.exitCode!==0){process.stderr.write(log.slice(-7000));process.exit(result.status??1);}
if(JSON.stringify(record.sourceSha256)!==JSON.stringify(record.sourceAfter))throw Error("受测源码在浏览器验证期间变化");
for(const name of baseline?["layout-observation.json"]:["layout-observation.json","public-write-read-observation.json","shared-consumer-observation.json"]){
 const file=resolve(dir,name);
 if(!existsSync(file)||statSync(file).mtimeMs<Date.parse(start))throw Error("缺少本次实际浏览器证据 "+name);
}
if(!baseline){
 const layout=JSON.parse(readFileSync(resolve(dir,"layout-observation.json"),"utf8"));
 const publicWrite=JSON.parse(readFileSync(resolve(dir,"public-write-read-observation.json"),"utf8"));
 const shared=JSON.parse(readFileSync(resolve(dir,"shared-consumer-observation.json"),"utf8"));
 const captures=[...layout.viewports.map(c=>({...c,check_ids:["AC-LAYOUT"]})),...publicWrite.captures.map(c=>({...c,check_ids:["AC-WRITE-READ","AC-TARGET"]})),...shared.captures.map(c=>({...c,check_ids:["AC-SHARED"]}))].map(c=>({checkpoint:c.name,check_ids:c.check_ids,viewport:c.viewport,text:c.text}));
 writeFileSync(resolve(dir,"visible-copy.json"),JSON.stringify({schema:"frontend-visible-copy/v1",task_id:"T-1136",commit_sha:record.head,captures},null,2)+"\n");
}
console.log(JSON.stringify(record));
