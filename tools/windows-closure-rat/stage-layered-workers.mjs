import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { dirname, join, resolve, relative } from 'node:path';
import { stageExecutionWorkerRuntime } from '../../frontend/scripts/desktop/execution-worker-runtime.mjs';

// SEMANTIC_BOUNDARY_ALLOW: 仅核验 Codex 已声明 npm alias 的包身份/版本/目标，不做内容选择。
function assertCodexAliasIdentity(from,name,identity) {
  const target=/^@openai\/codex-(darwin|linux|win32)-(arm64|x64)$/.exec(name);
  if (!target) return false;
  const owner=JSON.parse(readFileSync(join(from,'package.json'),'utf8'));
  const version=`${owner.version}-${target[1]}-${target[2]}`;
  if (owner.name!=='@openai/codex' || !/^\d+\.\d+\.\d+$/.test(owner.version ?? '') ||
      owner.optionalDependencies?.[name]!==`npm:@openai/codex@${version}`) {
    throw new Error(`Codex npm alias 声明不匹配: ${name}`);
  }
  if (identity.name!=='@openai/codex' || identity.version!==version ||
      identity.os?.length!==1 || identity.os[0]!==target[1] ||
      identity.cpu?.length!==1 || identity.cpu[0]!==target[2]) {
    throw new Error(`Codex npm alias 身份不匹配: ${name}`);
  }
  return true;
}

function packageRoot(from, name) {
  const req=createRequire(join(from,'package.json'));
  let file;
  try { file=req.resolve(`${name}/package.json`); }
  catch { file=req.resolve(name); }
  let root=dirname(realpathSync(file));
  for (;;) {
    const manifest=join(root,'package.json');
    if (existsSync(manifest)) {
      const identity=JSON.parse(readFileSync(manifest,'utf8'));
      if (assertCodexAliasIdentity(from,name,identity)) return root;
      if (identity.name===name) return root;
    }
    const parent=dirname(root);
    if (parent===root) throw new Error(`无法定位依赖 ${name}`);
    root=parent;
  }
}
const supports=(values, value)=>!values || (!values.includes(`!${value}`) && (!values.some(v=>!v.startsWith('!')) || values.includes(value)));

// 按包声明物化实际依赖；不按业务关键词裁剪。已有包必须版本一致，不能偷换运行版本。
export function stageMissingDependencies({from, vendorRoot, existingVendorRoots=[], packages, targetPlatform=process.platform, targetArch=process.arch}) {
  const visited=new Map();
  const added=[];
  function visit(base,name,optional=false) {
    let source;
    try { source=packageRoot(base,name); } catch(error) { if(optional && error.code==='MODULE_NOT_FOUND') return; throw error; }
    const manifest=JSON.parse(readFileSync(join(source,'package.json'),'utf8'));
    if (!supports(manifest.os,targetPlatform) || !supports(manifest.cpu,targetArch)) {
      if(optional) return;
      throw new Error(`依赖 ${name} 不支持 ${targetPlatform}-${targetArch}`);
    }
    const prior=visited.get(name);
    if(prior) { if(prior!==source) throw new Error(`Worker 依赖 ${name} 存在多个版本，不能平铺覆盖`); return; }
    visited.set(name,source);
    const existing=[vendorRoot,...existingVendorRoots].map(root=>join(root,name)).find(root=>existsSync(join(root,'package.json')));
    if(existing) {
      const existingManifest=JSON.parse(readFileSync(join(existing,'package.json'),'utf8'));
      if(existingManifest.version!==manifest.version) throw new Error(`Worker 依赖 ${name} 与运行包版本不一致`);
      // 原Codex alias校验同样约束复用目录；其他依赖保持原版本复用规则。
      assertCodexAliasIdentity(base,name,existingManifest);
    }
    const destination=existing ?? join(vendorRoot,name);
    mkdirSync(dirname(destination),{recursive:true});
    let copied=false;
    // Next只追踪某一种入口；补齐同版本包的遗漏文件，但保留已有转换文件。
    cpSync(source,destination,{recursive:true,dereference:true,force:false,errorOnExist:false,filter:path=>{
      if(path!==source && path.split(/[\\/]/).at(-1)==='node_modules') return false;
      if(statSync(path).isDirectory()) return true;
      if(existsSync(join(destination,relative(source,path)))) return false;
      copied=true;
      return true;
    }});
    if(copied) added.push({name,version:manifest.version});
    const optionalDeps=manifest.optionalDependencies ?? {};
    for(const dep of Object.keys({...manifest.dependencies,...optionalDeps})) visit(source,dep,Object.hasOwn(optionalDeps,dep));
  }
  for(const name of packages) visit(from,name);
  return added;
}

