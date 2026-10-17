import fs, { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { shouldPackSidecarTarball } from "./build-sidecar.mjs";

const readConfig = (name) =>
  JSON.parse(readFileSync(join(process.cwd(), "src-tauri", name), "utf8"));

describe("Windows sidecar runtime 打包契约", () => {
  it("双端只携带单个 runtime tar 与第三方声明，避免 NSIS 压缩十几万小文件", () => {
    const shared = readConfig("tauri.conf.json");
    const windows = readConfig("tauri.windows.conf.json");

    expect(shared.bundle.resources).toEqual(["sidecar.tar.gz", "sidecar.tar.gz.sig", "THIRD_PARTY_NOTICES.md"]);
    expect(windows.bundle.resources).toEqual(["sidecar.tar.gz", "sidecar.tar.gz.sig", "THIRD_PARTY_NOTICES.md"]);
    expect(shared.bundle.resources).not.toContain("sidecar/");
    expect(windows.bundle.resources).not.toContain("sidecar/");
  });

  it("Windows 使用官方 NSIS hook 在安装期物化，并允许用户直接选择安装目录", () => {
    const windows = readConfig("tauri.windows.conf.json");
    const nsis = windows.bundle.windows.nsis;
    const hook = readFileSync(
      join(process.cwd(), "src-tauri", "windows", "installer-hooks.nsh"),
      "utf8",
    );

    expect(nsis.installMode).toBe("currentUser");
    expect(nsis.installerHooks).toBe("./windows/installer-hooks.nsh");
    expect(hook).toContain("NSIS_HOOK_POSTINSTALL");
    expect(hook).toContain("$INSTDIR\\${MAINBINARYNAME}.exe");
    expect(hook).toContain("--creatoros-install-runtime");
    expect(hook).not.toContain('Delete "$INSTDIR\\sidecar.tar.gz"');
    expect(hook).not.toContain('Delete "$INSTDIR\\sidecar.tar.gz.sig"');
    expect(hook).toContain(
      'ExecWait \'"$INSTDIR\\${MAINBINARYNAME}.exe" --creatoros-install-runtime\' $0',
    );
    expect(hook).toContain(
      'ExecWait \'"$INSTDIR\\${MAINBINARYNAME}.exe" --creatoros-uninstall-runtime\' $0',
    );
    expect(hook).toContain("首次启动将自动修复");
    expect(hook).toContain("NSIS_HOOK_PREUNINSTALL");
    expect(hook).toContain("--creatoros-uninstall-runtime");
    expect(hook).toContain("NSIS_HOOK_POSTUNINSTALL");
    expect(hook).toContain('RMDir /r "$INSTDIR\\runtime-images"');
    expect(hook).toContain("${If} $UpdateMode <> 1");
    const executableLines = hook
      .split(/\r?\n/)
      .filter((line) => !line.trimStart().startsWith(";"))
      .join("\n");
    expect(executableLines).not.toContain("Abort ");
    expect(executableLines).not.toMatch(/APPDATA|LOCALAPPDATA|Program Files/i);
  });

  it("全平台构建入口都生成 tar resource", () => {
    expect(shouldPackSidecarTarball("win32")).toBe(true);
    expect(shouldPackSidecarTarball("darwin")).toBe(true);
    expect(shouldPackSidecarTarball("linux")).toBe(true);
  });

  it("Rust 构建期对 Windows tarball 同样烘焙真实 SHA-256", () => {
    const buildRs = readFileSync(join(process.cwd(), "src-tauri", "build.rs"), "utf8");

    expect(buildRs).toContain('let hash = sha256_file(&tarball);');
    expect(buildRs).not.toMatch(/target_os\s*==\s*"windows"[\s\S]{0,120}String::new\(\)/);
  });

  it("Windows 启动优先消费安装期指针，缺失时才保留旧 tar 兼容兜底", () => {
    const libRs = readFileSync(join(process.cwd(), "src-tauri", "src", "lib.rs"), "utf8");

    expect(libRs).toContain("resolve_installed_runtime_with_hash");
    expect(libRs).toContain("runtime-current.txt");
    expect(libRs).toContain("materialize_windows_runtime");
    expect(libRs).toContain("--creatoros-install-runtime");
    expect(libRs).toContain("remove_windows_installed_runtime");
    expect(libRs).toContain("--creatoros-uninstall-runtime");
    expect(libRs).toContain("runtime_progress");
    expect(libRs).toContain("stdout.flush()");
    expect(libRs).toContain("creatoros-runtime-install-error.log");
    const directRuntimeLookup = libRs.indexOf(
      "match resolve_installed_runtime_with_hash",
    );
    const legacyTarLookup = libRs.indexOf(
      '.resolve("sidecar.tar.gz", tauri::path::BaseDirectory::Resource)',
      directRuntimeLookup,
    );
    expect(directRuntimeLookup).toBeGreaterThan(-1);
    expect(legacyTarLookup).toBeGreaterThan(directRuntimeLookup);
  });

  it("安装期 runtime 损坏且 tar 已清理时直接暴露原始错误，不伪装成 bundle 缺失", () => {
    const libRs = readFileSync(join(process.cwd(), "src-tauri", "src", "lib.rs"), "utf8");

    expect(libRs).toContain("installed_runtime_error");
    expect(libRs).toContain("if !tarball.is_file()");
    expect(libRs).toContain("return Err(installed_error);");
  });
});


const repo = resolve(process.cwd(), "..");
const gitEnv = {GIT_NO_LAZY_FETCH:"1",GIT_TERMINAL_PROMPT:"0",GIT_CONFIG_GLOBAL:process.platform==="win32"?"NUL":"/dev/null",GIT_CONFIG_NOSYSTEM:"1"};
for (const key of ["PATH","Path","SystemRoot","SYSTEMROOT","HOME","USERPROFILE","TEMP","TMP"])
  if(process.env[key])gitEnv[key]=process.env[key];
const git = (root,args) => {
  const p=spawnSync("git",["-C",root,...args],{env:gitEnv,maxBuffer:4*1024*1024});
  if(p.status!==0)throw Error("测试Git失败:"+args[0]);return p.stdout;
};
const sha = b => createHash("sha256").update(b).digest("hex");
function workflowText(root=repo,control=process.env.CREATOROS_WINDOWS_INSTALLER_TEST_CONTROL,commit=process.env.CREATOROS_T247_INSTALLER_CONTROL_COMMIT){
  if(!control)return readFileSync(join(root,".github/workflows/desktop-release.yml"),"utf8");
  if(resolve(control)!==join(root,".t247-validation-control"))throw Error("测试控制目录不符");
  for(const part of [control,join(control,".github"),join(control,".github/workflows")]){const st=fs.lstatSync(part);if(st.isSymbolicLink()||!st.isDirectory())throw Error("测试workflow父目录非法");}
  if(!/^[a-f0-9]{40}$/.test(commit??"")||git(control,["rev-parse","HEAD"]).toString().trim()!==commit)throw Error("测试控制HEAD不符");
  const name=".github/workflows/desktop-release.yml",file=join(control,name),st=fs.lstatSync(file);
  if(!st.isFile()||st.isSymbolicLink())throw Error("测试workflow非普通文件");
  const original=git(control,["show",commit+":"+name]),actual=readFileSync(file);
  if(!actual.equals(original)&&!actual.equals(Buffer.from(original.toString().replace(/\n/g,"\r\n"))))throw Error("测试workflow字节不符");
  return original.toString("utf8");
}
const workflow=workflowText();
const library=workflow.match(/\/\/ T247_INSTALLER_CONTROL_BEGIN\n([\s\S]+?)\/\/ T247_INSTALLER_CONTROL_LIBRARY_END/);
let materializer, sourceCliMaterializer;
const roots=[];
async function loadMaterializer(){
  if(materializer)return materializer;
  if(!library)throw Error("缺精确安装控制装配");
  const root=fs.mkdtempSync(join(tmpdir(),"t247-installer-library-"));roots.push(root);
  const file=join(root,"materializer.mjs");
  fs.writeFileSync(file,library[1].split("\n").map(l=>l.replace(/^ {10}/,"")).join("\n")+"\nexport { materializeInstallerControl, materializeSourceCli };\n");
  const loaded=await import(pathToFileURL(file).href);materializer=loaded.materializeInstallerControl;sourceCliMaterializer=loaded.materializeSourceCli;return materializer;
}
const names=["frontend/src-tauri/windows/installer-hooks.nsh","frontend/scripts/desktop/windows-runtime-config.test.mjs"];
function fixture(){
  const tmp=fs.mkdtempSync(join(tmpdir(),"t247-installer-git-"));roots.push(tmp);
  const source=join(tmp,"source"),control=join(source,".t247-validation-control");fs.mkdirSync(source);
  git(source,["init","--initial-branch=main"]);
  for(const [i,name]of names.entries()){const file=join(source,name);fs.mkdirSync(resolve(file,".."),{recursive:true});fs.writeFileSync(file,"old fixture "+i+"\n");}
  const wf=join(source,".github/workflows/desktop-release.yml");fs.mkdirSync(resolve(wf,".."),{recursive:true});fs.writeFileSync(wf,"old workflow\n");fs.writeFileSync(join(source,"anchor.bin"),"固定合成签名来源\n");
  const commit=root=>{git(root,["add","."]);git(root,["-c","core.hooksPath="+(process.platform==="win32"?"NUL":"/dev/null"),"-c","user.name=T247 fixture","-c","user.email=t247@example.invalid","commit","-m","fixture"]);return git(root,["rev-parse","HEAD"]).toString().trim();};
  const n=commit(source);git(tmp,["clone","--no-hardlinks",source,control]);
  for(const [i,name]of names.entries())fs.writeFileSync(join(control,name),"new fixture "+i+"\n");fs.writeFileSync(join(control,".github/workflows/desktop-release.yml"),"new workflow\n");const h=commit(control);
  const expectedBefore=Object.fromEntries(names.map(name=>[name,sha(git(source,["show",n+":"+name]))]));
  return {root:source,control,source:n,commit:h,anchors:{"anchor.bin":sha(readFileSync(join(source,"anchor.bin")))},expectedBefore,commitFixture:commit};
}
import { afterAll, vi } from "vitest";
afterAll(()=>{for(const root of roots.reverse())fs.rmSync(root,{recursive:true,force:true});});
describe("T247 保留可信安装来源及精确H装配",()=>{
  it("仅Windows consume隔离Rust target缓存，其他模式/平台保持且已有目标硬门不变",()=>{
    const condition=workflow.match(/- uses: Swatinem\/rust-cache@v2\n\s+if: ([^\n]+)\n/)[1].trim();
    expect(condition).toBe("inputs.windows_capsule_mode != 'prepare' && !(runner.os == 'Windows' && inputs.windows_capsule_mode == 'consume')");
    const evaluate=new Function("inputs","runner","return ("+condition+");");
    for(const [os,mode,wanted]of [["Windows","consume",false],["Windows","none",true],["Windows","",true],["Windows","prepare",false],["macOS","consume",true],["macOS","none",true],["macOS","",true],["macOS","prepare",false]])
      expect(evaluate({windows_capsule_mode:mode},{os}),os+":"+mode).toBe(wanted);
    const helper=readFileSync(join(repo,"tools/windows-closure-rat/signed-sidecar-capsule.mjs"),"utf8");
    expect(helper).toContain("if(existsSync(zip)||existsSync(root))throw Error('固定下载目标已存在')");
  });

  it("成功安装保留原签名归档供原Rust启动和后台BLAKE3，卸载仍清目录",()=>{
    const hook=readFileSync(join(process.cwd(),"src-tauri/windows/installer-hooks.nsh"),"utf8");
    expect(hook).not.toMatch(/^\s*Delete\s+"\$INSTDIR\\sidecar\.tar\.gz(?:\.sig)?"/m);
    const lib=readFileSync(join(process.cwd(),"src-tauri/src/lib.rs"),"utf8");
    expect(lib).toContain("verify_release_signature(&tarball)?;");
    expect(lib).toContain("release_integrity::verify_tarball(&tarball, &RELEASE_SIDECAR_BLAKE3");
    expect(workflow).toContain('foreach ($resource in @("sidecar.tar.gz", "sidecar.tar.gz.sig"))');
    expect(workflow).toContain('$installedHash -ne $inputHash');
    expect(workflow).toContain('$installedResource.Length -ne 104');
    expect(workflow).toContain('IO.FileAttributes]::ReparsePoint');
    const mkdir=workflow.indexOf('$null = New-Item -ItemType Directory -Force -Path (Split-Path -Parent $evidencePath)');
    const output=workflow.indexOf('$evidence | ConvertTo-Json -Depth 6 | Out-File $evidencePath');
    expect(mkdir).toBeGreaterThan(-1);expect(output).toBeGreaterThan(mkdir);
    expect(workflow).toContain("steps.t247_windows_runtime_install.outcome == 'success'");
    expect(workflow).toContain('[T-557] 主动卸载后仍残留安装目录:');
  });
  it("测试显式只读H workflow原blob，不能把N旧workflow冒成H验收",()=>{
    const f=fixture();expect(workflowText(f.root,null,null)).toBe("old workflow\n");
    expect(workflowText(f.root,f.control,f.commit)).toBe("new workflow\n");
    expect(()=>workflowText(f.root,f.control,"0".repeat(40))).toThrow("测试控制HEAD不符");
    fs.writeFileSync(join(f.control,".github/workflows/desktop-release.yml"),"foreign workflow\n");
    expect(()=>workflowText(f.root,f.control,f.commit)).toThrow("测试workflow字节不符");
  });
  it("真实临时Git CRLF工作树仅装配H的两文件，主N workflow和签名来源不变",async()=>{
    const run=await loadMaterializer(),f=fixture();git(f.root,["config","core.autocrlf","true"]);git(f.control,["config","core.autocrlf","true"]);
    for(const base of [f.root,f.control]){for(const name of [...names,".github/workflows/desktop-release.yml"])fs.unlinkSync(join(base,name));git(base,["checkout","--",...names,".github/workflows/desktop-release.yml"]);}
    const originalWorkflow=readFileSync(join(f.root,".github/workflows/desktop-release.yml"));const result=run(f);
    expect(result.status).toBe("passed");expect(result.paths).toHaveLength(2);expect(result.paths.every(x=>x.sourceKind==="exact-LF-to-CRLF")).toBe(true);
    for(const name of names)expect(readFileSync(join(f.root,name))).toEqual(git(f.control,["show",f.commit+":"+name]));
    expect(readFileSync(join(f.root,".github/workflows/desktop-release.yml"))).toEqual(originalWorkflow);expect(result.anchorsAfter).toEqual(result.anchorsBefore);
  });
  it("错N/H、缺blob、foreign和链接均拒，不能覆盖未知源",async()=>{
    const run=await loadMaterializer();
    for(const kind of ["source","control","missing","foreign","controlforeign","sourcehash","link","allowlist","anchor"]){
      const f=fixture();
      if(kind==="source")f.source="0".repeat(40);
      if(kind==="control")f.commit="0".repeat(40);
      if(kind==="missing"){fs.unlinkSync(join(f.control,names[1]));f.commit=f.commitFixture(f.control);}
      if(kind==="foreign")fs.writeFileSync(join(f.root,names[1]),"foreign\n");
      if(kind==="controlforeign")fs.writeFileSync(join(f.control,names[1]),"foreign\n");
      if(kind==="sourcehash")f.expectedBefore[names[1]]="0".repeat(64);
      if(kind==="link"){fs.unlinkSync(join(f.root,names[1]));fs.symlinkSync(join(f.control,names[1]),join(f.root,names[1]));}
      if(kind==="allowlist")f.expectedBefore={"../escape":"0".repeat(64)};
      if(kind==="anchor")fs.writeFileSync(join(f.root,"anchor.bin"),"changed");
      expect(()=>run(f),kind).toThrow();expect(readFileSync(join(f.root,names[0])).toString()).toBe("old fixture 0\n");
    }
  },120000);
  it("两文件预审后逐次写前CAS仍拒晚变更，失败不继续release",async()=>{
    const run=await loadMaterializer(),f=fixture(),rename=fs.renameSync;
    const spy=vi.spyOn(fs,"renameSync").mockImplementation((from,to)=>{const result=rename(from,to);if(to===join(f.root,names[0]))fs.writeFileSync(join(f.root,names[1]),"late foreign\n");return result;});
    try{expect(()=>run(f)).toThrow("INSTALLER_CHANGED_BEFORE_RENAME");expect(readFileSync(join(f.root,names[1])).toString()).toBe("late foreign\n");}finally{spy.mockRestore();}
  });
});

const sourceCliNames=["frontend/scripts/desktop/build-sidecar.mjs","frontend/scripts/desktop/fetch-ffmpeg.mjs","frontend/scripts/desktop/macos-runtime-compat.mjs"];
function sourceCliFixture(){
  const f=fixture();
  for(const name of sourceCliNames)fs.writeFileSync(join(f.root,name),git(repo,["show","76d0ff4749ebe4b08fb81afeb7d36c60de922bd8:"+name]));
  f.source=f.commitFixture(f.root);git(f.root,["config","core.autocrlf","true"]);
  for(const name of sourceCliNames)fs.unlinkSync(join(f.root,name));git(f.root,["checkout","--",...sourceCliNames]);return f;
}
describe("T247 固定N三CLI原blob在Vitest加载边界保持",()=>{
  it("真实N三份CLI checkout CRLF完整恢复原Git字节，H与锚不动",async()=>{
    await loadMaterializer();const f=sourceCliFixture(),anchor=readFileSync(join(f.root,"anchor.bin")),h=f.commit;
    const result=sourceCliMaterializer(f);expect(result.status).toBe("passed");expect(result.paths.map(x=>x.path)).toEqual(sourceCliNames);
    expect(result.paths.every(x=>x.beforeKind==="exact-LF-to-CRLF")).toBe(true);
    for(const name of sourceCliNames)expect(readFileSync(join(f.root,name))).toEqual(git(f.root,["show",f.source+":"+name]));
    expect(readFileSync(join(f.root,"anchor.bin"))).toEqual(anchor);expect(git(f.control,["rev-parse","HEAD"]).toString().trim()).toBe(h);
    expect(sourceCliMaterializer(f).paths.every(x=>x.beforeKind==="exact")).toBe(true);
  });
  it("错HEAD、缺blob、foreign、link、错误身份与额外集合全预检拒，第一项不先写",async()=>{
    await loadMaterializer();
    for(const kind of ["head","missing","foreign","link","identity","extra"]){
      const f=sourceCliFixture(),first=readFileSync(join(f.root,sourceCliNames[0]));
      if(kind==="head")f.source="0".repeat(40);
      if(kind==="missing"){fs.unlinkSync(join(f.root,sourceCliNames[2]));f.source=f.commitFixture(f.root);}
      if(kind==="foreign")fs.writeFileSync(join(f.root,sourceCliNames[2]),"foreign\n");
      if(kind==="link"){fs.unlinkSync(join(f.root,sourceCliNames[2]));fs.symlinkSync(join(f.root,sourceCliNames[1]),join(f.root,sourceCliNames[2]));}
      if(kind==="identity")f.expected=Object.fromEntries(sourceCliNames.map(name=>[name,"0".repeat(64)]));
      if(kind==="extra")f.expected={"../foreign":"0".repeat(64)};
      expect(()=>sourceCliMaterializer(f),kind).toThrow();expect(readFileSync(join(f.root,sourceCliNames[0]))).toEqual(first);
    }
  },120000);
  it("N三CLI逐写前CAS拒迟到修改，不把未知内容清洗为可信字节",async()=>{
    await loadMaterializer();const f=sourceCliFixture(),rename=fs.renameSync;
    const spy=vi.spyOn(fs,"renameSync").mockImplementation((from,to)=>{const result=rename(from,to);if(to===join(f.root,sourceCliNames[0]))fs.writeFileSync(join(f.root,sourceCliNames[1]),"late foreign\n");return result;});
    try{expect(()=>sourceCliMaterializer(f)).toThrow("SOURCE_CLI_CHANGED_BEFORE_RENAME");expect(readFileSync(join(f.root,sourceCliNames[1])).toString()).toBe("late foreign\n");}finally{spy.mockRestore();}
  });
  it("正式H装配调用显式启用N三CLI门，仍包在原tar签名锚前后且原测试照跑",()=>{
    expect(workflow).toContain("anchors,sourceCliRequired:true});");
    const before=workflow.indexOf("report.anchorsBefore=readAnchors();"),gate=workflow.indexOf("if(sourceCliRequired===true)report.sourceCli=materializeSourceCli({root,source});"),after=workflow.indexOf("report.anchorsAfter=readAnchors();");
    expect(before).toBeGreaterThan(-1);expect(gate).toBeGreaterThan(before);expect(after).toBeGreaterThan(gate);
    expect(workflow).toContain('pnpm -C frontend exec vitest run scripts/desktop/windows-runtime-config.test.mjs');
    for(const name of sourceCliNames)expect(workflow).toContain("'"+name+"':'"+sha(git(repo,["show","76d0ff4749ebe4b08fb81afeb7d36c60de922bd8:"+name]))+"'");
  });
});
