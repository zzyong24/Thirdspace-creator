// 只在VM里执行保留的旧规划；所有输入/FS/进程都是合成值，绝不启动旧真实CLI。
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const original=fs.readFileSync(new URL('./before/hyperframes.test.mjs',import.meta.url),'utf8');
const callbacks=[];let planned;
const syntheticEnv={HOME:'/synthetic-existing-user',OPENAI_API_KEY:'synthetic-not-a-credential',NODE_OPTIONS:'synthetic-injection'};
const context=vm.createContext({
 test:(name,body)=>callbacks.push({name,body}),assert,
 fs:{readFileSync:()=>'',mkdtempSync:()=>'/synthetic-owned-fixture',writeFileSync:()=>{},rmSync:()=>{}},
 os:{tmpdir:()=>'/synthetic-tmp'},path,vm,createHash,
 spawnSync:(command,args,options)=>{planned={command,args,options};return {status:1,stdout:'120',stderr:''};},
 process:{execPath:'/synthetic-node',env:syntheticEnv},fileURLToPath,inspectSource:()=>[],
});
const code=original.replace(/^import .*;\n/gm,'').replaceAll('import.meta.url',JSON.stringify(new URL('../../../tools/timeout-policy/hyperframes.test.mjs',import.meta.url).href));
vm.runInContext(code,context);callbacks.find(row=>row.name.includes('真实公共CLI')).body();
console.log(JSON.stringify({mode:'pure-synthetic-planning-only',sourceRead:'before/hyperframes.test.mjs',actualProcessesStarted:0,actualFilesReadOrWrittenByLegacyCallback:0,homeInherited:planned.options.env.HOME===syntheticEnv.HOME,cwdUnset:planned.options.cwd===undefined,syntheticSecretInherited:planned.options.env.OPENAI_API_KEY===syntheticEnv.OPENAI_API_KEY,nativeBoundaryAbsent:planned.command==='/synthetic-node'}));
assert.notEqual(planned.options.env.HOME,syntheticEnv.HOME,'旧规划仍继承原HOME；这是实际旧函数在纯合成输入上的RED');
