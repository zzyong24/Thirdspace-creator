# CreatorOS 桌面壳(Tauri v2)—— T-147 P1 底座

> 桌面化是**新增壳**,不改现有 web 运行方式(`pnpm dev` / `pnpm build` 照旧,已验证不受影响)。
> 总纲:`docs/superpowers/specs/2026-07-05-desktop-app-architecture-overview.md` + `docs/desktop-architecture-rfc.md`。
> 参照本机可跑的 Tauri app `~/Workbase/skills-manager`(借鉴其 conf 结构/双配/updater slot/cargo 解析健壮性;
> 但它前端是 Vite 静态 dist,CreatorOS 是 Next.js SSR → sidecar 二进制化为本项目自研)。

## 架构(sidecar 方案 B)

```
Tauri Rust core ──spawn──► sidecar (随包 node) ──跑──► next standalone frontend/server.js
     │  注入 PORT / HOSTNAME=127.0.0.1 / CREATOROS_DB_DIR / NODE_ENV / DYLD_LIBRARY_PATH  │
     │                                                                                   ├─ /api/v1/dispatch(进程内库调 backend/ai-worker)
     └─ WebView(WebKit)──HTTP──► 127.0.0.1:PORT ◄──────────────────────────────────────┴─ PGlite(WASM)落盘 <appDataDir>/db
```

- **WebView 不是静态 dist**:`frontendDist` 指向 `placeholder-dist/`(Tauri 要求存在但从不显示);真实窗口在 `src/lib.rs` 的 `setup()` 里、等 sidecar 就绪(裸 TCP 探活)后动态建,`WebviewUrl::External(http://127.0.0.1:PORT)`。
- **端口**:每次随机空闲口(`TcpListener::bind(127.0.0.1:0)`),避免固定口冲突。
- **DB 落盘**:Rust `create_dir_all(<appDataDir>/db)` 后注入 `CREATOROS_DB_DIR`;`backend/src/db.ts` 的 `resolveDbDriver()` 认它 → PGlite 落这里(§3b)。
- **退出**:`RunEvent::ExitRequested` 时 `child.kill()` sidecar,防 orphan node(已验证退出后 0 orphan)。

## sidecar 二进制化(桌面化「唯一中风险」)—— 已打通 + 踩点记录

`scripts/desktop/build-sidecar.mjs`:
1. `CREATOROS_DESKTOP=1 next build` → `.next/standalone`(含 PGlite `postgres.wasm/.data`,被 output file tracing 自动带入)。
2. 组装 `src-tauri/sidecar/`:整包保留 `frontend/`+`backend/` 布局(deref 会拍平 → db.ts `../drizzle` 断链);补 `.next/static`+`public`;**verbatim 保留 pnpm 相对 symlink**;剪 `.pnpm/node_modules/` 冗余 hoist 层。
3. sidecar 可执行体 = **随包 node runtime 本体**(`binaries/creatoros-server-<triple>` = `process.execPath` 拷贝);co-ship node 依赖 dylib 到 `sidecar/lib/`。

**为何 node runtime 当 sidecar,而非 pkg/SEA 单 blob**:next standalone 依赖真实文件树(`server.js` + traced `node_modules` + PGlite 相对自身 `fs.readFile` 读 WASM),单 blob 快照放不进这套相对资产。Rust 侧把 `frontend/server.js` 绝对路径作 arg 传给该 node。

