import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { findPnpmEntryForPackage } from '../../frontend/scripts/desktop/build-sidecar.mjs';
import { stageMissingDependencies } from './stage-layered-workers.mjs';
import * as layeredWorkers from './stage-layered-workers.mjs';

test('按依赖图复制并复用同版本包，缺必需包仍失败', () => {
 const root=mkdtempSync(join(tmpdir(),'依赖 图-'));
 try {
  const source=join(root,'source');const dest=join(root,'vendor');mkdirSync(source);writeFileSync(join(source,'package.json'),'{}');
  for(const [name,dependencies] of [['a',{b:'1'}],['b',{}]]) {
   const dir=join(source,'node_modules',name);mkdirSync(dir,{recursive:true});
   writeFileSync(join(dir,'package.json'),JSON.stringify({name,version:'1',main:'index.js',dependencies}));writeFileSync(join(dir,'index.js'),'module.exports=1');
  }
  assert.equal(stageMissingDependencies({from:source,vendorRoot:dest,packages:['a']}).length,2);
  assert.equal(existsSync(join(dest,'a/node_modules')),false);
  assert.equal(JSON.parse(readFileSync(join(dest,'b/package.json'),'utf8')).version,'1');
  assert.equal(stageMissingDependencies({from:source,vendorRoot:dest,packages:['a']}).length,0);
  rmSync(join(dest,'a/index.js'));
  stageMissingDependencies({from:source,vendorRoot:dest,packages:['a']});
  assert.equal(existsSync(join(dest,'a/index.js')),true,'已有manifest不能掩盖缺失入口文件');
  rmSync(join(dest,'b'),{recursive:true});
  assert.deepEqual(stageMissingDependencies({from:source,vendorRoot:dest,packages:['a']}).map(p=>p.name),['b']);
  assert.throws(()=>stageMissingDependencies({from:source,vendorRoot:dest,packages:['missing']}),/Cannot find module/);
  writeFileSync(join(dest,'a/package.json'),JSON.stringify({name:'a',version:'2'}));
  assert.throws(()=>stageMissingDependencies({from:source,vendorRoot:dest,packages:['a']}),/版本不一致/);
 } finally {rmSync(root,{recursive:true,force:true});}
});


const HERE = dirname(fileURLToPath(import.meta.url));

// 源码回归不启动Worker或Windows工具；只核对原物化路径保留真实目标依赖。
test('T1060 两条打包入口保留 ACP 安全文件包与 Codex 平台依赖', () => {
 const layered=readFileSync(join(HERE,'stage-layered-workers.mjs'),'utf8');
 const ordinary=readFileSync(join(HERE,'../../frontend/scripts/desktop/build-sidecar.mjs'),'utf8');
 const packageList=layered.match(/packages:\s*\[([^\]]+)\]/)[1];
 for(const name of ['@openai/codex','@openclaw/fs-safe']) assert.ok(packageList.includes(`'${name}'`),`分层物化根缺少 ${name}`);
 assert.match(layered, /@openai\/codex-win32-x64/);
 assert.match(layered, /@openclaw\/fs-safe-win32-x64-msvc/);
 assert.match(layered, /codex\.exe/);
 assert.match(layered, /fs-safe-native\.node/);
 assert.match(ordinary, /packageName\s*=\s*request\.replace\(/,'普通物化必须先把入口请求转成包名');
 assert.match(ordinary, /findPnpmEntryForPackage\(srcPnpm, packageName, expectedVersion\)/);
 assert.match(ordinary, /nativeOwner\.optionalDependencies\?\.\[packageName\]/,'普通闭包须核验root实际声明的alias');
});

function fixturePackage(base,name,manifest,files={'index.js':'module.exports=1'}) {
 const dir=join(base,'node_modules',...name.split('/'));mkdirSync(dir,{recursive:true});
 writeFileSync(join(dir,'package.json'),JSON.stringify({name,version:'1',...manifest}));
 for(const [rel,bytes] of Object.entries(files)){mkdirSync(dirname(join(dir,rel)),{recursive:true});writeFileSync(join(dir,rel),bytes);}
 return dir;
}

