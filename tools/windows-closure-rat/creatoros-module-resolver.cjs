"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { builtinModules, registerHooks } = require("node:module");
const { pathToFileURL, fileURLToPath } = require("node:url");
const { createHash } = require("node:crypto");

const runtimeRoot = fs.realpathSync(
  process.env.CREATOROS_RUNTIME_ROOT || path.resolve(__dirname, ".."));
const vendorRoots = [
  path.resolve(runtimeRoot, "frontend", ".next", "vendor"),
  path.resolve(runtimeRoot, "layers", "core", "render", "vendor"),
  path.resolve(runtimeRoot, "layers", "browser", "vendor"),
  path.resolve(runtimeRoot, "layers", "local-ai", "vendor"),
].filter((candidate) => fs.existsSync(candidate));
const builtins = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
]);

function splitPackageSpecifier(specifier) {
  const segments = specifier.split("/");
  if (specifier.startsWith("@")) {
    return {
      packageName: `${segments[0]}/${segments[1]}`,
      subpath: segments.slice(2).join("/"),
    };
  }
  return {
    packageName: segments[0],
    subpath: segments.slice(1).join("/"),
  };
}

function chooseConditionalExport(value, conditions) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const candidate of value) {
      const selected = chooseConditionalExport(candidate, conditions);
      if (selected) return selected;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  for (const condition of conditions) {
    if (!(condition in value)) continue;
    const selected = chooseConditionalExport(value[condition], conditions);
    if (selected) return selected;
  }
  if ("default" in value) {
    return chooseConditionalExport(value.default, conditions);
  }
  return null;
}

function exportedTarget(manifest, subpath, conditions) {
  const exportsField = manifest.exports;
  if (!exportsField) return null;
  const exportKey = subpath ? `./${subpath}` : ".";
  if (typeof exportsField === "string" || Array.isArray(exportsField)) {
    return subpath ? null : chooseConditionalExport(exportsField, conditions);
  }
  if (typeof exportsField !== "object") return null;
  if (!Object.keys(exportsField).some((key) => key.startsWith("."))) {
    return subpath ? null : chooseConditionalExport(exportsField, conditions);
  }
  if (exportKey in exportsField) {
    return chooseConditionalExport(exportsField[exportKey], conditions);
  }
  for (const [pattern, value] of Object.entries(exportsField)) {
    const star = pattern.indexOf("*");
    if (star < 0) continue;
    const prefix = pattern.slice(0, star);
    const suffix = pattern.slice(star + 1);
    if (!exportKey.startsWith(prefix) || !exportKey.endsWith(suffix)) continue;
    const matched = exportKey.slice(prefix.length, exportKey.length - suffix.length);
    const selected = chooseConditionalExport(value, conditions);
    if (selected) return selected.replaceAll("*", matched);
  }
  return null;
}

function existingModuleFile(candidate) {
  try {
    if (fs.statSync(candidate).isDirectory()) {
      const nestedManifest = path.resolve(candidate, "package.json");
      if (fs.existsSync(nestedManifest)) {
        const manifest = JSON.parse(fs.readFileSync(nestedManifest, "utf8"));
        const nestedTarget = manifest.main || manifest.module;
        if (nestedTarget) {
          const nestedFile = existingModuleFile(path.resolve(candidate, nestedTarget));
          if (nestedFile) return nestedFile;
        }
      }
    }
  } catch {
    // Continue through explicit file candidates below.
  }
  for (const value of [
    candidate,
    `${candidate}.js`,
    `${candidate}.cjs`,
    `${candidate}.mjs`,
    path.resolve(candidate, "index.js"),
    path.resolve(candidate, "index.cjs"),
    path.resolve(candidate, "index.mjs"),
  ]) {
    try {
      if (fs.statSync(value).isFile()) return value;
    } catch {
      // Continue to the next deterministic candidate.
    }
  }
  return null;
}

