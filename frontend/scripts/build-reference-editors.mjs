#!/usr/bin/env node
// 固定 Doocs 对应源的原生构建入口，不再构建或安装独立页面。
import {cpSync,mkdirSync,readFileSync,rmSync} from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const frontend=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(!process.argv[2])throw Error('用法：node frontend/scripts/build-reference-editors.mjs <Doocs 原生对应源根目录>');
const source=path.resolve(process.argv[2]);
const provenance=JSON.parse(readFileSync(path.join(source,'NATIVE_SOURCE.json'),'utf8'));
if(provenance.upstreamCommit!=='a7c17fc4cda92e3c13aa7e24f06615cfa4219b31'||provenance.nativeEntry!=='apps/web/src/native-entry.ts')throw Error('必须使用已记录的 Doocs 原生对应源');
const build=spawnSync(process.execPath,[path.join(source,'scripts/build-native.mjs')],{cwd:source,stdio:'inherit'});
if(build.status!==0)throw Error(`Doocs 原生构建失败（${build.status??build.signal}）`);
const verify=spawnSync(process.execPath,[path.join(source,'scripts/verify-native-build.mjs')],{cwd:source,stdio:'inherit'});
if(verify.status!==0)throw Error('Doocs 原生入口、依赖或资源核验失败');
const output=path.join(frontend,'public/reference-editors/doocs-md/native');
rmSync(output,{recursive:true,force:true});
mkdirSync(output,{recursive:true});
cpSync(path.join(source,'apps/web/dist-native'),output,{recursive:true});
console.log('Doocs 原生工作面已构建；对应源码与manifest摘要应随实际修改重新登记，再运行verify-native-editors。');