test('T1060 分层物化识别已声明的 Codex npm alias 并保留 Windows 二进制和 fs-safe binding', () => {
 const root=mkdtempSync(join(tmpdir(),'worker-native-alias-'));
 try {
  const source=join(root,'source');mkdirSync(source);writeFileSync(join(source,'package.json'),'{}');
  const codex=fixturePackage(source,'@openai/codex',{version:'0.159.3',main:'index.js',optionalDependencies:{'@openai/codex-win32-x64':'npm:@openai/codex@0.159.3-win32-x64'}});
  fixturePackage(codex,'@openai/codex-win32-x64',{name:'@openai/codex',version:'0.159.3-win32-x64',os:['win32'],cpu:['x64']},{'vendor/x86_64-pc-windows-msvc/bin/codex.exe':'native-codex-fixture'});
  const fsSafe=fixturePackage(source,'@openclaw/fs-safe',{version:'0.21.3',main:'index.js',optionalDependencies:{'@openclaw/fs-safe-win32-x64-msvc':'0.21.3'}});
  fixturePackage(fsSafe,'@openclaw/fs-safe-win32-x64-msvc',{version:'0.21.3',main:'fs-safe-native.node',os:['win32'],cpu:['x64']},{'fs-safe-native.node':'native-binding-fixture'});
  const dest=join(root,'vendor');
  const added=stageMissingDependencies({from:source,vendorRoot:dest,packages:['@openai/codex','@openclaw/fs-safe'],targetPlatform:'win32',targetArch:'x64'});
  assert.deepEqual(added.map(p=>p.name),['@openai/codex','@openai/codex-win32-x64','@openclaw/fs-safe','@openclaw/fs-safe-win32-x64-msvc']);
  assert.equal(readFileSync(join(dest,'@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe'),'utf8'),'native-codex-fixture');
  assert.equal(readFileSync(join(dest,'@openclaw/fs-safe-win32-x64-msvc/fs-safe-native.node'),'utf8'),'native-binding-fixture');
  assert.equal(existsSync(join(dest,'@openai/codex/node_modules')),false);
 } finally {rmSync(root,{recursive:true,force:true});}
});

test('T1060 Codex alias 仅接纳精确声明、实际名称版本和目标平台', () => {
 for(const change of [{version:'0.159.3-win32-arm64'},{name:'@other/fake'},{name:'@openai/codex-win32-x64'},{os:['darwin']},{cpu:['arm64']}]) {
  const root=mkdtempSync(join(tmpdir(),'worker-invalid-alias-'));
  try {
   const source=join(root,'source');mkdirSync(source);writeFileSync(join(source,'package.json'),'{}');
   const codex=fixturePackage(source,'@openai/codex',{version:'0.159.3',main:'index.js',optionalDependencies:{'@openai/codex-win32-x64':'npm:@openai/codex@0.159.3-win32-x64'}});
   fixturePackage(codex,'@openai/codex-win32-x64',{name:'@openai/codex',version:'0.159.3-win32-x64',os:['win32'],cpu:['x64'],...change});
   assert.throws(()=>stageMissingDependencies({from:source,vendorRoot:join(root,'dest'),packages:['@openai/codex'],targetPlatform:'win32',targetArch:'x64'}),/Codex.*alias.*(身份|声明)/);
  } finally {rmSync(root,{recursive:true,force:true});}
 }
});

test('T1060 不接纳未声明的通用 npm alias', () => {
 const root=mkdtempSync(join(tmpdir(),'worker-other-alias-'));
 try {
  const source=join(root,'source');mkdirSync(source);writeFileSync(join(source,'package.json'),'{}');
  fixturePackage(source,'@other/alias',{name:'@other/real',main:'index.js'});
  assert.throws(()=>stageMissingDependencies({from:source,vendorRoot:join(root,'dest'),packages:['@other/alias']}),/无法定位依赖/);
 } finally {rmSync(root,{recursive:true,force:true});}
});