function resolveFromVendors(specifier, conditions) {
  const { packageName, subpath } = splitPackageSpecifier(specifier);
  for (const vendorRoot of vendorRoots) {
    const packageRoot = path.resolve(vendorRoot, packageName);
    const manifestPath = path.resolve(packageRoot, "package.json");
    if (!fs.existsSync(packageRoot)) continue;
    let manifest = {};
    if (fs.existsSync(manifestPath)) {
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    }
    const target =
      exportedTarget(manifest, subpath, conditions) ||
      (subpath ? `./${subpath}` : manifest.main || manifest.module || "./index.js");
    const candidate = existingModuleFile(path.resolve(packageRoot, target));
    if (candidate) return candidate;
  }
  return null;
}

const workerEntries=new Set(['codex-acp.cjs','codex-status-worker.cjs','execution-worker.cjs','agentic-worker.cjs','intelligence-generation-worker.cjs','intelligence-transcript-worker.cjs','embedding-worker.cjs','flywheel-generation-worker.cjs','model-probe-worker.cjs','video-visual-review-worker.cjs'].map(name=>path.resolve(runtimeRoot,'frontend/runtime',name)));
const mapPath=path.resolve(runtimeRoot,'frontend/worker-dependency-map.json');
let workerGraph;
function graphError(message,code='MODULE_NOT_FOUND') {return Object.assign(new Error('Worker 依赖图: '+message),{code});}
function contained(root,file) {const rel=path.relative(root,file);return rel!== '..'&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel);}
function loadWorkerGraph() {
  if(workerGraph)return workerGraph;
  if(!fs.existsSync(mapPath))throw graphError('缺少映射');
  const graph=JSON.parse(fs.readFileSync(mapPath,'utf8'));
  if(graph.schemaVersion!==1||!graph.nodes||!graph.entries)throw graphError('schema不匹配');
  const nodes=new Map();
  for(const [id,node] of Object.entries(graph.nodes)) {
    if(!/^p[0-9]{4,}$/.test(id)||node.root!==`frontend/.next/worker-packages/${id}`||!node.dependencies||!Array.isArray(node.aliases))throw graphError('节点路径不合法');
    const root=fs.realpathSync(path.resolve(runtimeRoot,node.root));
    if(!contained(fs.realpathSync(runtimeRoot),root))throw graphError('节点越出安装包');
    const bytes=fs.readFileSync(path.join(root,'package.json'));
    if(createHash('sha256').update(bytes).digest('hex')!==node.manifestSHA256)throw graphError('manifest摘要不匹配');
    const manifest=JSON.parse(bytes);
    if(manifest.name!==node.name||manifest.version!==node.version)throw graphError('节点身份不匹配');
    nodes.set(id,{...node,root,manifest});
  }
  for(const node of nodes.values())for(const id of Object.values(node.dependencies))if(!nodes.has(id))throw graphError('边指向未知节点');
  for(const [entry,value] of Object.entries(graph.entries)) {
    if(!workerEntries.has(path.resolve(runtimeRoot,entry))||!value.dependencies)throw graphError('入口不合法');
    for(const id of Object.values(value.dependencies))if(!nodes.has(id))throw graphError('入口指向未知节点');
  }
  workerGraph={nodes,entries:graph.entries};return workerGraph;
}
function graphLegacyFile(candidate,seen=new Set()) {
  if(seen.has(candidate))return null;seen.add(candidate);
  for(const file of [candidate,`${candidate}.js`,`${candidate}.json`,`${candidate}.node`])if(fs.existsSync(file)&&fs.statSync(file).isFile())return file;
  if(fs.existsSync(candidate)&&fs.statSync(candidate).isDirectory()) {
    const manifest=path.join(candidate,'package.json');
    if(fs.existsSync(manifest)){const main=JSON.parse(fs.readFileSync(manifest,'utf8')).main;if(main){const file=graphLegacyFile(path.resolve(candidate,main),seen);if(file)return file;}}
    for(const name of ['index.js','index.json','index.node']){const file=path.join(candidate,name);if(fs.existsSync(file)&&fs.statSync(file).isFile())return file;}
  }
  return null;
}
// 图范围使用原生下一跳加载文件；只在裸包定位处选择该调用方的准确边。
function graphPackageTarget(node,subpath,conditions) {
  const manifest=node.manifest;
  let target;
  if(Object.hasOwn(manifest,'exports')) {
    const key=subpath?'./'+subpath:'.';let field=manifest.exports;
    function select(value,match) {
      if(value===null)return null;
      if(typeof value==='string')return match===undefined?value:value.replaceAll('*',match);
      if(Array.isArray(value)) {for(const item of value){const selected=select(item,match);if(selected!==undefined)return selected;}return undefined;}
      if(value&&typeof value==='object') {for(const [condition,item] of Object.entries(value))if(condition==='default'||conditions.has(condition)){const selected=select(item,match);if(selected!==undefined)return selected;}}
      return undefined;
    }
    if(field&&typeof field==='object'&&!Array.isArray(field)&&Object.keys(field).some(k=>k.startsWith('.'))) {
      if(Object.hasOwn(field,key))target=select(field[key]);
      else {
        const patterns=Object.keys(field).filter(k=>k.includes('*')).sort((a,b)=>b.indexOf('*')-a.indexOf('*')||b.length-a.length);
        for(const pattern of patterns){const [prefix,suffix]=pattern.split('*');if(key.startsWith(prefix)&&key.endsWith(suffix)&&key.length>=prefix.length+suffix.length){target=select(field[pattern],key.slice(prefix.length,key.length-suffix.length||undefined));break;}}
      }
    } else if(!subpath)target=select(field);
    if(typeof target!=='string')throw graphError('未导出的包路径: '+node.name+'/'+subpath,'ERR_PACKAGE_PATH_NOT_EXPORTED');
    if(!target.startsWith('./'))throw graphError('exports目标无效','ERR_INVALID_PACKAGE_TARGET');
    const file=path.resolve(node.root,target);
    if(!contained(node.root,file)||target.split(/[\\/]/).some(part=>part==='node_modules'||part==='..'))throw graphError('exports目标越界','ERR_INVALID_PACKAGE_TARGET');
    if(!fs.existsSync(file)||!fs.statSync(file).isFile())throw graphError('exports文件缺失');
    return file;
  }
  const candidate=path.resolve(node.root,subpath||manifest.main||'./index.js');
  const file=subpath&&!conditions.has('require')?(fs.existsSync(candidate)&&fs.statSync(candidate).isFile()?candidate:null):graphLegacyFile(candidate);
  if(!file||!contained(node.root,file))throw graphError('包入口缺失或越界');
  return file;
}
function resolveFromWorkerGraph(specifier,context) {
  if(!context.parentURL?.startsWith('file:'))return null;
  const parent=fileURLToPath(context.parentURL);
  const inGraph=contained(path.resolve(runtimeRoot,'frontend/.next/worker-packages'),parent);
  const isEntry=workerEntries.has(parent);
  if(!inGraph&&!isEntry)return null;
  const graph=loadWorkerGraph();
  const owner=inGraph?[...graph.nodes.values()].find(node=>contained(node.root,parent)):graph.entries[path.relative(runtimeRoot,parent).split(path.sep).join('/')];
  if(!owner)throw graphError('调用方缺少映射');
  const {packageName,subpath}=splitPackageSpecifier(specifier);
  const self=inGraph&&owner.name===packageName&&Object.hasOwn(owner.manifest,'exports');
  const node=self?owner:graph.nodes.get(owner.dependencies[packageName]);
  if(!node)throw graphError('调用方未声明或未物化依赖: '+packageName);
  return graphPackageTarget(node,subpath,new Set(context.conditions||['node','require','default']));
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      builtins.has(specifier) ||
      specifier.startsWith(".") ||
      specifier.startsWith("/") ||
      path.isAbsolute(specifier) ||
      specifier.startsWith("file:") ||
      specifier.startsWith("#")
    ) {
      return nextResolve(specifier, context);
    }
    const scoped=resolveFromWorkerGraph(specifier,context);
    if(scoped)return {shortCircuit:true,url:pathToFileURL(scoped).href};
    const resolved = resolveFromVendors(
      specifier,
      new Set(context.conditions || ["node", "require", "default"]),
    );
    if (!resolved) return nextResolve(specifier, context);
    return {
      shortCircuit: true,
      url: pathToFileURL(resolved).href,
    };
  },
});
