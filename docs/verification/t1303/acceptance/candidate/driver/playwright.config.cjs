"use strict";
const fs=require("node:fs"),path=require("node:path"),{createRequire}=require("node:module");
const task=process.env.T1300_ACCEPTANCE_TASK,moduleName=process.env.T1300_MODULE,run=process.env.T1300_RUN_NAME;
if(!process.env.T1300_SESSION||!["T-1301","T-1302","T-1303"].includes(task)||!["a","b","c"].includes(moduleName)||!run||!/^[a-z0-9-]+$/.test(run))throw Error("EXPLICIT_CHILD_ACCEPTANCE_SESSION_MODULE_RUN_REQUIRED");
const s=JSON.parse(fs.readFileSync(process.env.T1300_SESSION,"utf8")),b=JSON.parse(fs.readFileSync(s.candidateBinding,"utf8"));
if(s.task!=="T-1300"||b.schema!=="t1300-production-candidate/v1")throw Error("SESSION_BINDING_REQUIRED");
const {defineConfig}=createRequire(path.join(b.sourceRoot,"frontend/package.json"))("@playwright/test");
const taskRoot=path.join(b.sourceRoot,"docs/verification",task.toLowerCase().replace("-",""),"acceptance");
const runRoot=path.join(taskRoot,"runs",run,moduleName);fs.mkdirSync(runRoot,{recursive:true,mode:0o700});
module.exports=defineConfig({testDir:path.join(taskRoot,"public",moduleName),testMatch:/.*\.spec\.(?:ts|js|cjs|mjs)$/,fullyParallel:false,workers:1,retries:0,timeout:1800000,expect:{timeout:120000},outputDir:path.join(runRoot,"artifacts"),reporter:[["line"],["json",{outputFile:path.join(runRoot,"result.json")}]],use:{baseURL:s.baseURL,actionTimeout:120000,navigationTimeout:300000,extraHTTPHeaders:{"x-creatoros-handshake":s.handshake},trace:"off",video:"off",screenshot:"only-on-failure",viewport:{width:1366,height:900}}});
// 仅复用已启动candidate；无webServer/dev启动；任务声明可保更长完整执行预算。