test('T1060 普通闭包从真实同名平台包中只选择精确版本和目标', () => {
 const root=mkdtempSync(join(tmpdir(),'worker-pnpm-alias-'));
 try {
  const pnpm=join(root,'.pnpm');
  fixturePackage(join(pnpm,'base'),'@openai/codex',{version:'0.159.3'});
  fixturePackage(join(pnpm,'arm64'),'@openai/codex',{version:'0.159.3-win32-arm64',os:['win32'],cpu:['arm64']});
  const native=fixturePackage(join(pnpm,'x64'),'@openai/codex',{version:'0.159.3-win32-x64',os:['win32'],cpu:['x64']});
  assert.equal(findPnpmEntryForPackage(pnpm,'@openai/codex-win32-x64','0.159.3-win32-x64'),'x64');
  assert.equal(findPnpmEntryForPackage(pnpm,'@openai/codex','0.159.3'),'base');
  assert.equal(findPnpmEntryForPackage(pnpm,'@openai/codex-win32-x64','0.159.4-win32-x64'),null);
  assert.equal(findPnpmEntryForPackage(pnpm,'@other/alias','0.159.3-win32-x64'),null);
  assert.equal(findPnpmEntryForPackage(pnpm,'@openai/codex-win32-x64'),null,'无精确来源版本不能猜平台alias');
  writeFileSync(join(native,'package.json'),JSON.stringify({name:'@openai/codex',version:'0.159.3-win32-x64',os:['darwin'],cpu:['x64']}));
  assert.equal(findPnpmEntryForPackage(pnpm,'@openai/codex-win32-x64','0.159.3-win32-x64'),null);
 } finally {rmSync(root,{recursive:true,force:true});}
});


test('T1060 原生字节校验允许已存在vendor层，缺失或空字节明确失败', () => {
 assert.equal(typeof layeredWorkers.assertLayeredWorkerNativeFiles,'function');
 const root=mkdtempSync(join(tmpdir(),'worker-existing-native-layer-'));
 try {
  const relativeFiles=['@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe','@openclaw/fs-safe-win32-x64-msvc/fs-safe-native.node'];
  for(const layer of ['frontend/.next/vendor','layers/browser/vendor','layers/local-ai/vendor']) {
   const files=relativeFiles.map(rel=>join(root,layer,rel));
   for(const file of files){mkdirSync(dirname(file),{recursive:true});writeFileSync(file,'native-fixture');}
   assert.doesNotThrow(()=>layeredWorkers.assertLayeredWorkerNativeFiles(root));
   writeFileSync(files[0],'');
   assert.throws(()=>layeredWorkers.assertLayeredWorkerNativeFiles(root),/原生依赖缺失或为空/);
   rmSync(files[0]);
   assert.throws(()=>layeredWorkers.assertLayeredWorkerNativeFiles(root),/原生依赖缺失或为空/);
   for(const file of files)rmSync(file,{force:true});
  }
 } finally {rmSync(root,{recursive:true,force:true});}
});


function existingCodexFixture(layer,change={}) {
 const root=mkdtempSync(join(tmpdir(),'worker-existing-codex-'));
 const source=join(root,'source');mkdirSync(source);writeFileSync(join(source,'package.json'),'{}');
 const codex=fixturePackage(source,'@openai/codex',{version:'0.159.3',main:'index.js',optionalDependencies:{'@openai/codex-win32-x64':'npm:@openai/codex@0.159.3-win32-x64'}});
 const identity={name:'@openai/codex',version:'0.159.3-win32-x64',os:['win32'],cpu:['x64']};
 const binary='vendor/x86_64-pc-windows-msvc/bin/codex.exe';
 fixturePackage(codex,'@openai/codex-win32-x64',identity,{[binary]:'source-native-fixture'});
 const runtimeRoot=join(root,'runtime');
 const existing=join(runtimeRoot,layer,'@openai/codex-win32-x64');mkdirSync(dirname(join(existing,binary)),{recursive:true});
 writeFileSync(join(existing,'package.json'),JSON.stringify({...identity,...change}));
 writeFileSync(join(existing,binary),'existing-transformed-native-fixture');
 // 同时提供另一项非空字节，证明原字节门本身不能识别Codex坏身份。
 const fsByte=join(runtimeRoot,layer,'@openclaw/fs-safe-win32-x64-msvc/fs-safe-native.node');mkdirSync(dirname(fsByte),{recursive:true});writeFileSync(fsByte,'binding-fixture');
 return {root,source,runtimeRoot,existing,binary,options:{from:source,vendorRoot:join(runtimeRoot,'frontend/.next/vendor'),existingVendorRoots:[join(runtimeRoot,'layers/browser/vendor'),join(runtimeRoot,'layers/local-ai/vendor')],packages:['@openai/codex'],targetPlatform:'win32',targetArch:'x64'}};
}

