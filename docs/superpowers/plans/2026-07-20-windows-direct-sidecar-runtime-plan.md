# Windows Direct Sidecar Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Windows 安装后直接从用户选择的安装目录运行 sidecar，不再首启解压到 C 盘，并阻止重复启动造成并发破坏。

**Architecture:** 利用 Tauri 已支持的 `tauri.windows.conf.json` 平台叠加，把 Windows resource 从 `sidecar.tar.gz` 替换为展开后的 `sidecar/`；Rust 在 Windows 直接解析并校验该资源目录，macOS/Linux 继续使用 tar，但改成临时目录完成后原子切换。Tauri single-instance 必须作为第一个插件注册，第二次点击只聚焦已有窗口；Windows 启动后异步清理历史 `%APPDATA%/runtime` 缓存。

**Tech Stack:** Tauri 2.11、Rust、tauri-plugin-single-instance、Node.js ESM、Vitest、GitHub Actions、NSIS/MSI。

---

### Task 1: 锁定 Windows 平台资源契约

**Files:**
- Create: `frontend/scripts/desktop/windows-runtime-config.test.mjs`
- Modify: `frontend/src-tauri/tauri.windows.conf.json`
- Modify: `frontend/src-tauri/tauri.conf.json`

- [x] **Step 1: 写失败测试**

```js
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const readJson = (url) => JSON.parse(readFileSync(url, "utf8"));

describe("Windows sidecar resource contract", () => {
  it("Windows bundles expanded sidecar and never bundles the tarball", () => {
    const shared = readJson(new URL("../../src-tauri/tauri.conf.json", import.meta.url));
    const windows = readJson(new URL("../../src-tauri/tauri.windows.conf.json", import.meta.url));
    expect(shared.bundle.resources).toEqual(["sidecar.tar.gz"]);
    expect(windows.bundle.resources).toEqual(["sidecar/"]);
    expect(windows.bundle.resources).not.toContain("sidecar.tar.gz");
  });
});
```

- [x] **Step 2: 运行测试确认失败**

Run: `pnpm -C frontend exec vitest run scripts/desktop/windows-runtime-config.test.mjs`
Expected: FAIL，`windows.bundle.resources` 仍为 `undefined`。

- [x] **Step 3: 配置 Windows 专属展开资源**

在 `tauri.windows.conf.json` 的 `bundle` 中保留 `targets`，增加：

```json
"resources": ["sidecar/"]
```

共享配置继续只含 `sidecar.tar.gz`，保证 macOS 不重复携带展开目录。

- [x] **Step 4: 运行测试确认通过**

Run: `pnpm -C frontend exec vitest run scripts/desktop/windows-runtime-config.test.mjs`
Expected: 1 file passed。

### Task 2: Windows 构建停止生成 tar，并增加安装包硬闸

**Files:**
- Modify: `frontend/scripts/desktop/build-sidecar.mjs`
- Modify: `.github/workflows/desktop-release.yml`
- Test: `frontend/scripts/desktop/windows-runtime-config.test.mjs`

- [x] **Step 1: 扩展失败测试，锁定构建脚本不在 Windows 打 tar**

测试读取 `build-sidecar.mjs`，断言导出的 `shouldPackSidecarTarball("win32")` 为 `false`，`darwin` 为 `true`。

- [x] **Step 2: 导出平台判定并在 Windows 删除旧 tar 后直接返回**

```js
export function shouldPackSidecarTarball(targetPlatform = platform) {
  return targetPlatform !== "win32";
}
```

`packSidecarTarball()` 在 Windows 删除可能残留的 `src-tauri/sidecar.tar.gz`，打印“展开目录由安装包直接携带”，不调用 `tar.exe`。这同时消除 CI 中两次约 8 分钟的重复压缩。

- [x] **Step 3: 在 Windows workflow 加最终安装包内容检查**

在 Tauri 构建后、上传 artifact 前使用 runner 自带 `7z` 列出 NSIS 安装包，要求存在 `sidecar/frontend/server.js`，并拒绝任何 `sidecar.tar.gz`。检查失败必须终止构建。

- [x] **Step 4: 运行定向测试与语法检查**

