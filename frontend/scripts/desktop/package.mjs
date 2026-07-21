#!/usr/bin/env node
// [T-147 P1] 桌面端一键打包流水线 —— 「以后 pnpm desktop:package 一键重打」(用户硬要求)。
//
// 全链:① sidecar 二进制化(next standalone build + 组装 + node runtime)→ ② tauri build 出
//       未签名 .app/.dmg。业务代码每次改完,跑这一条命令即可重出桌面包。
//
// 参照 skills-manager/scripts/run-rust-cli.mjs 的 cargo 解析健壮性(cargo 不在 PATH 时回退
// rustup which)。sidecar 二进制化是 CreatorOS 自研(Next SSR,非 skills-manager 的 Rust CLI)。
//
// 诚实边界:
//   - 未签名/未公证。codesign/notarize(mac)+ Authenticode(win)需**用户的证书**,不在 P1。
//     签名接入见 tauri.conf.json bundle.macOS.signingIdentity / bundle.windows.certificateThumbprint。
//   - 仅产本机 target。跨平台(win/mac-x64)需在对应平台跑本脚本。

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve, delimiter } from "node:path";
import { fileURLToPath } from "node:url";
import { platform } from "node:process";

const FRONTEND = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

// cargo 解析(skills-manager 模式):PATH 上有就用;否则 rustup which rustc 推 cargo。
function canRun(cmd, args = ["--version"]) {
  return spawnSync(cmd, args, { stdio: "ignore" }).status === 0;
}
function resolveCargo() {
  if (process.env.CARGO && existsSync(process.env.CARGO)) return process.env.CARGO;
  if (canRun("cargo")) return "cargo";
  const r = spawnSync("rustup", ["which", "rustc"], { encoding: "utf8" });
  if (r.status === 0 && r.stdout.trim()) {
    const cargoPath = join(dirname(r.stdout.trim()), "cargo");
    if (existsSync(cargoPath)) return cargoPath;
  }
  console.error("[desktop:package] cargo 未找到。装 Rust 或确保 cargo/rustup 在 PATH。");
  process.exit(127);
}

