import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRuntimeInventory } from '../../frontend/scripts/desktop/runtime-inventory.mjs';

// 容量参考值沿用旧预算；超过只报告增长，功能和结构检查仍由真实消费者执行。
export function capacityWarnings({ runtimeFiles, coreFiles, setupBytes } = {}) {
  const warnings = [];
  for (const [name, value, reference] of [
    ['运行文件数', runtimeFiles, 3500],
    ['核心文件数', coreFiles, 1500],
    ['安装包字节数', setupBytes, 600000000],
  ]) {
    if (value === undefined) continue;
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name}无效`);
    if (value > reference) warnings.push(`${name} ${value} 超过容量参考值 ${reference}；请查看文件清单与安装运行验收。`);
  }
  return warnings;
}
export function reportCapacity(counts) {
  const warnings = capacityWarnings(counts);
  for (const warning of warnings) console.warn(`::warning::[运行容量] ${warning}`);
  return warnings;
}
export function compareFiles(before, after) {
  const a = new Map(before.map(f => [f.path, f]));
  const b = new Map(after.map(f => [f.path, f]));
  return {
    added: [...b.keys()].filter(p => !a.has(p)).sort(),
    removed: [...a.keys()].filter(p => !b.has(p)).sort(),
    changed: [...b.keys()].filter(p => a.has(p) && (a.get(p).sha256 !== b.get(p).sha256 || a.get(p).bytes !== b.get(p).bytes)).sort(),
  };
}
export async function buildClosureDiagnostics(root, baseline = null) {
  const inventory = await buildRuntimeInventory(root);
  const dependencies = [];
  for (const file of inventory.files) {
    if (!/(?:^|\/)vendor\/(?:@[^/]+\/)?[^/]+\/package\.json$/.test(file.path)) continue;
    const manifest = JSON.parse(readFileSync(resolve(root,file.path),'utf8'));
    const prefix = file.path.slice(0,-'package.json'.length);
    const owned = inventory.files.filter(f => f.path.startsWith(prefix));
    dependencies.push({name:manifest.name ?? prefix,version:manifest.version ?? null,path:prefix,files:owned.length,bytes:owned.reduce((s,f)=>s+f.bytes,0)});
  }
  dependencies.sort((a,b)=>b.files-a.files || a.path.localeCompare(b.path));
  const previous = baseline?.inventory ?? baseline;
  return {
    schemaVersion:1,
    candidate:process.env.GITHUB_SHA ?? null,
    platform:process.platform, arch:process.arch, node:process.version,
    inventory, dependencies,
    baseline: previous ? compareFiles(previous.files,inventory.files) : null,
    warnings:capacityWarnings({runtimeFiles:inventory.summary.fileCount}),
  };
}
const flag = name => { const i=process.argv.indexOf(name); return i<0 ? undefined : process.argv[i+1]; };
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (flag('--root')) {
    const out=resolve(flag('--out') ?? 'tools/windows-closure-rat/out/runtime-diagnostics.json');
    const baselinePath=flag('--baseline');
    const baseline=baselinePath ? JSON.parse(readFileSync(baselinePath,'utf8')) : null;
    const report=await buildClosureDiagnostics(resolve(flag('--root')),baseline);
    mkdirSync(dirname(out),{recursive:true});
    writeFileSync(out,JSON.stringify(report,null,2)+'\n');
    console.log(`[运行清单] ${report.inventory.summary.fileCount} 个文件；报告 ${out}`);
    console.log(JSON.stringify(report.dependencies.slice(0,15),null,2));
    reportCapacity({runtimeFiles:report.inventory.summary.fileCount});
  } else {
    const numberFlag=name=>flag(name) === undefined ? undefined : Number(flag(name));
    const setup=flag('--setup');
    if (setup && (!existsSync(setup) || !statSync(setup).isFile())) throw new Error(`安装包不存在或不是文件: ${setup}`);
    reportCapacity({runtimeFiles:numberFlag('--runtime-files'),coreFiles:numberFlag('--core-files'),setupBytes:setup ? statSync(setup).size : numberFlag('--setup-bytes')});
  }
}