Run: `pnpm -C frontend exec vitest run scripts/desktop/windows-runtime-config.test.mjs scripts/desktop/build-sidecar.test.mjs`
Expected: 全部通过。

Run: `node --check frontend/scripts/desktop/build-sidecar.mjs`
Expected: exit 0。

### Task 3: Rust 直接运行、单实例和安全迁移

**Files:**
- Modify: `frontend/src-tauri/Cargo.toml`
- Modify: `frontend/src-tauri/Cargo.lock`（由 Cargo 生成）
- Modify: `frontend/src-tauri/build.rs`
- Modify: `frontend/src-tauri/src/lib.rs`

- [x] **Step 1: 写失败单测**

在 `lib.rs` 测试模块增加：入口文件 SHA-256 正确通过、篡改拒绝；旧 runtime 根清理只删除 `runtime/`、不影响同级 `db/`；原子解压失败不产生最终 marker。

- [x] **Step 2: 构建期内嵌 Windows 入口哈希**

`build.rs` 除现有 tar SHA 外，计算 `sidecar/frontend/server.js`，注入 `CREATOROS_SIDECAR_ENTRY_SHA256`，并声明 `cargo:rerun-if-changed=sidecar/frontend/server.js`。

- [x] **Step 3: Windows 直接解析安装资源**

`resolve_sidecar_dir` 的 release Windows 分支解析 `BaseDirectory::Resource/sidecar`，校验 `frontend/server.js` 哈希及关键目录存在后直接返回，不创建 `%APPDATA%/runtime`，不 spawn `tar.exe`。

- [x] **Step 4: 清理旧 C 盘缓存**

Windows 直接资源验证成功后，后台 best-effort 删除 `<appDataDir>/runtime`。该目录按现有 `workspace_reset.rs` 定义只是可再生缓存；同级 `db/`、`.auth/`、`.master-key`、日志均不得触碰。

- [x] **Step 5: macOS/Linux 改为原子解压**

先解压到同级 `sidecar.extracting-<pid>`，校验 `frontend/server.js` 后写入 SHA stamp，再以 rename 切换到最终目录；任一步失败删除临时目录并返回 `Err`，不得继续 spawn 半成品。

- [x] **Step 6: 注册官方 single-instance 插件**

把 `tauri-plugin-single-instance` 作为 Builder 的第一个插件；第二次启动时 `show`、`unminimize`、`set_focus` 已有 `main` 窗口，随后第二实例退出。

- [x] **Step 7: Rust 验证**

Run: `cargo test --lib`（cwd `frontend/src-tauri`）
Expected: 全部通过。

Run: `cargo check --lib`（cwd `frontend/src-tauri`）
Expected: exit 0，仅允许已有 dead-code warning。

### Task 4: 全链验证与收尾

**Files:**
- Modify: `BACKLOG.md`
- Modify: `docs/superpowers/plans/2026-07-20-windows-direct-sidecar-runtime-plan.md`

- [x] **Step 1: 运行桌面定向测试**

Run: `pnpm -C frontend exec vitest run scripts/desktop/windows-runtime-config.test.mjs scripts/desktop/build-sidecar.test.mjs scripts/desktop/platform-paths.test.mjs`
Expected: 全部通过。

- [x] **Step 2: 运行静态与架构检查**

Run: `pnpm -C frontend exec eslint scripts/desktop/build-sidecar.mjs scripts/desktop/windows-runtime-config.test.mjs`
Expected: exit 0。

Run: `node orchestrator/process/boundary-scan.mjs`
Expected: 不新增违规。

Run: `git diff --check`
Expected: exit 0。

- [x] **Step 3: 标记 T-446 代码完成但保留 Windows 真机验收**

BACKLOG 写明：本地 Rust/配置测试通过；仍需一次 `only=windows` 的付费 GitHub Actions 证明 NSIS/MSI 真包含展开目录，并需用户干净安装验证不产生 C 盘 runtime、不再出现 tar.exe。

- [x] **Step 4: 只提交本任务文件**

显式暂存 T-446 相关文件，不包含工作区原有 `PROJECT.md` 与 `orchestrator/TASK_LEDGER.jsonl` 修改。

```bash
git commit -m "fix(desktop): run Windows sidecar from install directory"
```
