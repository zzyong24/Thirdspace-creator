#!/usr/bin/env node
// 审计事实唯一性/文件哈希检查；不判断业务内容含义。
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const baseline=JSON.parse(fs.readFileSync(path.join(root,'docs/research/t1065/timeout-inventory.json')));
const result=JSON.parse(fs.readFileSync(path.join(root,'docs/verification/t1066/timeout-disposition.json')));
const expected=new Set(baseline.policies.map(r=>r.id)),seen=new Set(),errors=[];
for(const row of result.policies){const id=row.id??row.toId;if(!expected.has(id)||seen.has(id))errors.push(`未知/重复ID: ${id}`);seen.add(id);if(!row.newPolicy||!row.finalFile||!row.finalFileSha256)errors.push(`缺整改事实: ${id}`);
 if(process.argv.includes('--verify-files')){const file=path.join(root,row.finalFile);if(!fs.existsSync(file)||createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==row.finalFileSha256)errors.push(`交付文件已变化: ${id} ${row.finalFile}`);}}
for(const id of expected)if(!seen.has(id))errors.push(`缺失: ${id}`);
console.log(JSON.stringify({ok:errors.length===0,records:seen.size,errors,mode:process.argv.includes('--verify-files')?'当次交付源码哈希核验；未来合法变更无需改写历史':'原审计与整改唯一归属'},null,2));if(errors.length)process.exitCode=1;
