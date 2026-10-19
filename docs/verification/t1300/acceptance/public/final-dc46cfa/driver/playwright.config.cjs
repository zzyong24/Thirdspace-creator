"use strict";
const fs=require("node:fs"),path=require("node:path"),{createRequire}=require("node:module");
if(!process.env.T1300_SESSION||process.env.T1300_ACCEPTANCE_TASK!=="T-1300"||process.env.T1300_MODULE!=="b-config"||process.env.T1300_RUN_NAME!=="final-dc46cfa")throw Error("EXPLICIT_PARENT_CONFIG_WINDOW_REQUIRED");
const s=JSON.parse(fs.readFileSync(process.env.T1300_SESSION,"utf8")),b=JSON.parse(fs.readFileSync(s.candidateBinding,"utf8"));
if(s.task!=="T-1300"||b.schema!=="t1300-production-candidate/v1"||b.sourceHead!=="dc46cfa700ec9c9cbada47fb76237d0b50d10a67")throw Error("PARENT_CANDIDATE_BINDING_REQUIRED");
const {defineConfig}=createRequire(path.join(b.sourceRoot,"frontend/package.json"))("@playwright/test");
const runRoot=path.join(b.sourceRoot,"docs/verification/t1300/acceptance/runs/final-dc46cfa/b-config");fs.mkdirSync(runRoot,{recursive:true,mode:0o700});
module.exports=defineConfig({testDir:path.join(__dirname,"../b-config"),testMatch:/.*\.spec\.(?:ts|js|cjs|mjs)$/,fullyParallel:false,workers:1,retries:0,timeout:1800000,expect:{timeout:120000},outputDir:path.join(runRoot,"artifacts"),reporter:[["line"],["json",{outputFile:path.join(runRoot,"result.json")}]],use:{baseURL:s.baseURL,actionTimeout:120000,navigationTimeout:300000,extraHTTPHeaders:{"x-creatoros-handshake":s.handshake},trace:"off",video:"off",screenshot:"only-on-failure",viewport:{width:1366,height:900}}});
// 仅使用已启动不可变包；无webServer，无dev/签名/启动/安装入口。