// 使用 Node 为该 importer 产生的搜索路径定位包本体；不要求包导出 package.json/require 入口。
function scopedPackageRoot(from,name) {
  const req=createRequire(join(from,'package.json'));
  // 显式npm声明允许与builtin同名，包子路径强制取得npm搜索位置。
  for(const base of req.resolve.paths(`${name}/package.json`)??[]) {
    const candidate=join(base,name,'package.json');
    if(!existsSync(candidate))continue;
    const root=dirname(realpathSync(candidate));const identity=JSON.parse(readFileSync(candidate,'utf8'));
    if(identity.name===name||assertCodexAliasIdentity(from,name,identity))return root;
    throw new Error('Worker 包身份不匹配: '+name);
  }
  throw Object.assign(new Error('Cannot find module '+name),{code:'MODULE_NOT_FOUND'});
}
// 每个真实来源保留独立身份；原平铺接口及其冲突保护不变。
export function stageScopedWorkerDependencies({from,runtimeRoot,packages,entries,targetPlatform=process.platform,targetArch=process.arch}) {
  const graph={schemaVersion:1,nodes:{},entries:{}};
  const seen=new Map();
  const graphRoot=join(runtimeRoot,'frontend/.next/worker-packages');
  if(existsSync(graphRoot)) throw new Error('Worker 图目标已存在，拒绝混入旧闭包');
  mkdirSync(graphRoot,{recursive:true});
  function visit(base,name,optional=false) {
    let source;
    try {source=scopedPackageRoot(base,name);} catch(error) {if(optional && error.code==='MODULE_NOT_FOUND')return null;throw error;}
    const bytes=readFileSync(join(source,'package.json'));
    const manifest=JSON.parse(bytes);
    if(!supports(manifest.os,targetPlatform)||!supports(manifest.cpu,targetArch)) {
      if(optional)return null;
      throw new Error(`依赖 ${name} 不支持 ${targetPlatform}-${targetArch}`);
    }
    if(seen.has(source)) {const id=seen.get(source);if(!graph.nodes[id].aliases.includes(name))graph.nodes[id].aliases.push(name);return id;}
    const id='p'+String(seen.size).padStart(4,'0');seen.set(source,id);
    const local=`frontend/.next/worker-packages/${id}`;
    const node=graph.nodes[id]={name:manifest.name,version:manifest.version,aliases:[name],root:local,manifestSHA256:createHash('sha256').update(bytes).digest('hex'),dependencies:{}};
    cpSync(source,join(runtimeRoot,local),{recursive:true,dereference:true,filter:path=>path===source||path.split(/[\\/]/).at(-1)!=='node_modules'});
    const optionalDeps=manifest.optionalDependencies??{};
    const peers=manifest.peerDependencies??{};
    for(const dep of Object.keys({...peers,...manifest.dependencies,...optionalDeps})) {
      // 保留真实npm声明的同名边；裸builtin/node:仍由原运行解析器优先处理。
      const optional=Object.hasOwn(optionalDeps,dep)||(!Object.hasOwn(manifest.dependencies??{},dep)&&manifest.peerDependenciesMeta?.[dep]?.optional===true);
      const target=visit(source,dep,optional);
      if(target)node.dependencies[dep]=target;
    }
    return id;
  }
  const dependencies={};
  for(const name of packages)dependencies[name]=visit(from,name);
  // 原随包外部探针直接核该平台 alias；身份仍由 Codex 自己声明的准确边决定。
  if(dependencies['@openai/codex']) {
    const alias=`@openai/codex-${targetPlatform}-${targetArch}`;
    const id=graph.nodes[dependencies['@openai/codex']].dependencies[alias];
    if(!id)throw new Error('Codex 缺少目标平台依赖: '+alias);
    dependencies[alias]=id;
  }
  for(const entry of entries) {
    if(!WORKER_ENTRIES.includes(entry))throw new Error('不是已声明的 Worker 入口: '+entry);
    const local='frontend/runtime/'+entry;
    if(!existsSync(join(runtimeRoot,local)))throw new Error('Worker 入口缺失: '+entry);
    graph.entries[local]={dependencies:{...dependencies}};
  }
  writeFileSync(join(runtimeRoot,'frontend/worker-dependency-map.json'),JSON.stringify(graph,null,2)+'\n');
  return graph;
}
const WORKER_ENTRIES=['codex-acp.cjs','codex-status-worker.cjs','execution-worker.cjs','agentic-worker.cjs','intelligence-generation-worker.cjs','intelligence-transcript-worker.cjs','embedding-worker.cjs','flywheel-generation-worker.cjs','model-probe-worker.cjs','video-visual-review-worker.cjs'];

