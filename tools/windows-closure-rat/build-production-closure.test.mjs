import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { productionClosurePlan } from "./build-production-closure.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");

test("official and RAT closure use one deterministic build plan", () => {
  const rat = productionClosurePlan();
  const official = productionClosurePlan({ preparePackage: true });

  assert.deepEqual(official.slice(0, rat.length), rat);
  assert.equal(rat.at(-1).name, "runtime consumer smoke");
  assert.equal(official.at(-1).name, "prepare Tauri packaged runtime");
  const bakeIndex = rat.findIndex(
    (step) => step.name === "bake verdict public key",
  );
  assert.notEqual(bakeIndex, -1);
  assert.ok(
    bakeIndex < rat.findIndex((step) => step.name === "runtime consumer smoke"),
    "真实 verdict 冒烟前必须先把验签公钥烘焙进闭包",
  );
  assert.equal(
    rat.filter((step) => step.name === "Next adapter production build").length,
    1,
  );
  assert.equal(
    rat.some((step) => step.args.includes("build-sidecar.mjs")),
    false,
  );
});

test("packaged runtime stages CreatorOS CLI before copying the closure into Tauri", () => {
  const source = readFileSync(
    resolve(HERE, "prepare-packaged-runtime.mjs"),
    "utf8",
  );
  const stageIndex = source.indexOf("stageCreatorOsCliRuntime({");
  const copyIndex = source.indexOf("cpSync(closureRoot, sidecarRoot");

  assert.notEqual(stageIndex, -1, "Windows 精简闭包必须显式生成随包 CLI runtime");
  assert.ok(stageIndex < copyIndex, "CLI runtime 必须先进入 closure，再整体复制给 Tauri");
  assert.match(source, /runtimeRoot:\s*closureRoot/);
  assert.match(source, /nodeExecutablePath:\s*runtimeNode/);
  assert.match(source, /targetPlatform:\s*["']win32["']/);
});

test("packaged runtime writes a signing-required clean policy after assembly", () => {
  const source = readFileSync(
    resolve(HERE, "prepare-packaged-runtime.mjs"),
    "utf8",
  );
  const policyIndex = source.indexOf("writeCleanSidecarPolicy(sidecarRoot, cleanPolicyEnv)");
  const copyIndex = source.indexOf("cpSync(closureRoot, sidecarRoot");
  const cliStageIndex = source.indexOf("stageCreatorOsCliRuntime({");
  assert.ok(policyIndex > copyIndex, "policy 必须在 runtime 复制完成后写入");
  assert.ok(policyIndex > cliStageIndex, "policy 必须在 CLI 装配后写入");
  assert.match(source, /CREATOROS_SIDECAR_SIGNING_REQUIRED:\s*["']1["']/);
  assert.match(source, /cleanSidecarReusable\(sidecarRoot\)/);
});

test("production closure pins target and adapter evidence", () => {
  const plan = productionClosurePlan({ preparePackage: true });
  const next = plan.find(
    (step) => step.name === "Next adapter production build",
  );
  const materialize = plan.find(
    (step) => step.name === "materialize traced closure",
  );

  assert.equal(next.env.CREATOROS_DESKTOP, "1");
  assert.match(next.env.NEXT_ADAPTER_PATH, /next-output-adapter\.mjs$/);
  assert.match(next.env.CREATOROS_NEXT_OUTPUT_REPORT, /next-adapter-outputs\.json$/);
  assert.deepEqual(materialize.env, {
    CREATOROS_TARGET_PLATFORM: "win32",
    CREATOROS_TARGET_ARCH: "x64",
  });
});

test("channel closure forwards one trusted package brand input into Next and verifies final closure", () => {
  const brandInputPath = resolve(REPO_ROOT, "frontend/src-tauri/target/package-flavors/test/windows-x86_64/package-brand-build-input.json");
  const brandEnv = {
    NEXT_PUBLIC_CREATOROS_PACKAGE_BRAND_NAME: "测试品牌",
    NEXT_PUBLIC_CREATOROS_PACKAGE_BRAND_ICON_DATA_URL: "data:image/x-icon;base64,AAECAw==",
  };
  const plan = productionClosurePlan({
    preparePackage: true,
    packageBrandInputPath: brandInputPath,
    packageBrandBuildEnv: brandEnv,
  });
  const next = plan.find((step) => step.name === "Next adapter production build");
  assert.equal(next.env.NEXT_PUBLIC_CREATOROS_PACKAGE_BRAND_NAME, "测试品牌");
  assert.equal(next.env.NEXT_PUBLIC_CREATOROS_PACKAGE_BRAND_ICON_DATA_URL, brandEnv.NEXT_PUBLIC_CREATOROS_PACKAGE_BRAND_ICON_DATA_URL);
  const verify = plan.find((step) => step.name === "verify packaged WebView brand");
  assert.ok(verify);
  assert.ok(verify.args.includes(brandInputPath));
  assert.ok(verify.args.includes(resolve(HERE, "out", "closure")));
  const runtimeSmoke = plan.find((step) => step.name === "runtime consumer smoke");
  assert.equal(
    runtimeSmoke.env.CREATOROS_EXPECTED_PACKAGE_BRAND_NAME,
    "测试品牌",
    "渠道运行时自检必须消费同一受信品牌名，不能写死 CreatorOS",
  );
});

test("official runtime smoke keeps the official brand default", () => {
  const runtimeSmoke = productionClosurePlan().find(
    (step) => step.name === "runtime consumer smoke",
  );
  assert.equal(
    runtimeSmoke.env.CREATOROS_EXPECTED_PACKAGE_BRAND_NAME,
    "CreatorOS",
  );
});

test("runtime smoke uses a real short-lived verdict instead of the removed bypass", () => {
  const source = readFileSync(resolve(HERE, "runtime-smoke.mjs"), "utf8");
  assert.match(source, /createBuildSmokeVerdictToken/);
  assert.match(source, /CREATOROS_SIDECAR_VERDICT_TOKEN/);
  assert.doesNotMatch(source, /CREATOROS_SMOKE_BYPASS_VERDICT:\s*["']1["']/);
  assert.match(source, /delete sidecarEnv\.CREATOROS_VERDICT_SIGNING_KEY_B64/);
  assert.match(source, /reportCapacity/);
  assert.match(source, /layerSummary\.nodeModulesDirectories !== 0/);
  assert.match(source, /status: "passed"/);
  assert.doesNotMatch(source, /layerSummary\.(?:runtime|core)\.files > /);
  assert.doesNotMatch(source, /layerSummary\.core\.files > 1_000/);
  assert.match(source, /HYPERFRAMES_FFMPEG_PATH:\s*ffmpegPath/);
  assert.match(source, /HYPERFRAMES_FFPROBE_PATH:\s*ffprobePath/);
  assert.match(source, /CREATOROS_EXPECTED_PACKAGE_BRAND_NAME/);
  assert.doesNotMatch(
    source,
    /mainHtml\.includes\(["']<title>CreatorOS<\/title>["']\)/,
  );
});

test("T-845 production HyperFrames spawn and Windows RAT preload the same layered resolver", () => {
  const executor = readFileSync(
    resolve(
      REPO_ROOT,
      "backend/src/modules/execution/video-render/executor.ts",
    ),
    "utf8",
  );
  const smoke = readFileSync(resolve(HERE, "runtime-smoke.mjs"), "utf8");

  for (const source of [executor, smoke]) {
    assert.match(source, /creatoros-module-resolver\.cjs/);
    assert.match(source, /["']--require["']/);
  }
  assert.match(executor, /buildHyperframesProcessArgs/);
  assert.match(executor, /CREATOROS_RUNTIME_ROOT/);
  assert.doesNotMatch(
    executor,
    /NODE_OPTIONS\s*:/,
    "正式渲染必须用 argv 预加载解析器，不能恢复可注入任意代码的 NODE_OPTIONS",
  );
  assert.match(smoke, /\["--require", moduleResolver, hyperframesCli/);
});

test("T-886 Windows closure smoke loads Xenova from a real worker consumer", () => {
  const workerSource = readFileSync(
    resolve(
      REPO_ROOT,
      "ai-worker/src/runtime/multimodal-whisper-local.ts",
    ),
    "utf8",
  );
  const smoke = readFileSync(resolve(HERE, "runtime-smoke.mjs"), "utf8");

  assert.match(workerSource, /workerData\.moduleResolverPath/);
  assert.match(workerSource, /CREATOROS_RUNTIME_ROOT/);
  assert.match(workerSource, /req\(workerData\.moduleResolverPath\)/);
  assert.match(smoke, /new Worker\(/);
  assert.match(
    smoke,
    /moduleResolverPath:\s*\$\{JSON\.stringify\(moduleResolver\)\}/,
  );
  assert.match(smoke, /whisper-worker-module-load/);
});

test("official Windows release and RAT are wired to the same guarded closure", () => {
  const workflow = readFileSync(
    resolve(REPO_ROOT, ".github/workflows/desktop-release.yml"),
    "utf8",
  );
  const packageSource = readFileSync(
    resolve(REPO_ROOT, "frontend/scripts/desktop/package.mjs"),
    "utf8",
  );

  assert.match(
    workflow,
    /build-production-closure\.mjs --prepare-package/,
  );
  assert.ok(
    workflow.match(/build-production-closure\.mjs/g)?.length >= 2,
    "正式发布与候选 RAT 都必须调用公共入口",
  );
  assert.match(workflow, /runtime-diagnostics\.mjs --setup/);
  assert.match(workflow, /runtime-diagnostics\.mjs --runtime-files/);
  assert.doesNotMatch(workflow, /\$runtimeFiles\.Count -gt 3500/);
  assert.match(workflow, /firstLaunchMilliseconds/);
  assert.match(workflow, /Windows 首次启动超过 45 秒/);
  assert.ok(
    workflow.indexOf("上传已生成的安装包（额外验收不阻断）") <
      workflow.indexOf("Windows 主动卸载清理冒烟"),
    "Windows 安装制品在可选卸载验收前上传",
  );
  // T247: 原两项只匹配已失效文案；保实际不变量：同一已签closure不回旧构建/不重tar。
  assert.match(workflow, /signed-sidecar-capsule\.mjs acquire frontend\/src-tauri\/target\/t247-capsule/);
  assert.match(workflow, /signed-sidecar-capsule\.mjs adopt frontend\/src-tauri\/target\/t247-capsule/);
  assert.match(workflow, /CREATOROS_SIGNED_SIDECAR_CAPSULE_PATH:.*inputs\.windows_capsule_mode == 'consume'/);
  assert.match(packageSource, /if \(signedCapsuleInput\) \{\s*if \(platform !== "win32"\)[^\n]*\n\s*verifyAdoptedCapsule\(signedCapsuleInput\)/);
  assert.ok(packageSource.indexOf("verifyAdoptedCapsule(signedCapsuleInput)") < packageSource.indexOf("if (!signedCapsuleInput) step("));
  assert.match(packageSource, /else runSidecarSigning\(\{ preflight: true \}\)/);
  assert.match(packageSource, /if \(!signedCapsuleInput\) step\(\s*"sidecar 二进制化"/);
  assert.match(packageSource, /if \(!signedCapsuleInput\) step\("最终sidecar tar与既有root签名"/);
  const tauri = packageSource.slice(packageSource.indexOf('step("tauri build(含 updater 签名/占位)"'));
  assert.match(tauri, /CREATOROS_SKIP_SIDECAR_REBUILD: "1"/);
  assert.match(tauri, /CREATOROS_SKIP_TARBALL: "1"/);
  assert.match(packageSource, /assertLicenseProjectKey\(\)/);
  assert.match(packageSource, /assertVerdictKeyMaterial\(\)/);
});

test("closure and packaged runtime share one verdict-key baker", () => {
  const baker = readFileSync(resolve(HERE, "bake-verdict-public-key.mjs"), "utf8");
  const packagedRuntime = readFileSync(
    resolve(HERE, "prepare-packaged-runtime.mjs"),
    "utf8",
  );

  assert.match(baker, /assertVerdictPublicKey/);
  assert.match(baker, /verdict-verify-key\.json/);
  assert.match(packagedRuntime, /bakeVerdictPublicKey/);
  assert.match(packagedRuntime, /cliBundleBytes/);
  assert.match(packagedRuntime, /cliNodeBytes/);
  assert.doesNotMatch(packagedRuntime, /writeFileSync\([\s\S]*publicKeyB64/);
});

test("materializer physically excludes traced engineering inputs without changing budgets", () => {
  const materializer = readFileSync(
    resolve(HERE, "materialize-next-closure.mjs"),
    "utf8",
  );

  assert.match(materializer, /import \{ isNonRuntimeTracedAsset \}/);
  assert.match(materializer, /isNonRuntimeTracedAsset\(destination\)/);
  assert.match(materializer, /isNonRuntimeTracedAsset\(source\)/);
  assert.match(materializer, /excludedNonRuntimeAssets/);
  assert.doesNotMatch(materializer, /runtime\.files\s*>/);
  assert.doesNotMatch(materializer, /core\.files\s*>/);
});

test("Windows 分层入口必须装配 Worker 并由公共 smoke 真握手", () => {
  const assembly=readFileSync(resolve(HERE,"assemble-runtime-layers.mjs"),"utf8");
  const smoke=readFileSync(resolve(HERE,"runtime-smoke.mjs"),"utf8");
  assert.match(assembly,/stageLayeredWorkers\(\{repoRoot, runtimeRoot: closureRoot\}\)/);
  assert.match(smoke,/assertExecutionWorkerRuntime\(runtimeRoot\)/);
  assert.match(smoke,/await smokeWorker\(/);
  assert.match(readFileSync(resolve(HERE,"worker-smoke.mjs"),"utf8"),/execArgv:\[\]/);
  assert.match(smoke,/worker-ready:/);
});

// T247: 期望由本次仓库的真实Git blob及独立冻结lineages取得，不从打包副本生成。
import { spawnSync as migrationSpawn } from "node:child_process";
import { mkdtempSync as migrationTemp, mkdirSync as migrationMkdir, writeFileSync as migrationWrite, rmSync as migrationRemove, existsSync as migrationExists } from "node:fs";
import { tmpdir as migrationTmpdir } from "node:os";
import { join as migrationJoin } from "node:path";
import { createHash as migrationHash } from "node:crypto";
import * as migrationBuilder from "./build-production-closure.mjs";
const migrationSha = data => migrationHash("sha256").update(data).digest("hex");
const migrationGitEnv = Object.fromEntries(["PATH","SystemRoot","WINDIR","TEMP","TMP","TMPDIR","LANG"].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
Object.assign(migrationGitEnv,{GIT_CONFIG_GLOBAL:process.platform==="win32"?"NUL":"/dev/null",GIT_CONFIG_NOSYSTEM:"1",GIT_NO_LAZY_FETCH:"1",GIT_TERMINAL_PROMPT:"0"});
function migrationGit(root,args){const result=migrationSpawn("git",args,{cwd:root,env:migrationGitEnv,maxBuffer:32*1024*1024});assert.equal(result.status,0,String(result.stderr));return result.stdout;}
let migrationCanonical;
function migrationOriginal(){
 if(migrationCanonical)return migrationCanonical;
 const paths=migrationGit(REPO_ROOT,["ls-tree","-r","--name-only","HEAD","--","backend/drizzle"]).toString().trim().split("\n").filter(p=>p.endsWith(".sql")||p.endsWith("/_journal.json"));
 const rows=paths.map(path=>({path,raw:migrationGit(REPO_ROOT,["show","HEAD:"+path])}));
 const frozen={...JSON.parse(migrationGit(REPO_ROOT,["show","HEAD:backend/src/migration-convergence-lineages.json"])),...JSON.parse(migrationGit(REPO_ROOT,["show","HEAD:backend/src/migration-convergence-installed-lineages.json"]))};
 const map=new Map(rows.map(row=>[row.path,row.raw]));let refs=0;
 for(const [name,lineage] of Object.entries(frozen)){assert.equal(migrationSha(map.get(`backend/drizzle/lineages/${name}/meta/_journal.json`)),lineage.journalSha256);refs++;for(const entry of lineage.entries){assert.equal(migrationSha(map.get(`backend/drizzle/lineages/${name}/${entry.tag}.sql`)),entry.hash);refs++;}}
 assert.ok(rows.length>0);assert.equal(refs,634);migrationCanonical={rows,refs};return migrationCanonical;
}
function migrationFixture(t,attributes){
 const root=migrationTemp(migrationJoin(migrationTmpdir(),"t247-migration-bytes-"));t.after(()=>migrationRemove(root,{recursive:true,force:true}));migrationGit(root,["init","-q"]);
 for(const {path,raw} of migrationOriginal().rows){const f=migrationJoin(root,path);migrationMkdir(dirname(f),{recursive:true});migrationWrite(f,raw);}
 for(const name of ["migration-convergence-lineages.json","migration-convergence-installed-lineages.json"]){const f=migrationJoin(root,"backend/src",name);migrationMkdir(dirname(f),{recursive:true});migrationWrite(f,migrationGit(REPO_ROOT,["show","HEAD:backend/src/"+name]));}
 if(attributes)migrationWrite(migrationJoin(root,".gitattributes"),attributes);
 migrationGit(root,["-c","core.autocrlf=false","add","."]);migrationGit(root,["-c","user.name=T247 fixture","-c","user.email=t247@invalid","commit","--no-gpg-sign","-qm","fixture"]);
 migrationGit(root,["config","core.autocrlf","true"]);migrationRemove(migrationJoin(root,"backend/drizzle"),{recursive:true});migrationGit(root,["checkout","--","backend/drizzle"]);return root;
}
test("T247 完整当前迁移资产在真实autocrlf checkout保持Git原字节",t=>{
 const attr=migrationJoin(REPO_ROOT,".gitattributes");const root=migrationFixture(t,migrationExists(attr)?readFileSync(attr):null);const original=migrationOriginal();
 const mismatches=original.rows.filter(row=>!readFileSync(migrationJoin(root,row.path)).equals(row.raw));
 assert.equal(mismatches.length,0,`${original.rows.length}项原字节不符数量=${mismatches.length}，首项=${mismatches[0]?.path}`);
 assert.equal(original.refs,634);
});

import { cpSync as migrationCopy, symlinkSync as migrationLink, unlinkSync as migrationUnlink } from "node:fs";
function migrationRequired(root){return {CREATOROS_MIGRATION_ASSET_GIT_VERIFY:"1",CREATOROS_CREATOR_RELEASE_COMMIT:migrationGit(root,["rev-parse","HEAD"]).toString().trim()};}
test("T247 原Git身份全集跨source trace sidecar严格核验并拒绝外来身份",t=>{
 const root=migrationFixture(t,readFileSync(resolve(REPO_ROOT,".gitattributes")));
 // 非迁移snapshot即使有其他合法Git文件mode，也不能扩成迁移身份要求。
 migrationWrite(migrationJoin(root,"backend/drizzle/meta/non-asset-snapshot.json"),"{}");migrationGit(root,["add","backend/drizzle/meta/non-asset-snapshot.json"]);migrationGit(root,["update-index","--chmod=+x","backend/drizzle/meta/non-asset-snapshot.json"]);migrationGit(root,["-c","user.name=T247 fixture","-c","user.email=t247@invalid","commit","--no-gpg-sign","-qm","snapshot outside migration identity"]);
 const env=migrationRequired(root);const identity=migrationBuilder.captureMigrationAssetIdentity({repoRoot:root,env});
 assert.equal(identity.assets.length,migrationOriginal().rows.length);assert.equal(identity.frozenReferences,634);
 assert.equal(migrationBuilder.verifyMigrationAssetIdentity(identity,root).assetCount,migrationOriginal().rows.length);
 const stage=migrationJoin(root,"validation-trace"),sidecar=migrationJoin(root,"validation-sidecar");
 for(const target of [stage,sidecar]){migrationMkdir(migrationJoin(target,"backend"),{recursive:true});migrationCopy(migrationJoin(root,"backend/drizzle"),migrationJoin(target,"backend/drizzle"),{recursive:true});assert.equal(migrationBuilder.verifyMigrationAssetIdentity(identity,target).frozenReferences,634);}
 // 其他既有snapshot不是本门的迁移身份，不误当额外SQL/journal拒绝。
 migrationWrite(migrationJoin(stage,"backend/drizzle/meta/unrelated-snapshot.json"),"{}\n");assert.equal(migrationBuilder.verifyMigrationAssetIdentity(identity,stage).assetCount,migrationOriginal().rows.length);
 const sql=identity.assets.find(x=>x.path.endsWith(".sql")),journal=identity.assets.find(x=>x.path.endsWith("/_journal.json"));
 for(const row of [sql,journal]){const file=migrationJoin(stage,row.path),raw=readFileSync(file);migrationWrite(file,Buffer.concat([raw,Buffer.from(" ")]));assert.throws(()=>migrationBuilder.verifyMigrationAssetIdentity(identity,stage),/BYTES_MISMATCH/);migrationWrite(file,raw);}
 const file=migrationJoin(stage,sql.path),raw=readFileSync(file);migrationRemove(file);assert.throws(()=>migrationBuilder.verifyMigrationAssetIdentity(identity,stage),/SET_MISMATCH/);migrationWrite(file,raw);
 const extra=migrationJoin(stage,"backend/drizzle/not-in-original.sql");migrationWrite(extra,"SELECT 1;");assert.throws(()=>migrationBuilder.verifyMigrationAssetIdentity(identity,stage),/SET_MISMATCH/);migrationRemove(extra);
 const outside=migrationJoin(root,"outside.sql");migrationWrite(outside,raw);migrationRemove(file);migrationLink(outside,file);assert.throws(()=>migrationBuilder.verifyMigrationAssetIdentity(identity,stage),/NOT_REGULAR/);migrationUnlink(file);migrationWrite(file,raw);
 assert.throws(()=>migrationBuilder.verifyMigrationAssetIdentity({...identity,assets:[{...sql,path:"../escape.sql"}]},stage),/SET_MISMATCH|PATH_ESCAPE/);
 // 确实删除本测试新建Git的一个原blob，缺对象不能从worktree回填为期待。
 const oid=migrationGit(root,["rev-parse",env.CREATOROS_CREATOR_RELEASE_COMMIT+":"+sql.path]).toString().trim(),object=migrationJoin(root,".git/objects",oid.slice(0,2),oid.slice(2)),saved=readFileSync(object);migrationRemove(object);
 try{assert.throws(()=>migrationBuilder.captureMigrationAssetIdentity({repoRoot:root,env}),/GIT_UNAVAILABLE|BLOB_MISSING/);}finally{migrationWrite(object,saved);}
 const frozen=migrationJoin(root,"backend/src/migration-convergence-lineages.json"),data=JSON.parse(readFileSync(frozen));data.root.journalSha256="0".repeat(64);migrationWrite(frozen,JSON.stringify(data));migrationGit(root,["add","backend/src/migration-convergence-lineages.json"]);migrationGit(root,["-c","user.name=T247 fixture","-c","user.email=t247@invalid","commit","--no-gpg-sign","-qm","invalid frozen expectation"]);
 assert.throws(()=>migrationBuilder.verifyMigrationAssetIdentity(identity,sidecar),/SOURCE_CHANGED/);
 assert.throws(()=>migrationBuilder.captureMigrationAssetIdentity({repoRoot:root,env:migrationRequired(root)}),/FROZEN_IDENTITY_MISMATCH/);
});
test("T247 受控路径明确要求Git和准确source而通用无Git入口不添前提",t=>{
 const root=migrationTemp(migrationJoin(migrationTmpdir(),"t247-no-git-"));t.after(()=>migrationRemove(root,{recursive:true,force:true}));
 assert.equal(migrationBuilder.captureMigrationAssetIdentity({repoRoot:root,env:{}}),null);assert.equal(migrationBuilder.verifyMigrationAssetIdentity(null,root),null);
 assert.throws(()=>migrationBuilder.captureMigrationAssetIdentity({repoRoot:root,env:{CREATOROS_MIGRATION_ASSET_GIT_VERIFY:"1"}}),/SOURCE_REQUIRED/);
 assert.throws(()=>migrationBuilder.captureMigrationAssetIdentity({repoRoot:root,env:{CREATOROS_MIGRATION_ASSET_GIT_VERIFY:"1",CREATOROS_CREATOR_RELEASE_COMMIT:"a".repeat(40)}}),/GIT_UNAVAILABLE/);
 assert.throws(()=>migrationBuilder.captureMigrationAssetIdentity({repoRoot:root,env:{CREATOROS_MIGRATION_ASSET_GIT_VERIFY:"0"}}),/FLAG_INVALID/);
 assert.throws(()=>migrationBuilder.captureMigrationAssetIdentity({repoRoot:REPO_ROOT,env:{CREATOROS_MIGRATION_ASSET_GIT_VERIFY:"1",CREATOROS_CREATOR_RELEASE_COMMIT:"0".repeat(40)}}),/SOURCE_MISMATCH/);
});
test("T247 三阶段原字节门保原plan步序且build-only不能跳过",()=>{
 const source=readFileSync(resolve(HERE,"build-production-closure.mjs"),"utf8");const begin=source.indexOf("const migrationIdentity = captureMigrationAssetIdentity()");assert.ok(begin>0&&begin<source.indexOf("rmSync(OUT_ROOT"));
 assert.match(source,/verifyMigrationAssetIdentity\(migrationIdentity, REPO_ROOT\)/);assert.match(source,/step.name === "materialize traced closure" \? CLOSURE_ROOT/);assert.match(source,/step.name === "prepare Tauri packaged runtime"/);
 assert.match(source,/if \(migrationIdentity && migrationRoot\)/);assert.doesNotMatch(source,/!buildOnly[^;\n]*migrationIdentity/);
 const workflow=readFileSync(resolve(REPO_ROOT,".github/workflows/desktop-release.yml"),"utf8");assert.equal((workflow.match(/CREATOROS_MIGRATION_ASSET_GIT_VERIFY: "1"/g)||[]).length,1);
 assert.match(workflow,/构建并接入 Windows production closure\(T-675\)[\s\S]*?env:\s*CREATOROS_MIGRATION_ASSET_GIT_VERIFY: "1"/);
});
