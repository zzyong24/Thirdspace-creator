import {spawnSync,execFileSync} from "node:child_process";
import {mkdirSync,readFileSync,writeFileSync,mkdtempSync,statSync} from "node:fs";
import {resolve} from "node:path";
import {createHash} from "node:crypto";
import {tmpdir} from "node:os";

const root=process.cwd(),dir=resolve(root,"docs/verification/t1149");
const paths=["frontend/src/features/creative-canvas/cover-aspect-ratio-labels.ts","frontend/src/features/creative-canvas/canvas-editor.tsx","frontend/src/features/creative-canvas/canvas-template-library.tsx","frontend/src/features/creative-canvas/canvas-editor.test.tsx","frontend/src/features/creative-canvas/canvas-template-library.test.tsx","frontend/tests/e2e/t1149-cover-aspect-group.spec.ts","docs/verification/t1149/run-aspect-journey.mjs"];
const sha=()=>Object.fromEntries(paths.map(p=>[p,createHash("sha256").update(readFileSync(resolve(root,p))).digest("hex")]));
mkdirSync(dir,{recursive:true});const before=sha(),startedAt=new Date().toISOString(),tick=performance.now();
const args=["--dir","frontend","exec","playwright","test","tests/e2e/t1149-cover-aspect-group.spec.ts","--project=e2e","--retries=0"];
const env={...process.env,CREATOROS_TEST_PORT:"31449",CREATOROS_PLAYWRIGHT_BROWSER_CHANNEL:"chrome",CREATOROS_PLAYWRIGHT_DATA_ROOT:mkdtempSync(resolve(tmpdir(),"creatoros-t1149-")),CI:""};
// 两例各900秒，覆盖完整冷启动/串行交互和清理余量；不缩短任何真实消费者等待。
const result=spawnSync("pnpm",args,{cwd:root,env,encoding:"utf8",timeout:3_300_000,maxBuffer:32*1024*1024});
const raw=(result.stdout??"")+(result.stderr??""),rawLogPath=resolve(env.CREATOROS_PLAYWRIGHT_DATA_ROOT,"aspect-journey-raw.log");writeFileSync(rawLogPath,raw,{mode:0o600});
// SEMANTIC_BOUNDARY_ALLOW: 仅遮蔽blob签名查询，保原命令结果和原私有日志。
const log=raw.replace(/(\/api\/v1\/blob\/[^\s?]+)\?[^\s]+/g,"$1?[SIGNED_QUERY_REDACTED]");writeFileSync(resolve(dir,"current-journey.log"),log);
const record={schema:"creatoros-browser-journey/v1",task_id:"T-1149",head:execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim(),surface:"browser",mode:"non-fixture",input:"fresh public synthetic group/project/canvas records and uploaded built-in illustrative images; declared capability and one save-error response fixtures",startedAt,finishedAt:new Date().toISOString(),elapsedSeconds:(performance.now()-tick)/1000,argv:["pnpm",...args],exitCode:result.status,signal:result.signal,error:result.error?.message??null,logSha256:createHash("sha256").update(log).digest("hex"),rawLogSha256:createHash("sha256").update(raw).digest("hex"),rawLogPath,sourceSha256:before,sourceAfter:sha(),retries:0,nativeApp:false,modelCalled:false,realPlatformCalled:false,humanViewed:false};
writeFileSync(resolve(dir,"current-journey.json"),JSON.stringify(record,null,2)+"\n");
if(record.exitCode!==0){process.stderr.write(log.slice(-7000));process.exit(result.status??1);}
if(JSON.stringify(before)!==JSON.stringify(record.sourceAfter))throw Error("受测源码在本轮浏览器期间变化");
const observations=["aspect-public-observation.json","capability-public-observation.json"].map(name=>{const path=resolve(dir,name);if(statSync(path).mtimeMs<Date.parse(startedAt))throw Error("缺少本轮公开交互观察 "+name);return JSON.parse(readFileSync(path,"utf8"));});
writeFileSync(resolve(dir,"visible-copy.json"),JSON.stringify({schema:"frontend-visible-copy/v1",task_id:"T-1149",commit_sha:record.head,captures:observations.flatMap(o=>o.captures).map(c=>({checkpoint:c.name,check_ids:c.check_ids,viewport:c.viewport,text:c.text}))},null,2)+"\n");
console.log(JSON.stringify(record));