export function stageLayeredWorkers({repoRoot,runtimeRoot}) {
  stageExecutionWorkerRuntime({repoRoot,runtimeRoot});
  const workers=join(runtimeRoot,'frontend/runtime');
  for(const entry of readdirSync(workers).filter(name=>name.endsWith('.cjs'))) {
    const path=join(workers,entry);
    // 宿主 fork 使用 execArgv:[]；随包入口自己加载固定的相邻解析器，不继承 NODE_OPTIONS。
    writeFileSync(path,'process.env.CREATOROS_RUNTIME_ROOT = require("node:path").resolve(__dirname, "../..");\nrequire("../creatoros-module-resolver.cjs");\n'+readFileSync(path,'utf8'));
  }
  const graph=stageScopedWorkerDependencies({
    from:join(repoRoot,'ai-worker'),runtimeRoot,entries:WORKER_ENTRIES,
    packages:['jsdom','@mozilla/readability','mammoth','pdf-parse','@openai/codex','@openclaw/fs-safe','@playwright/test','@xenova/transformers'],
    targetPlatform:'win32',targetArch:'x64',
  });
  if (!Object.values(graph.nodes).some(node=>node.aliases.includes('@napi-rs/canvas-win32-x64-msvc'))) {
    throw new Error('Worker PDF 解析缺 Windows canvas 原生依赖');
  }
  assertLayeredWorkerNativeFiles(runtimeRoot);
  console.log('[Worker 依赖] '+JSON.stringify(Object.values(graph.nodes).map(({name,version})=>({name,version}))));
}

export function assertLayeredWorkerNativeFiles(runtimeRoot) {
  // 原 optional 依赖遍历按 os/cpu 物化Windows包；验证沿相同vendor层，不误拒绝合法已有包。
  for (const relativeFile of [
    '@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe',
    '@openclaw/fs-safe-win32-x64-msvc/fs-safe-native.node',
  ]) {
    const parts=relativeFile.split('/');const packageName=parts.slice(0,2).join('/');const subpath=parts.slice(2).join('/');
    const mapPath=join(runtimeRoot,'frontend/worker-dependency-map.json');
    const scoped=existsSync(mapPath)?Object.values(JSON.parse(readFileSync(mapPath,'utf8')).nodes).filter(node=>node.aliases.includes(packageName)).map(node=>join(runtimeRoot,node.root,subpath)):[];
    const candidates=existsSync(mapPath)?scoped:['frontend/.next/vendor','layers/browser/vendor','layers/local-ai/vendor'].map(layer=>join(runtimeRoot,layer,relativeFile));
    const file=candidates.find(existsSync);
    if (!file || !statSync(file).isFile() || statSync(file).size===0) {
      throw new Error(`Worker Windows 原生依赖缺失或为空: ${relativeFile}`);
    }
  }
}