**踩过的坑(按顺序,都已修 + 落进脚本)**:
| 坑 | 现象 | 修法 |
|---|---|---|
| standalone 自引用 | `.next/standalone` 把 `src-tauri`(含 Rust `target/` 数百 MB)traced 进来,体积爆 + 拷贝踩权限 | `next.config.ts` `outputFileTracingExcludes: src-tauri/**` |
| drizzle 迁移丢失 | 运行时 500 `Can't find meta/_journal.json`(non-JS 数据文件不被 trace) | `outputFileTracingIncludes: ../backend/drizzle/**` + 整包保留 frontend/backend 布局 |
| node 动态链接 | sidecar 起不来 `Library not loaded: @rpath/libnode.127.dylib`(Homebrew node dylink) | co-ship dylib 到 `sidecar/lib/` + Rust 注入 `DYLD_LIBRARY_PATH` |
| pnpm hoist 层 dangling | `cargo build` 报 `.pnpm/node_modules/semver doesn't exist` | 剪除冗余 `node_modules/.pnpm/node_modules/`(runtime 不需) |
| deref 破坏 pnpm 解析 | `Cannot find module @swc/helpers`(物化后 next 拷贝丢了 .pnpm 里 peer 兄弟) | **不物化 symlink**,verbatim 保留;dev 从**源目录**读(symlink 完好) |
| appDataDir 首启不存在 | PGlite `ENOENT mkdir .../db` | Rust `create_dir_all` 先建父目录 |

## 命令(自动化,一键重跑)

```bash
# 只组装 sidecar(standalone build + 运行目录 + node runtime + dylib)
pnpm -C frontend desktop:build-sidecar

# dev:组装 sidecar 再起 Tauri 壳(读源目录 sidecar,symlink 完好;热调 Rust)
pnpm -C frontend desktop:dev        # = build-sidecar.mjs && tauri dev --config src-tauri/tauri.dev.conf.json

# 一键打未签名 .app/.dmg(全链:sidecar 二进制化 → tauri build)
pnpm -C frontend desktop:package    # = node scripts/desktop/package.mjs
```

业务代码改完 → 跑 `pnpm -C frontend desktop:package` 即可重出桌面包(不用手搓)。

## 验证证据(P1 达成)

直跑 `target/debug/creatoros-desktop`:sidecar `✓ Ready` ~3s → `GET / → HTTP 200`(61KB 真实 app HTML)→ `POST /api/v1/dispatch → HTTP 200`(合法契约 envelope)→ PGlite 落盘 30MB 到 `~/Library/Application Support/cloud.aitongban.creatoros/db`;WebKit WebContent 进程起(窗口渲染);退出 0 orphan。

## 诚实边界(P1 未做,留后续子项)

- **未签名 / 未公证**:codesign/notarize(mac)+ Authenticode(win)需**用户的证书**,本 P1 出**未签名** .app → 首次打开需右键「打开」绕 Gatekeeper。属 P6。
- **`tauri build` 打 .app 的 symlink 待验点**:sidecar 内含 180 个 pnpm 相对 symlink,dev/直跑从源目录读(完好)。`tauri build` 把 sidecar 打进 `.app` 时 Tauri resource 拷贝器**会丢 symlink**(已实测 dev 的 `target/debug/sidecar` 拷贝会丢)。故正式打包需换 **tar 打包 + 首次运行解压到 appDataDir**(tar 保 symlink),或让 Rust 优先读源/解压目录。**本 P1 不做该打包收尾**(dev 壳已完整验证);正式 `tauri build` 出成品是下一步。
- **Windows target**:`bundle.windows` + externalBin triple 位已留(`x86_64-pc-windows-msvc`),但 sidecar(node.exe + dylib)需在 **Windows 环境**跑 `build-sidecar.mjs` 产出,本机(macOS)不产。
- **CSP / capability**:P1 用宽松 `csp:null` + 最小 shell 能力,先保证壳能加载 sidecar UI;P2 收紧 deny-all + 精确白名单(参照 skills-manager 的 CSP)。
- **updater**:`plugin-updater` 未接(T-147 轻服务端更新走 P5);skills-manager 的 `bundle.createUpdaterArtifacts` + `plugins.updater{pubkey,endpoints}` 配法可直接借鉴。
- **本地加密(P2)/ 激活(P5)/ 混淆·Rust 化(P6)**:均不在 P1,底座为其预留。