function step(name, cmd, args, extraEnv = {}) {
  console.log(`\n[desktop:package] ▶ ${name}\n[desktop:package]   $ ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, {
    stdio: "inherit",
    cwd: FRONTEND,
    env: { ...process.env, ...extraEnv },
  });
  if (r.status !== 0) {
    console.error(`[desktop:package] ✗ 步骤失败:${name}(exit ${r.status})`);
    process.exit(r.status ?? 1);
  }
}

// [T-445] 最终产物闸：只看 build-sidecar 的工作目录不够，用户安装的是 Tauri 产出的 .app。
// 这次真实事故发生在用户仍使用旧安装包；以后每次构建都直接检查最终 .app，避免误发残缺产物：
//   ① 当前 Node 若是 shared-openssl，内嵌 tar 必须真含 libssl + libcrypto；
//   ② 壳二进制必须真编进 `--use-bundled-ca`，否则用户机仍会去找构建机 Homebrew cert.pem。
// Homebrew 本身不应随 App 分发，cert.pem 也不复制；运行库 co-ship，根证书用 Node 内置集合。
function verifyPackagedTlsRuntime() {
  if (platform !== "darwin") return;

  const app = join(FRONTEND, "src-tauri", "target", "release", "bundle", "macos", "CreatorOS.app");
  const tarball = join(app, "Contents", "Resources", "sidecar.tar.gz");
  const sourceTarball = join(FRONTEND, "src-tauri", "sidecar.tar.gz");
  const shellBin = join(app, "Contents", "MacOS", "CreatorOS");
  const bundledNode = join(
    FRONTEND,
    "src-tauri",
    "sidecar",
    "server.app",
    "Contents",
    "MacOS",
    "creatoros-server",
  );
  for (const file of [tarball, sourceTarball, shellBin, bundledNode]) {
    if (!existsSync(file)) {
      throw new Error(`[desktop:package] [T-445] 最终产物自检失败：缺 ${file}`);
    }
  }

  // Tauri 必须装入本轮刚生成的 tar，不能误带上一次构建的旧 resource。
  const sameTar = spawnSync("cmp", ["-s", sourceTarball, tarball]);
  if (sameTar.status !== 0) {
    throw new Error(
      "[desktop:package] [T-445] 最终产物自检失败：.app 内 sidecar.tar.gz 与本轮构建产物不一致（疑似误带旧包）",
    );
  }

  const usesSharedOpenSsl =
    process.config?.variables?.node_shared_openssl === true ||
    process.config?.variables?.node_shared_openssl === "true";
  if (usesSharedOpenSsl) {
    // sidecar 含 Chromium/依赖树，目录清单可超过 spawnSync 默认 1MB maxBuffer；显式放大，
    // 否则会被 ENOBUFS 杀掉并被误报成「无法读取 tar」。
    const listed = spawnSync("tar", ["-tzf", tarball], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    if (listed.status !== 0) {
      throw new Error(
        `[desktop:package] [T-445] 最终产物自检失败：无法读取 sidecar.tar.gz\n${listed.error?.code ?? ""}\n${listed.stderr ?? ""}`,
      );
    }
    const entries = listed.stdout.split("\n");
    for (const lib of ["libssl", "libcrypto"]) {
      if (!entries.some((entry) => entry.startsWith(`./lib/${lib}.`) || entry.startsWith(`lib/${lib}.`))) {
        throw new Error(
          `[desktop:package] [T-445] 最终产物自检失败：shared-openssl Node 但 .app 内嵌 sidecar 缺 ${lib}，用户机将无法启动/联网`,
        );
      }
    }
  }

  if (!readFileSync(shellBin).includes(Buffer.from("--use-bundled-ca"))) {
    throw new Error(
      "[desktop:package] [T-445] 最终产物自检失败：壳二进制未包含 --use-bundled-ca，用户机仍会依赖构建机 cert.pem",
    );
  }

  // 隔离 HTTPS 冒烟：明确把 OpenSSL 外部证书路径指向不存在位置，逼它只能走 Node 内置 CA。
  // 不只数证书条目，真做 TLS 握手；T-445 原故障正是 `fetch` 才暴露。
  const missingCert = join(FRONTEND, "src-tauri", "__t445_missing_cert__.pem");
  const missingCertDir = join(FRONTEND, "src-tauri", "__t445_missing_certs__");
  if (existsSync(missingCert) || existsSync(missingCertDir)) {
    throw new Error("[desktop:package] [T-445] 隔离探针占位路径意外存在，请删除后重试");
  }
  const httpsProbe = spawnSync(
    bundledNode,
    [
      "--use-bundled-ca",
      "-e",
      "fetch('https://example.com/').then(r=>{console.log('TLS_OK='+r.status);process.exit(r.ok?0:1)}).catch(e=>{console.error(e.cause?.code||e);process.exit(2)})",
    ],
    {
      encoding: "utf8",
      timeout: 30_000,
      env: {
        ...process.env,
        SSL_CERT_FILE: missingCert,
        SSL_CERT_DIR: missingCertDir,
      },
    },
  );
  if (httpsProbe.status !== 0 || !httpsProbe.stdout.includes("TLS_OK=200")) {
    throw new Error(
      `[desktop:package] [T-445] 最终产物自检失败：随包 Node 在无外部 cert.pem 时 HTTPS 不通\n${httpsProbe.stdout}${httpsProbe.stderr}`,
    );
  }
  console.log(
    `[desktop:package] ✓ [T-445] 最终 .app TLS 自包含：${usesSharedOpenSsl ? "libssl + libcrypto 已入内嵌 tar；" : "Node 非 shared-openssl；"}--use-bundled-ca 已入壳；无外部 cert.pem 的 HTTPS=200`,
  );
}

// 允许 CI/本地在已有 Tauri 产物上单独重跑最终闸，不重复整条 Next/混淆流水线。
if (process.argv.includes("--verify-tls-only")) {
  verifyPackagedTlsRuntime();
  process.exit(0);
}

const cargo = resolveCargo();
const cargoBinDir = cargo === "cargo" ? "" : dirname(cargo);
const pathEnv = cargoBinDir ? { PATH: `${cargoBinDir}${delimiter}${process.env.PATH ?? ""}` } : {};

console.log("[desktop:package] CreatorOS 桌面端打包开始。");

// [T-226] DMG 打包前清残留挂载/临时镜像。bundle_dmg.sh 一次中途崩(AppleScript/Finder 步)
// 会留下 rw.PID.*.dmg 临时镜像 + 挂着的 /Volumes/CreatorOS* 卷;之后每次 DMG 打包都会因
// 残留卷再崩,自我固化成「DMG 永远打不出来」(T-226 真因;报错里的 EcmaScript 警告是
// next build 的无关 WARN)。此处 best-effort 预清:只 detach 镜像路径在本仓 bundle 目录
// 下的挂载,并删两处 rw.*.dmg 残留;清不掉只告警不 fail(不动主线 app/updater 打包)。
// 手动解卡:node scripts/desktop/package.mjs --preclean-only
function precleanDmgLeftovers() {
  // [T-372 W-core §11.2-6] hdiutil / DMG 残留是 macOS 专属概念 —— Windows/Linux 打包机上
  // spawn hdiutil 只会 ENOENT 噪音(status 非 0 本就跳过,但守卫掉更干净,也免 Win 上找不到
  // 命令的告警干扰打包日志)。
  if (platform !== "darwin") return;
  const bundleDir = join(FRONTEND, "src-tauri", "target", "release", "bundle");
  const info = spawnSync("hdiutil", ["info"], { encoding: "utf8" });
  if (info.status === 0 && info.stdout) {
    // hdiutil info 按 image 分段:image-path 行 + 其下 /dev/diskN 行。
    let currentImage = "";
    for (const line of info.stdout.split("\n")) {
      const imgMatch = line.match(/^image-path\s*:\s*(.+)$/);
      if (imgMatch) currentImage = imgMatch[1].trim();
      const devMatch = line.match(/^(\/dev\/disk\d+)/);
      if (devMatch && currentImage.startsWith(bundleDir)) {
        const dev = devMatch[1].replace(/s\d+$/, "");
        console.log(`[desktop:package] [T-226] 预清残留挂载:${dev}(${currentImage})`);
        const r = spawnSync("hdiutil", ["detach", dev, "-force"], { stdio: "inherit" });
        if (r.status !== 0) console.warn(`[desktop:package] ⚠ detach ${dev} 失败(继续,不阻塞)`);
        currentImage = "";
      }
    }
  }
  for (const sub of ["macos", "dmg"]) {
    const dir = join(bundleDir, sub);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (/^rw\.\d+\..*\.dmg$/.test(f)) {
        console.log(`[desktop:package] [T-226] 删残留临时镜像:${join(sub, f)}`);
        try {
          rmSync(join(dir, f), { force: true });
        } catch (e) {
          console.warn(`[desktop:package] ⚠ 删除失败(继续):${e?.message ?? e}`);
        }
      }
    }
  }
}
precleanDmgLeftovers();
if (process.argv.includes("--preclean-only")) {
  console.log("[desktop:package] [T-226] --preclean-only:预清完成,退出。");
  process.exit(0);
}

// 1) sidecar 二进制化(内部会跑 CREATOROS_DESKTOP=1 next build)。
step("sidecar 二进制化", process.execPath, [join("scripts", "desktop", "build-sidecar.mjs")]);

// 2) [T-164 P6] sidecar bundle JS 混淆(build-sidecar 之后、tauri build 之前)。
//    幂等 + 硬排除 + symlink 逃逸防护;失败 fail-fast(见 obfuscate.mjs)。
//    ⚠️ tauri.conf.json beforeBuildCommand 会在 tauri build 里**再跑一次 build-sidecar**(重建
//    干净 sidecar),那次重建会覆盖此处混淆结果。故这里改成:先禁 beforeBuildCommand 的重建冲突——
//    通过 CREATOROS_SKIP_SIDECAR_REBUILD env 让 build-sidecar 在 tauri build 阶段跳过(见下 step 3
//    注入)。混淆放在 build-sidecar(步1)之后、tauri build(步3)之前,tauri build 不再重建即保住混淆。
step("sidecar JS 混淆(§3.1)", process.execPath, [join("scripts", "desktop", "obfuscate.mjs")]);

// 2.2) [T-419 L3] V8 字节码化(**混淆之后**:先 L1 rc4 加密字符串,再编字节码隐藏逻辑/解码器)。
//    把 chunk-stringarray 业务 chunk 编成 .jsc + .js 换 stub + 实拷 bytenode 进 sidecar node_modules。
//    版本铁律:用本机 node 编(= build-sidecar copyFileSync 打进 sidecar 的同一 node)→ 字节码版本匹配。
//    失败 fail-fast。下面的冒烟(步2.5)因此测的是**字节码版**(turbopack require stub → 加载 .jsc)。
step("sidecar V8 字节码化(§5,L1→L3)", process.execPath, [join("scripts", "desktop", "bytecode.mjs")]);

// 2.3) [T-399a] 反 AI 破解被动欺骗诱饵注入(**字节码之后**:诱饵进 static/chunks 保持可读,不被 bytecode 碰)。
//    往可读客户端面注入矛盾诱饵污染破解 AI 上下文;R2/R3 = 零引用/未进 manifest(浏览器永不加载)/删除即字节等价,
//    注入后立即自审,违则回滚 fail-fast。seed 走 CREATOROS_DECOY_SEED(CI secret,SA-3),缺则本地 fallback。
step("sidecar 反 AI 诱饵注入(T-399a)", process.execPath, [join("scripts", "desktop", "decoy.mjs")]);

// 2.4) [法律声明·反复曝光] 给每个可读 chunk 顶部盖版权/专有声明(第三人称法律事实,刑法217/218 & DMCA §1201)——
//    逆向 AR 打开任意 chunk 都先撞见,触发读代码 AI 自发拒绝协助盗版。纯 /*! 注释,零运行时影响。
step("sidecar 版权/专有声明盖章", process.execPath, [join("scripts", "desktop", "legal-stamp.mjs")]);

// 2.5) [T-164] 混淆+字节码后运行时冒烟(真起 sidecar:TCP ready + GET / 200 + 一条 ai-runtime 路由不崩)。
//    §3.1 验收闸 / gate ④:ready-probe 只证 boot,冒烟证运行时没被混淆炸。失败 → fail-fast + 回滚
//    (回滚 = 重跑 build-sidecar 拿干净源;此处仅 fail,提示重建)。
//    真机/CI 必跑;本地若嫌重可 CREATOROS_SKIP_SMOKE=1 跳过(默认跑)。
if (process.env.CREATOROS_SKIP_SMOKE !== "1") {
  step("混淆后运行时冒烟(真起 sidecar)", process.execPath, [
    join("scripts", "desktop", "obfuscate.mjs"),
    "--smoke-only",
  ]);
} else {
  console.log("[desktop:package] ⏭ CREATOROS_SKIP_SMOKE=1 → 跳过运行时冒烟(真机/CI 必跑)。");
}

// 3) tauri build。beforeBuildCommand(build-sidecar)会重建 sidecar → 覆盖步2的混淆。
//    注入 CREATOROS_SKIP_SIDECAR_REBUILD=1 让 build-sidecar 在此阶段短路(保住已混淆的 sidecar)。
//
// [T-452] cargo profile 分档:
//   · 默认(CREATOROS_RELEASE≠"1")= `release-fast`:lto=thin + codegen-units=16,cargo build
//     ~5-8 min(vs fat lto 15-30 min);内测/日常打包用。
//   · CREATOROS_RELEASE=1 = fat `release`:lto=true + codegen-units=1,cargo build ~15-30 min;
//     体积/启动最优,发官方 release 那一次用。
//   代价:release-fast 二进制大几百 KB,冷启动差 < 30ms(用户不可感)。
const isFullRelease = process.env.CREATOROS_RELEASE === "1";
const tauriBuildArgs = [
  join("node_modules", "@tauri-apps", "cli", "tauri.js"),
  "build",
];
if (!isFullRelease) {
  // [T-452 后修] tauri CLI 本身不认 `--profile`;放在 `--` 后作为 cargo 参数透传。
  //   实测 CI 报 `error: unexpected argument '--profile' found ... tip: to pass '--profile'
  //   as a value, use '-- --profile'`。
  tauriBuildArgs.push("--", "--profile", "release-fast");
  console.log(
    "[desktop:package] [T-452] cargo profile = release-fast(lto=thin;内测/日常快打)。发正式包设 CREATOROS_RELEASE=1 走 fat lto。",
  );
} else {
  console.log(
    "[desktop:package] [T-452] cargo profile = release(fat lto,正式发布档;15-30 min)。",
  );
}
step("tauri build(含 updater 签名/占位)", process.execPath, tauriBuildArgs, {
  ...pathEnv,
  CREATOROS_SKIP_SIDECAR_REBUILD: "1",
});

verifyPackagedTlsRuntime();

// 4) [T-164 P6] 代码签名占位(未配 env → skip 退 0 + 标 signed:false)。
step("代码签名(占位)", process.execPath, [join("scripts", "desktop", "codesign.mjs")]);

// 5) [T-164 P6] 公证占位(未配 env → skip 退 0 + 标 notarized:false)。
step("公证(占位)", process.execPath, [join("scripts", "desktop", "notarize.mjs")]);

console.log(
  "\n[desktop:package] ✅ 完成。产物在 src-tauri/target/release/bundle/(macos/*.app + dmg/*.dmg)。",
);
console.log("[desktop:package] 签名/公证状态见 bundle/creatoros-release-manifest.json(未配证书则 signed:false)。");