for (const layer of ['frontend/.next/vendor','layers/browser/vendor','layers/local-ai/vendor']) {
 for (const [label,change] of [['错name',{name:'@other/fake'}],['错os',{os:['darwin']}],['错cpu',{cpu:['arm64']}],['缺os',{os:undefined}],['缺cpu',{cpu:undefined}]]) {
  test(`T1060 既有 ${layer} Codex同版本${label}不因非空字节而放行`, () => {
   const f=existingCodexFixture(layer,change);
   try {
    const before=readFileSync(join(f.existing,'package.json'),'utf8');
    assert.doesNotThrow(()=>layeredWorkers.assertLayeredWorkerNativeFiles(f.runtimeRoot),'原字节门能通过此旧失败样例');
    assert.throws(()=>stageMissingDependencies(f.options),/Codex npm alias 身份不匹配/);
    assert.equal(readFileSync(join(f.existing,'package.json'),'utf8'),before,'坏身份不被改写冒充来源');
   } finally {rmSync(f.root,{recursive:true,force:true});}
  });
 }
 test(`T1060 合法既有 ${layer} Codex alias继续复用并保留转换字节`, () => {
  const f=existingCodexFixture(layer);
  try {
   assert.doesNotThrow(()=>stageMissingDependencies(f.options));
   assert.doesNotThrow(()=>layeredWorkers.assertLayeredWorkerNativeFiles(f.runtimeRoot));
   assert.equal(readFileSync(join(f.existing,f.binary),'utf8'),'existing-transformed-native-fixture');
   assert.equal(stageMissingDependencies(f.options).length,0,'同版本合法复用保持幂等');
  } finally {rmSync(f.root,{recursive:true,force:true});}
 });
}


for (const layer of ['frontend/.next/vendor','layers/browser/vendor','layers/local-ai/vendor']) {
 test(`T1060 ${layer} 固定Codex0.159.3真实bin目录合法字节可以验收`, () => {
  const f=existingCodexFixture(layer);
  try {assert.doesNotThrow(()=>layeredWorkers.assertLayeredWorkerNativeFiles(f.runtimeRoot));}
  finally {rmSync(f.root,{recursive:true,force:true});}
 });
 test(`T1060 ${layer} 只有旧codex目录不能冒充固定0.159.3真实bin`, () => {
  const f=existingCodexFixture(layer);
  try {
   const obsolete=join(f.existing,'vendor/x86_64-pc-windows-msvc/codex/codex.exe');mkdirSync(dirname(obsolete),{recursive:true});writeFileSync(obsolete,'obsolete-native-fixture');
   rmSync(join(f.existing,f.binary));
   assert.throws(()=>layeredWorkers.assertLayeredWorkerNativeFiles(f.runtimeRoot),/原生依赖缺失或为空/);
  } finally {rmSync(f.root,{recursive:true,force:true});}
 });
}

test('T1060 打包Codex目录与锁版官方入口和真实worker resolver一致', () => {
 const req=createRequire(join(HERE,'../../ai-worker/package.json'));
 const manifestPath=req.resolve('@openai/codex/package.json');
 assert.equal(JSON.parse(readFileSync(manifestPath,'utf8')).version,'0.159.3');
 const official=readFileSync(join(dirname(manifestPath),'bin/codex.js'),'utf8');
 assert.match(official,/targetTriple,\s*"bin",\s*process\.platform === "win32" \? "codex\.exe" : "codex"/);
 const resolver=readFileSync(join(HERE,'../../ai-worker/src/execution/codex-app-server.ts'),'utf8');
 assert.match(resolver,/'vendor',target,'bin',process\.platform==='win32'\?'codex\.exe':'codex'/);
 const layered=readFileSync(join(HERE,'stage-layered-workers.mjs'),'utf8');
 assert.match(layered,/@openai\/codex-win32-x64\/vendor\/x86_64-pc-windows-msvc\/bin\/codex\.exe/);
});
