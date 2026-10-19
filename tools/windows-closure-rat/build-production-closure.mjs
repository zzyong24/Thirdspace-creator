#!/usr/bin/env node

import { buildMemoryEnvironment } from "./build-memory.mjs";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, mkdirSync, writeFileSync, lstatSync, readdirSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { readPackageBrandBuildEnv } from "../../frontend/scripts/desktop/package-flavor.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..", "..");
const OUT_ROOT = resolve(SCRIPT_DIR, "out");
const CLOSURE_ROOT = resolve(OUT_ROOT, "closure");
const NEXT_REPORT = resolve(OUT_ROOT, "next-adapter-outputs.json");
const PACKAGE_BRAND_PROOF = resolve(OUT_ROOT, "package-brand-closure-proof.json");


// SEMANTIC_BOUNDARY_ALLOW: 只核固定Git迁移资产的原字节身份，不判断或修改迁移语义。
const migrationAsset = path => path.startsWith("backend/drizzle/") && (path.endsWith(".sql") || path.endsWith("/_journal.json"));
const migrationSHA = bytes => createHash("sha256").update(bytes).digest("hex");
function migrationGit(repoRoot,args,input) {
  const env=Object.fromEntries(["PATH","SystemRoot","WINDIR","TEMP","TMP","TMPDIR","LANG"].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
  Object.assign(env,{GIT_NO_LAZY_FETCH:"1",GIT_TERMINAL_PROMPT:"0"});
  const result=spawnSync("git",args,{cwd:repoRoot,env,input,maxBuffer:64*1024*1024});
  if(result.status!==0)throw Error("MIGRATION_ASSET_GIT_UNAVAILABLE");return result.stdout;
}
export function captureMigrationAssetIdentity({repoRoot=REPO_ROOT,env=process.env}={}) {
  const flag=env.CREATOROS_MIGRATION_ASSET_GIT_VERIFY;
  if(flag===undefined||flag==="")return null; // 通用无Git入口保持原行为；不按.git有无自动选择。
  if(flag!=="1")throw Error("MIGRATION_ASSET_REQUIRED_FLAG_INVALID");
  const commit=env.CREATOROS_CREATOR_RELEASE_COMMIT;
  if(typeof commit!=="string"||!/^[a-f0-9]{40}$/.test(commit))throw Error("MIGRATION_ASSET_SOURCE_REQUIRED");
  if(migrationGit(repoRoot,["rev-parse","HEAD"]).toString().trim()!==commit)throw Error("MIGRATION_ASSET_SOURCE_MISMATCH");
  const metadata=["backend/src/migration-convergence-lineages.json","backend/src/migration-convergence-installed-lineages.json"];
  const tree=migrationGit(repoRoot,["ls-tree","-r","-z",commit,"--","backend/drizzle",...metadata]);
  const entries=tree.toString().split("\0").filter(Boolean).map(record=>{
    const match=/^([0-7]{6}) (blob|commit|tree) ([a-f0-9]{40})\t([\s\S]+)$/.exec(record);if(!match)throw Error("MIGRATION_ASSET_GIT_PATH_INVALID");
    const path=match[4];if(!migrationAsset(path)&&!metadata.includes(path))return null;
    if(match[1]!=="100644"||match[2]!=="blob")throw Error("MIGRATION_ASSET_GIT_PATH_INVALID");if(path.includes("\\")||path.includes(":")||path.split("/").some(p=>!p||p==="."||p==="..")||/[\x00-\x1f\x7f]/.test(path))throw Error("MIGRATION_ASSET_GIT_PATH_INVALID");
    return {path,oid:match[3]};
  }).filter(Boolean);
  if(!entries.some(row=>migrationAsset(row.path))||metadata.some(path=>!entries.some(row=>row.path===path)))throw Error("MIGRATION_ASSET_SET_MISSING");
  const output=migrationGit(repoRoot,["cat-file","--batch"],Buffer.from(entries.map(row=>row.oid).join("\n")+"\n"));let offset=0;const blobs=new Map();
  for(const entry of entries){const end=output.indexOf(10,offset);if(end<0)throw Error("MIGRATION_ASSET_BLOB_MISSING");const header=output.subarray(offset,end).toString();const match=/^([a-f0-9]{40}) blob ([0-9]+)$/.exec(header);if(!match||match[1]!==entry.oid)throw Error("MIGRATION_ASSET_BLOB_MISSING");const size=Number(match[2]);offset=end+1;if(!Number.isSafeInteger(size)||size>16*1024*1024||offset+size>=output.length||output[offset+size]!==10)throw Error("MIGRATION_ASSET_BLOB_INVALID");blobs.set(entry.path,output.subarray(offset,offset+size));offset+=size+1;}
  if(offset!==output.length)throw Error("MIGRATION_ASSET_BLOB_TRAILING");
  const assets=entries.filter(row=>migrationAsset(row.path)).map(({path})=>({path,bytes:blobs.get(path).length,SHA256:migrationSHA(blobs.get(path))}));
  const expected=new Map(assets.map(row=>[row.path,row]));let frozenReferences=0;
  for(const path of metadata)for(const [name,lineage] of Object.entries(JSON.parse(blobs.get(path)))){
    if(!/^[a-z][a-z0-9-]*$/.test(name))throw Error("MIGRATION_ASSET_FROZEN_PATH_INVALID");
    const refs=[[`backend/drizzle/lineages/${name}/meta/_journal.json`,lineage.journalSha256],...lineage.entries.map(entry=>{if(!/^[a-zA-Z0-9_-]+$/.test(entry.tag))throw Error("MIGRATION_ASSET_FROZEN_PATH_INVALID");return [`backend/drizzle/lineages/${name}/${entry.tag}.sql`,entry.hash];})];
    for(const [file,hash] of refs){if(!/^[a-f0-9]{64}$/.test(hash)||expected.get(file)?.SHA256!==hash)throw Error("MIGRATION_ASSET_FROZEN_IDENTITY_MISMATCH:"+file);frozenReferences++;}
  }
  return Object.freeze({repoRoot:resolve(repoRoot),commit,assets:Object.freeze(assets),frozenReferences});
}
export function verifyMigrationAssetIdentity(identity,assetRoot) {
  if(identity===null)return null;
  if(migrationGit(identity.repoRoot,["rev-parse","HEAD"]).toString().trim()!==identity.commit)throw Error("MIGRATION_ASSET_SOURCE_CHANGED");
  const root=resolve(assetRoot),base=resolve(root,"backend/drizzle");
  function plain(path,directory){const rel=relative(root,path);if(rel===".."||rel.startsWith(".."+sep)||resolve(root,rel)!==path)throw Error("MIGRATION_ASSET_PATH_ESCAPE");const st=lstatSync(path);if(st.isSymbolicLink()||(directory?!st.isDirectory():!st.isFile()))throw Error("MIGRATION_ASSET_NOT_REGULAR:"+rel);}
  plain(root,true);plain(resolve(root,"backend"),true);plain(base,true);
  const found=[];function walk(dir){for(const name of readdirSync(dir)){const path=resolve(dir,name),st=lstatSync(path),rel=relative(root,path).split(sep).join("/");if(st.isSymbolicLink()){if(migrationAsset(rel))throw Error("MIGRATION_ASSET_NOT_REGULAR:"+rel);continue;}if(st.isDirectory())walk(path);else if(migrationAsset(rel)){plain(path,false);found.push(rel);}}}walk(base);
  const expected=identity.assets.map(row=>row.path).sort();found.sort();if(found.length!==expected.length||found.some((path,i)=>path!==expected[i]))throw Error("MIGRATION_ASSET_SET_MISMATCH");
  for(const row of identity.assets){let dir=root;for(const part of row.path.split("/").slice(0,-1)){dir=resolve(dir,part);plain(dir,true);}const path=resolve(root,row.path);plain(path,false);const raw=readFileSync(path);if(raw.length!==row.bytes||migrationSHA(raw)!==row.SHA256)throw Error("MIGRATION_ASSET_BYTES_MISMATCH:"+row.path);}
  return {sourceCommit:identity.commit,assetCount:identity.assets.length,frozenReferences:identity.frozenReferences,assetSetSHA256:migrationSHA(Buffer.from(JSON.stringify(identity.assets))),allOriginalGitBytes:true};
}

export function productionClosurePlan({
  preparePackage = false,
  buildOnly = false,
  packageBrandInputPath,
  packageBrandBuildEnv = {},
} = {}) {
  const steps = [
    {
      name: "Next adapter production build",
      buildMemory: !buildOnly,
      command: buildOnly ? process.execPath : "pnpm",
      args: buildOnly ? [resolve(REPO_ROOT, "frontend/scripts/desktop/build-frontend.mjs")] : ["-C", "frontend", "build"],
      env: {
        CREATOROS_DESKTOP: "1",
        ...(buildOnly ? { CREATOROS_PACKAGE_BUILD_ONLY: "1" } : {}),
        NEXT_ADAPTER_PATH: resolve(SCRIPT_DIR, "next-output-adapter.mjs"),
        CREATOROS_NEXT_OUTPUT_REPORT: NEXT_REPORT,
        ...packageBrandBuildEnv,
      },
    },
    {
      name: "prepare Next bootstrap",
      command: process.execPath,
      args: [
        resolve(SCRIPT_DIR, "prepare-next-bootstrap.mjs"),
        "frontend/.next/standalone",
      ],
    },
    {
      name: "NCC Next bootstrap",
      command: "pnpm",
      args: [
        "dlx",
        "@vercel/ncc@0.38.4",
        "build",
        "frontend/.next/standalone/frontend/server.js",
        "-m",
        "-o",
        "tools/windows-closure-rat/out/ncc-core",
      ],
    },
    {
      name: "bundle Pi engine",
      command: process.execPath,
      args: [resolve(SCRIPT_DIR, "build-pi-bundle.mjs")],
    },
    {
      name: "materialize traced closure",
      command: process.execPath,
      args: [
        resolve(SCRIPT_DIR, "materialize-next-closure.mjs"),
        "tools/windows-closure-rat/out/next-adapter-outputs.json",
        "tools/windows-closure-rat/out/closure",
      ],
      env: {
        CREATOROS_TARGET_PLATFORM: "win32",
        CREATOROS_TARGET_ARCH: "x64",
      },
    },
    {
      name: "finalize NCC core",
      command: process.execPath,
      args: [
        resolve(SCRIPT_DIR, "finalize-ncc-core.mjs"),
        "tools/windows-closure-rat/out/closure",
        "tools/windows-closure-rat/out/ncc-core",
      ],
    },
    {
      name: "assemble five runtime layers",
      command: process.execPath,
      args: [
        resolve(SCRIPT_DIR, "assemble-runtime-layers.mjs"),
        "tools/windows-closure-rat/out/closure",
        "tools/windows-closure-rat/out/pi-bundle.mjs",
      ],
      env: {
        CREATOROS_TARGET_PLATFORM: "win32",
        CREATOROS_TARGET_ARCH: "x64",
      },
    },
    ...(packageBrandInputPath && !buildOnly
      ? [{
          name: "verify packaged WebView brand",
          command: process.execPath,
          args: [
            resolve(SCRIPT_DIR, "verify-package-brand-closure.mjs"),
            packageBrandInputPath,
            CLOSURE_ROOT,
            PACKAGE_BRAND_PROOF,
          ],
        }]
      : []),
    {
      name: "bake verdict public key",
      command: process.execPath,
      args: [
        resolve(SCRIPT_DIR, "bake-verdict-public-key.mjs"),
        "tools/windows-closure-rat/out/closure",
      ],
    },
    {
      name: "runtime file inventory",
      command: process.execPath,
      args: [resolve(SCRIPT_DIR, "runtime-diagnostics.mjs"), "--root", CLOSURE_ROOT,
        "--out", resolve(OUT_ROOT, "runtime-diagnostics.json")],
    },
    ...(!buildOnly ? [{
      name: "runtime consumer smoke",
      command: resolve(
        CLOSURE_ROOT,
        "layers/core/bin/creatoros-server.exe",
      ),
      args: [
        "--require",
        resolve(CLOSURE_ROOT, "frontend/creatoros-module-resolver.cjs"),
        resolve(SCRIPT_DIR, "runtime-smoke.mjs"),
        "tools/windows-closure-rat/out/closure",
      ],
      env: {
        CREATOROS_RUNTIME_ROOT: CLOSURE_ROOT,
        CREATOROS_EXPECTED_PACKAGE_BRAND_NAME:
          packageBrandBuildEnv.NEXT_PUBLIC_CREATOROS_PACKAGE_BRAND_NAME ??
          "CreatorOS",
      },
    }] : []),
  ];

  if (preparePackage) {
    steps.push({
      name: "prepare Tauri packaged runtime",
      command: process.execPath,
      args: [
        resolve(SCRIPT_DIR, "prepare-packaged-runtime.mjs"),
        "tools/windows-closure-rat/out/closure",
      ],
    });
  }
  // 额外清单报告不影响编译/资源组装；build-only 明确传播给后续打包子进程。
  return buildOnly ? steps
    .filter(step => step.name !== "runtime file inventory")
    .map(step => ({ ...step, env: { ...step.env, CREATOROS_PACKAGE_BUILD_ONLY: "1" } })) : steps;
}

function runStep(step) {
  console.log(`\n[production-closure] ▶ ${step.name}`);
  console.log(
    `[production-closure]   $ ${step.command} ${step.args.join(" ")}`,
  );
  const baseEnv = { ...process.env, ...(step.env ?? {}) };
  const memory = step.buildMemory ? buildMemoryEnvironment({ env: baseEnv }) : null;
  if (memory) {
    console.log(`[production-closure] build memory: host=${memory.totalMiB} MiB, effective=${memory.effectiveMiB} MiB, V8 old-space=${memory.heapMiB} MiB; TypeScript enabled`);
  }
  const result = spawnSync(step.command, step.args, {
    cwd: REPO_ROOT,
    env: memory?.env ?? baseEnv,
    stdio: "inherit",
    shell: process.platform === "win32" && step.command === "pnpm",
  });
  if (result.status !== 0) {
    throw new Error(
      `[T-675] production closure 失败:${step.name}(exit=${result.status})`,
    );
  }
}

function loadPackageBrandInput(pathValue) {
  if (!pathValue?.trim()) return null;
  const inputPath = resolve(REPO_ROOT, pathValue);
  const allowedRoot = resolve(REPO_ROOT, "frontend/src-tauri/target/package-flavors");
  const relativePath = relative(allowedRoot, inputPath);
  if (relativePath.startsWith("..") || relativePath === "") {
    throw new Error("[T-781] 渠道品牌输入必须位于 package-flavors staging 内");
  }
  if (!existsSync(inputPath)) {
    throw new Error(`[T-781] 渠道品牌输入不存在:${inputPath}`);
  }
  const input = JSON.parse(readFileSync(inputPath, "utf8"));
  return { inputPath, buildEnv: readPackageBrandBuildEnv(input) };
}

export function buildProductionClosure({ preparePackage = false, buildOnly = false } = {}) {
  if (process.platform !== "win32" || process.arch !== "x64") {
    throw new Error(
      `[T-675] Windows production closure 只能在 win32-x64 构建，当前=${process.platform}-${process.arch}`,
    );
  }
  const migrationIdentity = captureMigrationAssetIdentity();
  const sourceProof = migrationIdentity && verifyMigrationAssetIdentity(migrationIdentity, REPO_ROOT);
  if (sourceProof) console.log("[migration-assets] source " + JSON.stringify(sourceProof));
  const packageBrand = loadPackageBrandInput(
    process.env.CREATOROS_PACKAGE_BRAND_INPUT_PATH,
  );
  rmSync(OUT_ROOT, { recursive: true, force: true });
  mkdirSync(OUT_ROOT, {recursive:true});
  const timings = [];
  for (const step of productionClosurePlan({
    preparePackage,
    buildOnly,
    packageBrandInputPath: packageBrand?.inputPath,
    packageBrandBuildEnv: packageBrand?.buildEnv,
  })) {
    const started = Date.now();
    let status = "failed";
    try {
      runStep(step);
      const migrationRoot = step.name === "materialize traced closure" ? CLOSURE_ROOT
        : step.name === "prepare Tauri packaged runtime" ? resolve(REPO_ROOT,"frontend/src-tauri/sidecar") : null;
      if (migrationIdentity && migrationRoot) console.log("[migration-assets] " + step.name + " " + JSON.stringify(verifyMigrationAssetIdentity(migrationIdentity,migrationRoot)));
      status = "passed";
    }
    finally {
      timings.push({name:step.name,status,durationMs:Date.now()-started});
      writeFileSync(resolve(OUT_ROOT,"build-timings.json"), JSON.stringify({schemaVersion:1,steps:timings},null,2)+"\n");
    }
  }
  if (!buildOnly && (!existsSync(resolve(CLOSURE_ROOT, "runtime-smoke-results.json")) ||
      JSON.parse(readFileSync(resolve(CLOSURE_ROOT, "runtime-smoke-results.json"), "utf8")).status !== "passed")) {
    throw new Error("[T-675] production closure 缺 runtime smoke 证据");
  }
  if (buildOnly) {
    writeFileSync(resolve(OUT_ROOT, "validation-status.json"), JSON.stringify({
      status: "not-run", reason: "用户要求制品生成与额外质量验证分开", target: "windows-x86_64",
    }, null, 2) + "\n");
  }
  if (
    preparePackage &&
    !existsSync(resolve(OUT_ROOT, "packaged-runtime-summary.json"))
  ) {
    throw new Error("[T-675] production closure 缺 packaged runtime summary");
  }
  console.log("\n[production-closure] ✅ Windows production closure 已完成");
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  if (process.argv.includes("--print-plan")) {
    console.log(
      JSON.stringify(
        productionClosurePlan({
          preparePackage: process.argv.includes("--prepare-package"),
          buildOnly: process.argv.includes("--build-only"),
        }),
        null,
        2,
      ),
    );
  } else {
    buildProductionClosure({
      preparePackage: process.argv.includes("--prepare-package"),
      buildOnly: process.argv.includes("--build-only"),
    });
  }
}
