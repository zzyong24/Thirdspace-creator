import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
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

export function stageLayeredWorkers({repoRoot,runtimeRoot}) {
  stageExecutionWorkerRuntime({repoRoot,runtimeRoot});
  const workers=join(runtimeRoot,'frontend/runtime');
  for(const entry of readdirSync(workers).filter(name=>name.endsWith('.cjs'))) {
    const path=join(workers,entry);
    // 宿主 fork 使用 execArgv:[]；随包入口自己加载固定的相邻解析器，不继承 NODE_OPTIONS。
    writeFileSync(path,'process.env.CREATOROS_RUNTIME_ROOT = require("node:path").resolve(__dirname, "../..");\nrequire("../creatoros-module-resolver.cjs");\n'+readFileSync(path,'utf8'));
  }
  const added=stageMissingDependencies({
    from:join(repoRoot,'ai-worker'),
    vendorRoot:join(runtimeRoot,'frontend/.next/vendor'),
    existingVendorRoots:[join(runtimeRoot,'layers/browser/vendor'),join(runtimeRoot,'layers/local-ai/vendor')],
    packages:['jsdom','@mozilla/readability','mammoth','pdf-parse','@openai/codex','@openclaw/fs-safe'],
    targetPlatform:'win32',targetArch:'x64',
  });
  if (!existsSync(join(runtimeRoot,'frontend/.next/vendor/@napi-rs/canvas-win32-x64-msvc/package.json'))) {
    throw new Error('Worker PDF 解析缺 Windows canvas 原生依赖');
  }
  assertLayeredWorkerNativeFiles(runtimeRoot);
  console.log('[Worker 依赖] '+JSON.stringify(added));
}

export function assertLayeredWorkerNativeFiles(runtimeRoot) {
  // 原 optional 依赖遍历按 os/cpu 物化Windows包；验证沿相同vendor层，不误拒绝合法已有包。
  for (const relativeFile of [
    '@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe',
    '@openclaw/fs-safe-win32-x64-msvc/fs-safe-native.node',
  ]) {
    const file=['frontend/.next/vendor','layers/browser/vendor','layers/local-ai/vendor']
      .map(layer=>join(runtimeRoot,layer,relativeFile)).find(existsSync);
    if (!file || !statSync(file).isFile() || statSync(file).size===0) {
      throw new Error(`Worker Windows 原生依赖缺失或为空: ${relativeFile}`);
    }
  }
}
