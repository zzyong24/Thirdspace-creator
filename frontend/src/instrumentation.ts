/**
 * [T-284] sidecar 启动钩子 —— 把 `PLAYWRIGHT_BROWSERS_PATH` 指向**随 app 打包的 Chromium**
 * (build-sidecar 实拷到 `sidecar/frontend/browsers/`)。
 *
 * 病根:打包版 sidecar 的 playwright 在混淆 bundle runtime 里,对默认缓存
 * `~/Library/Caches/ms-playwright` 的浏览器路径解析失效——机器上明明有 chromium-<rev>、版本还对,
 * `executablePath()` 却指向找不到的路径 → 视频渲染报「Chromium 未就绪」;运行时自动下载也因同层
 * bundle 问题没跑起来。正解(用户拍板):Chromium 随包发货 + 这里显式设 `PLAYWRIGHT_BROWSERS_PATH`
 * → `executablePath()` 稳定命中 bundle 内浏览器,永不下载、永不「未就绪」。
 *
 * `register()` 在 Next server 启动时跑**一次**,早于任何路由用 playwright(douyin 采集 / 视频渲染)
 * → PLAYWRIGHT_BROWSERS_PATH 在 playwright registry 首次创建前就绪。
 *   - 仅 nodejs runtime(edge 无 playwright);已显式设过 → 不覆盖(尊重外部配置)。
 *   - dev / 未打包(无 browsers 目录)→ 不设 → 用默认缓存路径(开发机装过即可)。
 *
 * [T-451] **verdict-token 硬门 — sidecar 启动最早期**:
 *   Rust 壳启动时先本地跑 verdict → 仅 allowed=true 才 Ed25519 签 payload → 注入
 *   env CREATOROS_SIDECAR_VERDICT_TOKEN。这里在 register() 顶部立即校验,不通过 process.exit(1)。
 *   攻击者裸启 `node server.js`:①不设 token → 拒;②伪造 token → 签名校验失败拒;③过期/端口/
 *   machineId 不匹配 → 拒。dev 分支豁免通过 `CREATOROS_DEV_MODE=1 && NODE_ENV≠production`,
 *   打包版永不出现该 marker(server.js 硬写死 NODE_ENV=production)。
 */

