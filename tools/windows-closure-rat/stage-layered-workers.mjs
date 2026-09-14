import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { stageExecutionWorkerRuntime } from '../../frontend/scripts/desktop/execution-worker-runtime.mjs';

function packageRoot(from, name) {
  const req=createRequire(join(from,'package.json'));
  let file;
  try { file=req.resolve(`${name}/package.json`); }
  catch { file=req.resolve(name); }
  let root=dirname(realpathSync(file));
  for (;;) {
    const manifest=join(root,'package.json');
    if (existsSync(manifest) && JSON.parse(readFileSync(manifest,'utf8')).name===name) return root;
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
    } else {
    const destination=join(vendorRoot,name);
    mkdirSync(dirname(destination),{recursive:true});
    cpSync(source,destination,{recursive:true,dereference:true,filter:path=>path===source || path.split(/[\\/]/).at(-1)!=='node_modules'});
    added.push({name,version:manifest.version});
    }
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
    writeFileSync(path,'require("../creatoros-module-resolver.cjs");\n'+readFileSync(path,'utf8'));
  }
  const added=stageMissingDependencies({
    from:join(repoRoot,'ai-worker'),
    vendorRoot:join(runtimeRoot,'frontend/.next/vendor'),
    existingVendorRoots:[join(runtimeRoot,'layers/browser/vendor'),join(runtimeRoot,'layers/local-ai/vendor')],
    packages:['jsdom','@mozilla/readability','mammoth','pdf-parse'],
    targetPlatform:'win32',targetArch:'x64',
  });
  if (!existsSync(join(runtimeRoot,'frontend/.next/vendor/@napi-rs/canvas-win32-x64-msvc/package.json'))) {
    throw new Error('Worker PDF 解析缺 Windows canvas 原生依赖');
  }
  console.log('[Worker 依赖] '+JSON.stringify(added));
}
