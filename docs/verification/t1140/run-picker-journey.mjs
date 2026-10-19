import {spawnSync,execFileSync} from "node:child_process";
import {mkdirSync,readFileSync,writeFileSync,existsSync,mkdtempSync,statSync} from "node:fs";
import {resolve} from "node:path";
import {createHash} from "node:crypto";
import {tmpdir} from "node:os";

const root=process.cwd(),dir=resolve(root,"docs/verification/t1140");
const baseline=process.argv.includes("--baseline");
const diagnose=process.argv.includes("--cleanup-diagnosis");
const paths=["frontend/src/components/media/asset-picker.tsx","frontend/src/components/media/asset-media-preview.tsx","frontend/src/components/media/use-asset-picker-source.ts","frontend/src/features/creative-canvas/canvas-asset-picker.tsx","frontend/src/features/creative-canvas/canvas-editor.tsx","frontend/tests/e2e/t1140-picker-low-height.spec.ts","docs/verification/t1140/run-picker-journey.mjs"];
const sha=()=>Object.fromEntries(paths.map(p=>[p,createHash("sha256").update(readFileSync(resolve(root,p))).digest("hex")]));
mkdirSync(dir,{recursive:true});const before=sha();
const args=["--dir","frontend","exec","playwright","test","tests/e2e/t1140-picker-low-height.spec.ts","--project=e2e","--retries=0"];
if(baseline)args.push("-g","六种窗口");
const start=new Date().toISOString(),tick=performance.now();
const env={...process.env,CREATOROS_TEST_PORT:"31440",CREATOROS_PLAYWRIGHT_BROWSER_CHANNEL:"chrome",CREATOROS_PLAYWRIGHT_DATA_ROOT:mkdtempSync(resolve(tmpdir(),"creatoros-t1140-")),CI:""};
// 仅增加实际框架生命周期日志；不改停止行为、原超时、退出码或vendor。
if(diagnose){env.DEBUG="pw:test,pw:browser,pw:api";env.CREATOROS_PICKER_CLEANUP_DIAG="1";}
// 两条串行测试最多1200+900秒，加冷启动300秒、清理180秒与余量。
const result=spawnSync("pnpm",args,{cwd:root,env,encoding:"utf8",timeout:3_300_000,maxBuffer:32*1024*1024});
const rawLog=(result.stdout??"")+(result.stderr??"");const phase=diagnose?"cleanup-diagnosis":baseline?"baseline":"current";
const rawLogPath=resolve(env.CREATOROS_PLAYWRIGHT_DATA_ROOT,phase+"-journey-raw.log");
writeFileSync(rawLogPath,rawLog,{mode:0o600});
// SEMANTIC_BOUNDARY_ALLOW: 只机械遮蔽签名blob查询，不判断内容或改变命令结果。
const log=rawLog.replace(/(\/api\/v1\/blob\/[^\s?]+)\?[^\s]+/g,"$1?[SIGNED_QUERY_REDACTED]");
writeFileSync(resolve(dir,phase+"-journey.log"),log);
const record={schema:"creatoros-browser-journey/v1",task_id:"T-1140",head:execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim(),phase,surface:"browser",mode:"non-fixture",input:"fresh public synthetic group/canvas records and uploaded built-in portrait/landscape images",startedAt:start,finishedAt:new Date().toISOString(),elapsedSeconds:(performance.now()-tick)/1000,argv:["pnpm",...args],exitCode:result.status,signal:result.signal,error:result.error?.message??null,logSha256:createHash("sha256").update(log).digest("hex"),rawLogSha256:createHash("sha256").update(rawLog).digest("hex"),rawLogPath,sourceSha256:before,sourceAfter:sha(),retries:0,nativeApp:false,modelCalled:false,realPlatformCalled:false,humanViewed:false};
writeFileSync(resolve(dir,phase+"-journey.json"),JSON.stringify(record,null,2)+"\n");
if(record.exitCode!==0){process.stderr.write(log.slice(-7000));process.exit(result.status??1);}
if(JSON.stringify(record.sourceSha256)!==JSON.stringify(record.sourceAfter))throw Error("受测源码在浏览器验证期间变化");
for(const name of baseline?["layout-observation.json"]:["layout-observation.json","public-write-read-observation.json"]){
 const file=resolve(dir,name);
 if(!existsSync(file)||statSync(file).mtimeMs<Date.parse(start))throw Error("缺少本次实际浏览器证据 "+name);
}
if(!baseline){
 const layout=JSON.parse(readFileSync(resolve(dir,"layout-observation.json"),"utf8"));
 const publicWrite=JSON.parse(readFileSync(resolve(dir,"public-write-read-observation.json"),"utf8"));
 const captures=[...layout.captures.map(c=>({...c,check_ids:["AC-LAYOUT","AC-CANCEL"]})),...publicWrite.captures.map(c=>({...c,check_ids:["AC-EXACT","AC-SHARED","AC-STATES"]}))].map(c=>({checkpoint:c.name,check_ids:c.check_ids,viewport:c.viewport,text:c.text}));
 writeFileSync(resolve(dir,"visible-copy.json"),JSON.stringify({schema:"frontend-visible-copy/v1",task_id:"T-1140",commit_sha:record.head,captures},null,2)+"\n");
}
console.log(JSON.stringify(record));
