"use strict";
const fs=require("node:fs"),path=require("node:path"),{createRequire}=require("node:module");
const h=JSON.parse(fs.readFileSync(path.join(__dirname,"HANDOFF.json"),"utf8"));
if(process.env.T1300_SESSION!==h.privateSessionPath)throw Error("EXPLICIT_CURRENT_PRIVATE_SESSION_REQUIRED");
const s=JSON.parse(fs.readFileSync(process.env.T1300_SESSION,"utf8")),b=JSON.parse(fs.readFileSync(s.candidateBinding,"utf8"));
if(b.sourceHead!==h.sourceHead||s.baseURL!==h.baseURL||s.ownedRoot!==h.ownedRoot)throw Error("CANDIDATE_BINDING_MISMATCH");
const {defineConfig}=createRequire(path.join(b.sourceRoot,"frontend/package.json"))("@playwright/test");
const runRoot=path.resolve(b.sourceRoot,h.outputRoot);fs.mkdirSync(runRoot,{recursive:true,mode:0o700});
module.exports=defineConfig({testDir:path.join(__dirname,"runner"),testMatch:/.*\.spec\.(?:ts|js|cjs|mjs)$/,fullyParallel:false,workers:1,retries:0,timeout:28800000,expect:{timeout:120000},outputDir:path.join(runRoot,"artifacts"),reporter:[["line"],["json",{outputFile:path.join(runRoot,"result.json")}]],use:{baseURL:s.baseURL,actionTimeout:120000,navigationTimeout:300000,launchOptions:{timeout:180000},extraHTTPHeaders:{"x-creatoros-handshake":s.handshake},trace:"off",video:"off",screenshot:"only-on-failure",viewport:{width:1366,height:900}}});