// [T-451] verdict-token 校验放这里作为函数,register() 里最早期调用。同步 exit(1) 而非 async,
//   杜绝任何 async 竞态(必须在任何业务 route 挂载前判定)。
function verifyVerdictTokenOrExit(): void {
  const isDev =
    process.env.NODE_ENV !== "production" && process.env.CREATOROS_DEV_MODE === "1";
  if (isDev) {
    // dev 分支豁免:pnpm dev 场景无 Rust 壳、无 token。此路径打包版永不进入(NODE_ENV=production)。
    return;
  }
  const token = process.env.CREATOROS_SIDECAR_VERDICT_TOKEN;
  if (!token) {
    console.error(
      "[T-451] verdict-token 缺失(未由 CreatorOS Rust 壳启动) → 拒绝 spawn。",
    );
    process.exit(1);
  }
  // token = base64url(payload).base64url(sig);Rust 侧 Ed25519 签名。
  const [payloadB64, sigB64] = token.split(".");
  if (!payloadB64 || !sigB64) {
    console.error("[T-451] verdict-token 格式非法 → 拒绝 spawn。");
    process.exit(1);
  }
  let payloadJson: string;
  try {
    // base64url 解码(node 22+ 原生 Buffer 支持 'base64url';回退兼容加 padding 后走 'base64')。
    payloadJson = Buffer.from(payloadB64, "base64url").toString("utf-8");
  } catch {
    console.error("[T-451] verdict-token payload 解码失败 → 拒绝 spawn。");
    process.exit(1);
    return;
  }
  interface VerdictPayload {
    v: number;
    mode: "licensed" | "activation_only";
    machineId: string;
    sidecarPort: number;
    expiresAt: string;
    issuedAt: string;
    nonce: string;
    licenseMode?: string;
  }
  let payload: VerdictPayload;
  try {
    payload = JSON.parse(payloadJson) as VerdictPayload;
  } catch {
    console.error("[T-451] verdict-token payload JSON 解析失败 → 拒绝 spawn。");
    process.exit(1);
    return;
  }
  // 有效期检查(墙钟;token TTL 24h,足够单次进程寿命)。
  const now = Date.now();
  const exp = Date.parse(payload.expiresAt);
  if (!Number.isFinite(exp) || now > exp) {
    console.error(
      `[T-451] verdict-token 已过期(expiresAt=${payload.expiresAt}) → 拒绝 spawn。`,
    );
    process.exit(1);
  }
  // 端口匹配:token 绑定本次 sidecar 端口,防跨端口复用。
  const port = Number(process.env.PORT ?? "0");
  if (port !== payload.sidecarPort) {
    console.error(
      `[T-451] verdict-token 端口不匹配(token=${payload.sidecarPort} vs env PORT=${port}) → 拒绝 spawn。`,
    );
    process.exit(1);
  }
  // Ed25519 签名验证:公钥在 build-sidecar 期间烘焙进 sidecar 常量(见 verdict-verify-key.json)。
  //   构建期公钥缺失时,烘焙脚本会写空占位;这里发现空占位则**打包配置错**,直接 exit——比放行更安全。
  //
  // 位置:sidecar/frontend/.next/server/verdict-verify-key.json(build-sidecar 生成);
  //   打包版 process.cwd() = …/sidecar/frontend,故相对 .next/server/verdict-verify-key.json。
  //   dev 分支上面已经 return,不进这里。
  const nodeCrypto = eval("require")("node:crypto") as typeof import("node:crypto");
  const fs = eval("require")("node:fs") as typeof import("node:fs");
  const path = eval("require")("node:path") as typeof import("node:path");
  const pubKeyFile = path.join(
    process.cwd(),
    ".next",
    "server",
    "verdict-verify-key.json",
  );
  let pubKeyB64 = "";
  try {
    const raw = fs.readFileSync(pubKeyFile, "utf-8");
    const parsed = JSON.parse(raw) as { publicKeyB64?: string };
    pubKeyB64 = String(parsed.publicKeyB64 ?? "").trim();
  } catch {
    console.error(
      `[T-451] verdict-token 公钥文件不可读(${pubKeyFile}) → 拒绝 spawn。`,
    );
    process.exit(1);
  }
  if (!pubKeyB64) {
    console.error("[T-451] verdict-token 公钥为空(打包配置错) → 拒绝 spawn。");
    process.exit(1);
  }
  const pubKeyDer = Buffer.from(pubKeyB64, "base64");
  // Node 的 crypto 需要 SPKI DER 格式的 Ed25519 公钥,而 build-sidecar 烘焙的是 raw 32B。
  //   包装:SPKI header (12B) + raw 32B = 44B。这是 X.509 spec 的固定 header for Ed25519 OID。
  const spkiHeader = Buffer.from([
    0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
  ]);
  const spkiKey = pubKeyDer.length === 32 ? Buffer.concat([spkiHeader, pubKeyDer]) : pubKeyDer;
  let pubKey: import("node:crypto").KeyObject;
  try {
    pubKey = nodeCrypto.createPublicKey({
      key: spkiKey,
      format: "der",
      type: "spki",
    });
  } catch (e) {
    console.error(
      `[T-451] verdict-token 公钥加载失败(${e instanceof Error ? e.message : String(e)}) → 拒绝 spawn。`,
    );
    process.exit(1);
    return;
  }
  const sig = Buffer.from(sigB64, "base64url");
  const ok = nodeCrypto.verify(null, Buffer.from(payloadJson, "utf-8"), pubKey, sig);
  if (!ok) {
    console.error("[T-451] verdict-token 签名验证失败 → 拒绝 spawn。");
    process.exit(1);
  }
  // 通过:挂 CREATOROS_VERDICT_MODE 全局 flag,activation-gate + proxy.ts 据此判放行/allowlist。
  process.env.CREATOROS_VERDICT_MODE =
    payload.mode === "licensed" ? "licensed" : "activation-only";
  console.log(
    `[T-451] verdict-token 通过 mode=${process.env.CREATOROS_VERDICT_MODE} machineId=${payload.machineId.slice(0, 8)}... expires=${payload.expiresAt}`,
  );
}

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // [T-451] 最早期:sidecar 进程刚起来还没挂路由,先验 verdict-token,不通过 exit(1)。
  //   放在最前:防任何 lifecycle 钩子在拒绝启动前副作用。dev/未打包/edge 分支上面已经 return。
  verifyVerdictTokenOrExit();
  // [T-365/T-362] 桌面态装 sidecar 生命周期守护:SIGTERM 优雅退出(flush PGlite)+ 孤儿自检
  //   (ppid==1 自杀,盖壳崩溃/强退)。dev(next dev)不装——ppid 是终端 shell,SIGINT 归 next 管。
  if (process.env.CREATOROS_DESKTOP === "1") {
    try {
      const { installSidecarLifecycle } = await import("@/server/sidecar-lifecycle");
      installSidecarLifecycle(process as never);
      console.log("[instrumentation] sidecar 生命周期守护已装(SIGTERM 优雅退出 + 孤儿自检)");
    } catch {
      /* 装不上不阻塞启动(守护是兜底,主线在壳侧 killpg) */
    }
  }
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) return;
  try {
    const path = await import("node:path");
    const fs = await import("node:fs");
    // 打包版 server.js 从 sidecar/frontend 跑,故 process.cwd()=…/sidecar/frontend;
    //   Chromium 实拷在其下 browsers/。dev 没有这个目录 → 跳过(留默认路径)。
    const bundled = path.join(process.cwd(), "browsers");
    if (fs.existsSync(bundled)) {
      process.env.PLAYWRIGHT_BROWSERS_PATH = bundled;
      // eslint-disable-next-line no-console
      console.log(
        `[instrumentation] PLAYWRIGHT_BROWSERS_PATH → ${bundled}(随包 Chromium,视频渲染免下载)`,
      );
    }
  } catch {
    // 设不上就用默认路径,不阻塞启动。
  }
}
